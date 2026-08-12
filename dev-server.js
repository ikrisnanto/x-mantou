/* Local dev server.
 *
 * Serves dist/ and accepts POST /__save-assumptions, which writes
 * src/dashboard/assumptions.js and rebuilds so a reload shows the saved state.
 *
 * Local only, and deliberately not part of the deployed site: the production
 * Pages Functions have no such route, so the panel there falls back to
 * Copy/Download and no visitor can write to the model.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const ASSUMPTIONS = join(root, 'src', 'dashboard', 'assumptions.js');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function rebuild() {
  execFileSync(process.execPath, [join(root, 'build.js')], { stdio: 'pipe' });
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__save-assumptions') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const { source } = JSON.parse(body);
        if (typeof source !== 'string' || !source.includes('const FIXED')) {
          throw new Error('payload does not look like assumptions.js');
        }
        // Keep a one-step undo next to the file being overwritten.
        if (existsSync(ASSUMPTIONS)) {
          writeFileSync(ASSUMPTIONS + '.bak', readFileSync(ASSUMPTIONS));
        }
        writeFileSync(ASSUMPTIONS, source);
        rebuild();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        console.log('saved assumptions.js and rebuilt');
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = resolve(join(dist, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
});

// Bound to loopback only: the save route writes to the repo, so it must not be
// reachable from anywhere else on the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev server  http://localhost:${PORT}`);
  console.log('editing assumptions in the page and pressing Save writes src/dashboard/assumptions.js');
});
