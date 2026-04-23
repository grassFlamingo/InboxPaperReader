const db = require('./src/db/database');
const { PaperMetadataFetcher } = require('./src/services/metadataFetch');

db.connect();

async function fetchAuthors() {
  const papers = db.queryAll('SELECT id, arxiv_id FROM papers WHERE arxiv_id IS NOT NULL AND LENGTH(arxiv_id) > 3');
  console.log('Processing', papers.length, 'papers');

  let count = 0;
  for (const p of papers) {
    console.log('Fetching:', p.arxiv_id);
    const meta = await PaperMetadataFetcher.fetch(p.arxiv_id);
    if (meta && meta.authors) {
      console.log('  Authors:', meta.authors);
      db.run('UPDATE papers SET authors = ? WHERE id = ?', [meta.authors, p.id]);
      db.run('DELETE FROM paper_authors WHERE paper_id = ?', [p.id]);
      const authorList = meta.authors.split(',').map(a => a.trim()).filter(Boolean);
      authorList.forEach((name, idx) => {
        db.run('INSERT INTO paper_authors (paper_id, author_name, author_order) VALUES (?, ?, ?)', [p.id, name, idx]);
      });
      console.log('  Saved', authorList.length, 'authors for paper', p.id);
      count++;
    }
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }
  console.log('Done! Processed', count, 'papers');
}

fetchAuthors().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});