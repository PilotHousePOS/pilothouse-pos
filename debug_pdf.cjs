const fs = require('fs');

async function main() {
  const pdfParse = (await import('pdf-parse')).default;
  
  const file = './attached_assets/00c9276a-944d-4fd5-9c3a-e7f04803e3d1_1766191479576.pdf';
  const dataBuffer = fs.readFileSync(file);
  console.log('File size:', dataBuffer.length);
  
  try {
    const data = await pdfParse(dataBuffer);
    console.log('Success! Pages:', data.numpages);
    console.log('Text preview:', data.text.substring(0, 500));
  } catch (err) {
    console.log('Error:', err);
  }
}

main();
