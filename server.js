'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const CONTENT = path.join(ROOT, 'content.json');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const PORT = Number(process.env.PORT || 3847);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function loadPin() {
  try {
    const data = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
    return (data.settings && data.settings.adminPin) || 'panafrica';
  } catch (e) {
    return 'panafrica';
  }
}

function checkPin(req) {
  return (req.headers['x-admin-pin'] || '') === loadPin();
}

function safeName(name) {
  const base = path.basename(String(name || 'upload')).replace(/[^a-zA-Z0-9._-]/g, '-');
  const ext = path.extname(base).toLowerCase() || '.bin';
  const stem = path.basename(base, ext).slice(0, 40) || 'file';
  return stem + '-' + crypto.randomBytes(4).toString('hex') + ext;
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
  }

  if (req.method === 'GET' && url.pathname === '/api/content') {
    try {
      const raw = fs.readFileSync(CONTENT, 'utf8');
      return send(res, 200, raw, 'application/json; charset=utf-8');
    } catch (e) {
      return send(res, 404, JSON.stringify({ error: 'content.json missing' }), 'application/json; charset=utf-8');
    }
  }

  if (req.method === 'PUT' && url.pathname === '/api/content') {
    if (!checkPin(req)) return send(res, 401, JSON.stringify({ error: 'Wrong PIN' }), 'application/json; charset=utf-8');
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      body.updatedAt = new Date().toISOString();
      fs.writeFileSync(CONTENT, JSON.stringify(body, null, 2));
      return send(res, 200, JSON.stringify({ ok: true, updatedAt: body.updatedAt }), 'application/json; charset=utf-8');
    } catch (e) {
      return send(res, 400, JSON.stringify({ error: 'Invalid JSON' }), 'application/json; charset=utf-8');
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    if (!checkPin(req)) return send(res, 401, JSON.stringify({ error: 'Wrong PIN' }), 'application/json; charset=utf-8');
    try {
      const payload = JSON.parse((await readBody(req)).toString('utf8'));
      const buf = Buffer.from(payload.data || '', 'base64');
      if (!buf.length) throw new Error('empty');
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const name = safeName(payload.filename);
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return send(res, 200, JSON.stringify({ path: 'assets/uploads/' + name }), 'application/json; charset=utf-8');
    } catch (e) {
      return send(res, 400, JSON.stringify({ error: 'Upload failed' }), 'application/json; charset=utf-8');
    }
  }

  let filePath = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, function () {
  console.log('Panafrica CMS running at http://localhost:' + PORT + '/');
  console.log('Editor: http://localhost:' + PORT + '/admin.html');
});
