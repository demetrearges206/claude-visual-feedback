#!/usr/bin/env node
/*
 * claude-visual-feedback — dev server
 *
 * Serves a project's static files UNCHANGED, but when a page is requested with
 * ?comment=1 it injects the comment overlay (overlay.js) before </body>. The
 * overlay POSTs notes back to /__vf/comments, which we append to a comments
 * file that Claude reads. The target project is never modified on disk.
 *
 * Usage:
 *   node serve.js --root <dir-to-serve> --port 3000 --out comments.json
 *
 * --root defaults to the current working directory.
 * --out  is written relative to THIS tool dir (not --root), so the served
 *        project's tree stays clean.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const ROOT = path.resolve(arg('--root', process.cwd()));
const PORT = parseInt(arg('--port', '3000'), 10);
const OUT = path.resolve(__dirname, arg('--out', 'comments.json'));
const OVERLAY = path.join(__dirname, 'overlay.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(u.pathname);

  // --- comment collector API ---
  if (pathname === '/__vf/overlay.js') {
    return send(res, 200, fs.readFileSync(OVERLAY), MIME['.js']);
  }
  if (pathname === '/__vf/comments') {
    if (req.method === 'POST') {
      const raw = await readBody(req);
      let incoming = [];
      try { incoming = JSON.parse(raw); } catch { return send(res, 400, 'bad json'); }
      // Each Send REPLACES the file (no append) so stale comments from earlier
      // sends never pile up / masquerade as current.
      const batch = Array.isArray(incoming) ? incoming : [incoming];
      fs.writeFileSync(OUT, JSON.stringify(batch, null, 2));
      console.log(`= ${batch.length} comment(s) → ${OUT} (replaced)`);
      return send(res, 200, JSON.stringify({ ok: true, total: batch.length }), MIME['.json']);
    }
    if (req.method === 'GET') {
      let existing = '[]';
      try { existing = fs.readFileSync(OUT, 'utf8'); } catch {}
      return send(res, 200, existing, MIME['.json']);
    }
    if (req.method === 'DELETE') {
      try { fs.unlinkSync(OUT); } catch {}
      console.log('cleared comments');
      return send(res, 200, JSON.stringify({ ok: true }), MIME['.json']);
    }
  }

  // --- static files ---
  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(ROOT, rel);
  // prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const idx = path.join(filePath, 'index.html');
    if (fs.existsSync(idx)) filePath = idx;
    else return send(res, 404, 'not found: ' + rel);
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  // Inject overlay into HTML documents requested with ?comment=1
  if (ext === '.html' && u.searchParams.get('comment') === '1') {
    let html = fs.readFileSync(filePath, 'utf8');
    const tag = '<script src="/__vf/overlay.js"></script>';
    html = html.includes('</body>') ? html.replace('</body>', tag + '\n</body>') : html + tag;
    return send(res, 200, html, type);
  }

  send(res, 200, fs.readFileSync(filePath), type);
});

server.listen(PORT, () => {
  console.log(`claude-visual-feedback serving ${ROOT}`);
  console.log(`  → http://localhost:${PORT}/  (add ?comment=1 to any page for comment mode)`);
  console.log(`  → comments saved to ${OUT}`);
});
