/** Minimal static file server for tests (no dependencies). */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** @returns {Promise<{ server: http.Server, origin: string }>} */
export function startServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = path.join(root, path.normalize(pathname));
        if (!file.startsWith(root)) {
          res.writeHead(403).end();
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}
