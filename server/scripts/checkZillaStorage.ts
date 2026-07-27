import { objectStorageClient } from '../objectStorageService';

async function main() {
  const bucket = objectStorageClient.bucket('replit-objstore-ddbe5d07-e2de-4814-a273-69f5047532db');
  const [files] = await bucket.getFiles({ prefix: 'public/products/zilla/', maxResults: 100 });
  console.log('=== Files in Object Storage (Zilla) ===');
  console.log('Total files found:', files.length);
  console.log('');
  let totalSize = 0;
  files.forEach(f => {
    const size = parseInt(String(f.metadata?.size || '0'));
    totalSize += size;
    console.log(`${f.name.replace('public/products/zilla/', '')} - ${size} bytes`);
  });
  console.log('');
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
