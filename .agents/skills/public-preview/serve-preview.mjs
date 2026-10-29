import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Usage: node serve-preview.mjs <exported-html>');

createServer((request, response) => {
  const pathname = (request.url ?? '/').split('?')[0];
  if (pathname !== '/' && pathname !== '/s01e04-review.html') {
    response.writeHead(404).end('not found');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const html = readFileSync(file);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': html.length,
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch {
    response.writeHead(500).end('preview unavailable');
  }
}).listen(8788, '127.0.0.1', () => {
  console.log('single-file preview: http://127.0.0.1:8788/s01e04-review.html');
});
