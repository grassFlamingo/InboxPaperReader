const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');

/**
 * @typedef {Object} DetectionOptions
 * @property {string} modelPath - Path to ONNX model
 * @property {number} modelSize - Model input size (default 640)
 * @property {number} scoreThreshold - Score threshold for detections
 * @property {string} outputDir - Output directory for results
 */

/**
 * @typedef {Object} PreprocessResult
 * @property {Float32Array} tensor - Normalized tensor for model input
 * @property {number} width - Model input width
 * @property {number} height - Model input height
 * @property {Float32Array} scaleData - Scale factor for coordinate transformation
 * @property {number} originalWidth - Original image width
 * @property {number} originalHeight - Original image height
 * @property {number} resizeRatio - Resize ratio
 * @property {number} resizeWidth - Width after resize
 * @property {number} resizeHeight - Height after resize
 */

/**
 * @typedef {Object} DetectionResult
 * @property {number} classId - Class ID
 * @property {string} className - Class name
 * @property {number} confidence - Confidence score
 * @property {Object} bbox - Bounding box
 * @property {number} bbox.x1
 * @property {number} bbox.y1
 * @property {number} bbox.x2
 * @property {number} bbox.y2
 * @property {number[]} color - RGB color
 */

const DEFAULT_DETECTION_OPTIONS = {
  modelSize: 640,
  scoreThreshold: 0.3,
};

const LAYER_CLASSES = [
  'paragraph_title', 'image', 'text', 'number', 'abstract', 'content',
  'figure_title', 'formula', 'table', 'table_title', 'reference', 'doc_title',
  'footnote', 'header', 'algorithm', 'footer', 'seal', 'chart_title', 'chart',
  'formula_number', 'header_image', 'footer_image', 'aside_text'
];

const COLORS = [
  [255, 107, 107], [78, 205, 196], [69, 183, 209], [150, 206, 180], [255, 234, 167],
  [221, 160, 221], [152, 216, 200], [247, 220, 111], [187, 143, 206], [133, 193, 233],
  [248, 181, 0], [88, 214, 141], [93, 109, 126], [236, 112, 99], [175, 122, 165],
  [72, 201, 176], [243, 156, 18], [231, 76, 60], [155, 89, 182], [26, 188, 156],
  [52, 152, 219], [230, 126, 34]
];

const MEAN_IMAGE = [0.485, 0.456, 0.406];
const STD_IMAGE = [0.229, 0.224, 0.225];


function norm_func(x, c) {
  return (x / 255.0 - MEAN_IMAGE[c]) / STD_IMAGE[c];
}

async function imageToTensor(image) {
  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 3) {
    throw new Error('Only RGB images are supported');
  }

  const tensorData = new Float32Array(channels * height * width);
  
  let idx = 0;
  for (let c = 0; c < channels; c++) {
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const srcIdx = (h * width + w) * channels + c;
        tensorData[idx++] = norm_func(data[srcIdx], c);
      }
    }
  }
  
  return { tensorData, width, height };
}

/**
 * Base service for document layout detection
 */
class BaseLayoutDetectionService {
  /**
   * @param {Partial<DetectionOptions>} options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_DETECTION_OPTIONS, ...options };

    this.modelPath = this.options.modelPath ||
      path.join(__dirname, 'onnx/PP-DocLayout-M_infer/inference.onnx');
    this.modelSize = this.options.modelSize;
    this.scoreThreshold = this.options.scoreThreshold;
    this.session = null;
  }

  /**
   * Initialize the detection service
   * @returns {Promise<this>}
   */
  async initialize() {
    const modelBuffer = fs.readFileSync(this.modelPath);
    this.session = await ort.InferenceSession.create(modelBuffer);
    return this;
  }

  /**
   * Log message if verbose mode
   * @param {string} message
   */
  log(message) {
    console.log(`[DetectionService] ${message}`);
  }

  /**
   * Preprocess image for detection using Sharp
   * @param {Buffer} imageBuffer
   * @returns {Promise<PreprocessResult>}
   */
  async preprocess(imageBuffer) {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const maxSlideLen = this.modelSize;

    const resizeW = maxSlideLen / metadata.width;
    const resizeH = maxSlideLen / metadata.height;

    // Resize keeping aspect ratio, then composite onto white background to pad to 640x640
    const resizedImage = await image
      .resize(maxSlideLen, maxSlideLen, { 
        // fit: 'contain',
        fit: 'fill', // ignore ratio
        position: 'centre',
      });

    // await resizedImage.toFile('./resized.png', (err) => {
    //   if (err) throw err;
    //   console.log('File saved!');
    // });

    const tensorResult = await imageToTensor(resizedImage);
    const scaleData = new Float32Array([resizeH, resizeW]);

    return {
      data: tensorResult.tensorData,
      width: tensorResult.width,
      height: tensorResult.height,
      scaleData,
      maxSlideLen,
    };
  }

/**
   * Postprocess detection results
   * @param {Float32Array} detections
   * @param {number} count
   * @param {PreprocessResult} input
   * @returns {DetectionResult[]}
   */
  postprocess(detections, count, input) {
    const { data, width, height, scaleData, maxSlideLen } = input;
    const results = [];

    for (let j = 0; j < count; j++) {
      const d = detections.data.slice(j * 6, j * 6 + 6);
      const classId = Math.floor(d[0]);
      const confidence = d[1];

      if (confidence < this.scoreThreshold) continue;
      if (classId >= LAYER_CLASSES.length) continue;

      results.push({
        classId,
        label: LAYER_CLASSES[classId],
        confidence,
        bbox: { x1: d[2], y1: d[3], x2: d[4], y2: d[5] },
        color: COLORS[classId] || [0, 0, 0],
      });
    }

    this.log(`Postprocessed: ${results.length} detections`);

    return results;
  }

