/**
 * Zero-dependency static file server using Node's built-in http module.
 *
 * Run:
 *   node server.js
 */

import {readFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = import.meta.dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    const relativePath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(ROOT, relativePath);

    // Prevent directory traversal outside ROOT.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'});
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500);
    res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Static server listening at http://localhost:${PORT}`);
});
