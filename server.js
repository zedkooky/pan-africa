'use strict';
// Local content editor + static server for the Panafrica site.
// Run:   PAD_ADMIN_PIN="choose-a-strong-pin" npm start
// The production site is static (see .github/workflows/deploy-ftp.yml); this server is for editing only.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const CONTENT = path.join(ROOT, 'content.json');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const PORT = Number(process.env.PORT || 3847);
const HOST = process.env.HOST || '127.0.0.1';   // local only unless you opt in
const MAX_JSON = 1024 * 1024;                   // 1 MB
const MAX_UPLOAD = 8 * 1024 * 1024;             // 8 MB

let ADMIN_PIN = process.env.PAD_ADMIN_PIN || '';
if (ADMIN_PIN.length < 6) {
  ADMIN_PIN = crypto.randomBytes(4).toString('hex');
  console.log('PAD_ADMIN_PIN not set (or shorter than 6 characters). Temporary PIN for this session: ' + ADMIN_PIN);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8'
};
// Only these top-level paths are ever served
const PUBLIC_FILES = new Set(['index.html', 'team.html', 'admin.html', 'content.json', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'PAD-Logo.png']);
const PUBLIC_DIRS = ['assets', 'icons', 'js'];
const IMAGE_MAGIC = [
  ['.jpg', Buffer.from([0xff, 0xd8, 0xff])], ['.jpeg', Buffer.from([0xff, 0xd8, 0xff])],
  ['.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])], ['.gif', Buffer.from('GIF8')], ['.webp', Buffer.from('RIFF')]
];

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store'
};

function send(res, code, body, type) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8' }, SEC_HEADERS));
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    const chunks = []; let size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

// ---- PIN check with constant-time compare and per-IP throttling ----
const fails = new Map();
function throttled(ip) {
  const rec = fails.get(ip);
  return !!rec && rec.count >= 5 && Date.now() - rec.first < 60000;
}
function noteFail(ip) {
  const rec = fails.get(ip);
  if (!rec || Date.now() - rec.first >= 60000) fails.set(ip, { count: 1, first: Date.now() });
  else rec.count++;
}
function pinOk(candidate) {
  const a = crypto.createHash('sha256').update(String(candidate || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PIN).digest();
  return crypto.timingSafeEqual(a, b);
}
function authorize(req, res) {
  const ip = req.socket.remoteAddress || '';
  if (throttled(ip)) { json(res, 429, { error: 'Too many attempts. Wait a minute.' }); return false; }
  if (!pinOk(req.headers['x-admin-pin'])) { noteFail(ip); json(res, 401, { error: 'Wrong PIN' }); return false; }
  return true;
}

function safeName(name, ext) {
  const stem = path.basename(String(name || 'upload'), path.extname(String(name || ''))).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'file';
  return stem + '-' + crypto.randomBytes(4).toString('hex') + ext;
}

function resolvePublic(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, ''); } catch (e) { return null; }
  if (rel.indexOf('\0') !== -1 || rel.split('/').some(function (p) { return p.startsWith('.'); })) return null;
  const top = rel.split('/')[0];
  if (!(PUBLIC_FILES.has(rel) || (rel.indexOf('/') !== -1 && PUBLIC_DIRS.indexOf(top) !== -1))) return null;
  const full = path.resolve(ROOT, rel);
  const within = path.relative(ROOT, full);
  if (within.startsWith('..') || path.isAbsolute(within)) return null;
  return full;
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && p === '/api/login') {
    const ip = req.socket.remoteAddress || '';
    if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Wait a minute.' });
    try {
      const body = JSON.parse((await readBody(req, 2048)).toString('utf8'));
      if (pinOk(body.pin)) return json(res, 200, { ok: true });
    } catch (e) { /* fall through */ }
    noteFail(ip);
    return json(res, 401, { error: 'Wrong PIN' });
  }

  if (req.method === 'GET' && p === '/api/content') {
    try {
      const data = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
      delete data.settings;
      return json(res, 200, data);
    } catch (e) { return json(res, 404, { error: 'content.json missing' }); }
  }

  if (req.method === 'PUT' && p === '/api/content') {
    if (!authorize(req, res)) return;
    try {
      const body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad');
      delete body.settings;                     // the PIN never lives in content
      body.updatedAt = new Date().toISOString();
      fs.writeFileSync(CONTENT, JSON.stringify(body, null, 2) + '\n');
      return json(res, 200, { ok: true, updatedAt: body.updatedAt });
    } catch (e) { return json(res, 400, { error: 'Invalid JSON' }); }
  }

  if (req.method === 'POST' && p === '/api/upload') {
    if (!authorize(req, res)) return;
    try {
      const payload = JSON.parse((await readBody(req, MAX_UPLOAD * 1.4)).toString('utf8'));
      const buf = Buffer.from(String(payload.data || ''), 'base64');
      if (!buf.length || buf.length > MAX_UPLOAD) throw new Error('size');
      const ext = path.extname(String(payload.filename || '')).toLowerCase();
      const magic = IMAGE_MAGIC.find(function (m) { return m[0] === ext; });
      if (!magic || buf.compare(magic[1], 0, magic[1].length, 0, magic[1].length) !== 0) throw new Error('type');
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const name = safeName(payload.filename, ext);
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return json(res, 200, { path: 'assets/uploads/' + name });
    } catch (e) { return json(res, 400, { error: 'Upload failed: images only (jpg, png, gif, webp), max 8 MB' }); }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  if (p === '/content.json') {   // same stripped view as the API
    try { const d = JSON.parse(fs.readFileSync(CONTENT, 'utf8')); delete d.settings; return json(res, 200, d); }
    catch (e) { return send(res, 404, 'Not found'); }
  }
  const filePath = resolvePublic(p);
  if (!filePath) return send(res, 404, 'Not found');
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream' }, SEC_HEADERS));
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, function () {
  console.log('Panafrica editor running at http://' + HOST + ':' + PORT + '/');
  console.log('Editor: http://' + HOST + ':' + PORT + '/admin.html');
});
