import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// region static-page-server
const page = await readFile(new URL('../web/telegram-status.html', import.meta.url));
createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : page);
}).listen(8766, '127.0.0.1');
// endregion static-page-server