  /**
   * Main method to run detection on an image
   * @param {Buffer} imageBuffer
   * @returns {Promise<DetectionResult[]>}
   */
  async detect(imageBuffer) {
    if (!this.session) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const input = await this.preprocess(imageBuffer);

    const feeds = {
      'image': new ort.Tensor(input.data, [1, 3, input.height, input.width]),
      'scale_factor': new ort.Tensor(input.scaleData, [1, 2])
    };

    const results = await this.session.run(feeds);
    const detections = results['fetch_name_0'];
    const count = results['fetch_name_1'].data[0];

    return this.postprocess(detections, count, input);
  }
}

/**
 * Service for visualizing detection results using Canvas
 */
class LayoutVisualizationService {
  /**
   * Visualize detections on an image buffer
   * @param {Buffer} imageBuffer
   * @param {DetectionResult[]} detections
   * @returns {Promise<Buffer>}
   */
  static async visualize(imageBuffer, detections) {
    // Load image into canvas
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(image, 0, 0);

    // Draw all bounding boxes
    for (const det of detections) {
      const { x1, y1, x2, y2 } = det.bbox;

      // Draw rectangle
      ctx.strokeStyle = `rgb(${det.color[0]},${det.color[1]},${det.color[2]})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw label
      ctx.fillStyle = `rgb(${det.color[0]},${det.color[1]},${det.color[2]})`;
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(det.label, x1, y1 - 5);
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Write legend file
   * @param {string} outputDir
   * @returns {string}
   */
  static writeLegend(outputDir) {
    const legendPath = path.join(outputDir, 'legend.txt');
    let legendText = 'Layout Class Legend:\n====================\n';

    LAYER_CLASSES.forEach((name, id) => {
      const color = COLORS[id];
      if (color) {
        const hex = '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');
        legendText += `${id}: ${name} (${hex})\n`;
      }
    });

    fs.writeFileSync(legendPath, legendText);
    return legendPath;
  }
}

/**
 * Main analyzer class that orchestrates PDF processing
 */
class LayoutAnalysisService {
  /**
   * @param {Partial<DetectionOptions>} options
   */
  constructor(options = {}) {
    this.detectionService = new BaseLayoutDetectionService(options);
    this.outputDir = options.outputDir || 'output_layout';
  }

  /**
   * Process a PDF file
   * @param {string} pdfPath
   * @returns {Promise<this>}
   */
  async processPdf(pdfPath) {
    console.log('[Analyzer] Loading PDF:', pdfPath);

    await this.detectionService.initialize();
    console.log('[Analyzer] Model initialized');

    const { pdfToPng } = await import('pdf-to-png-converter');
    const pages = await pdfToPng(pdfPath, { dpi: 150 });
    console.log('[Analyzer] Got', pages.length, 'pages');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    for (let i = 0; i < pages.length; i++) {
      console.log(`[Analyzer] Processing page ${i + 1}/${pages.length}...`);

      const detections = await this.detectionService.detect(pages[i].content);
      console.log(`[Analyzer]   Detections: ${detections.length}`);

      const visualized = await LayoutVisualizationService.visualize(
        pages[i].content,
        detections
      );

      const outputPath = path.join(
        this.outputDir,
        `page_${String(i + 1).padStart(2, '0')}.png`
      );

      fs.writeFileSync(outputPath, visualized);
      console.log(`[Analyzer]   Saved: ${outputPath}`);
    }

    console.log(`\n[Analyzer] All ${pages.length} pages processed`);
    LayoutVisualizationService.writeLegend(this.outputDir);
    console.log(`[Analyzer] Legend saved to: ${this.outputDir}/legend.txt`);

    return this;
  }
}

async function main() {
  const pdfPath = path.join(__dirname, 'cache/papers/' + process.argv[2]);
  const outputDir = process.argv[3] || 'output_layout';

  if (!fs.existsSync(pdfPath)) {
    console.error('[Error] PDF not found:', pdfPath);
    process.exit(1);
  }

  const analyzer = new LayoutAnalysisService({ outputDir });
  await analyzer.processPdf(pdfPath);

  process.exit(0);
}

main().catch(e => {
  console.error('[Error]', e.message, e.stack);
  process.exit(1);
});
