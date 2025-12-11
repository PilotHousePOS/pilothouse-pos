import { ObjectStorageService, objectStorageClient } from '../objectStorageService';

async function test() {
  try {
    const objectStorageService = new ObjectStorageService();
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    console.log('Public paths:', publicPaths);
    
    const bucketPath = publicPaths[0];
    const pathParts = bucketPath.split('/').filter(Boolean);
    const bucketName = pathParts[0];
    const prefix = pathParts.slice(1).join('/');
    
    console.log('Bucket name:', bucketName);
    console.log('Prefix:', prefix);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: `${prefix}/products/zilla/`, maxResults: 10 });
    console.log('Files found:', files.length);
    for (const f of files) {
      const [metadata] = await f.getMetadata();
      console.log(' -', f.name, metadata.size + ' bytes', 'contentType:', metadata.contentType);
    }
  } catch(e) {
    console.error('Error:', e);
  }
}
test();
