// Local Pengbit server with no Vercel CLI: serves app/ and runs app/api/*.js like Vercel does.
// Usage (from the repo root):  npm install   then   node dev-server.mjs   then open http://localhost:3000
// Keys go in .env.local at the repo root (never commit it), one per line, e.g. ELEVENLABS_API_KEY=...
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ROOT, 'app');
const PORT = Number(process.env.PORT || 3000);

// ---- .env.local / .env (simple KEY=value lines; existing env wins)
// Also accepts .env.local.txt, which Windows Notepad creates when "Save as type" is left on Text Documents.
const envFiles = [];
for (const name of ['.env.local', '.env.local.txt', '.env', '.env.txt']) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  envFiles.push(name);
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.mp3': 'audio/mpeg', '.txt': 'text/plain',
};

// ---- Vercel-style req/res helpers
function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => {
    if (body == null) return res.end();
    if (Buffer.isBuffer(body) || typeof body === 'string') return res.end(body);
    return res.json(body);
  };
  return res;
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  if ((req.headers['content-type'] || '').includes('application/json')) { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length).replace(/\/+$/, '');
  if (!/^[a-z0-9-]+$/i.test(name)) return res.status(404).json({ error: 'not found' });
  const file = path.join(APP, 'api', name + '.js');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  try {
    const mod = await import(pathToFileURL(file).href);
    await mod.default(req, res);
  } catch (e) {
    console.error(`[api/${name}]`, e);
    if (!res.headersSent) res.status(500).json({ error: 'server error', detail: String(e?.message || e) });
  }
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.startsWith('/app/')) rel = rel.slice(4);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(APP, rel));
  if (!file.startsWith(APP)) return res.status(403).end();
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return res.status(404).send('not found');
    res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  wrapRes(res);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`\nPengbit running at http://localhost:${PORT}\n`);
  console.log(`  key file: ${envFiles.length ? envFiles.join(', ') : 'NONE FOUND in ' + ROOT}`);
  const has = (k) => (process.env[k] ? 'set' : 'MISSING');
  console.log(`  ELEVENLABS_API_KEY  ${has('ELEVENLABS_API_KEY')}`);
  console.log(`  ELEVENLABS_AGENT_ID ${has('ELEVENLABS_AGENT_ID')}`);
  console.log(`  ANTHROPIC_API_KEY   ${has('ANTHROPIC_API_KEY')}\n`);
  selfTest();
});

// Tells you right away if this network blocks the AI services (e.g. school Wi-Fi intercepting TLS).
async function selfTest() {
  for (const [label, url] of [['ElevenLabs', 'https://api.elevenlabs.io/v1/models'], ['Anthropic', 'https://api.anthropic.com/v1/models']]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(8000) });
      console.log(`  network: ${label} reachable`);
    } catch (e) {
      const why = String(e?.cause?.code || e?.cause?.message || e?.message || e);
      console.log(`  network: ${label} NOT reachable (${why})`);
    }
  }
  console.log('');
}
