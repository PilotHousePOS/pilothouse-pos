import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

async function main() {
  const file = './attached_assets/00c9276a-944d-4fd5-9c3a-e7f04803e3d1_1766191479576.pdf';
  try {
    const buf = fs.readFileSync(file);
    const data = await pdf(buf);
    console.log('Pages:', data.numpages);
    console.log('Text length:', data.text.length);
    console.log('Text preview:', data.text.substring(0, 300));
  } catch (err: any) {
    console.log('Error:', err.message);
    console.log('Stack:', err.stack);
  }
}
main();
