// Test helpers: a Jekyll build like GitHub Pages', a tiny static server for it and a Chromium launcher.
// Every page uses Jekyll layouts now, so the tests always serve the built site.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
};

function startServer(root = buildSite()) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) });
  }));
}

// Playwright's own Chromium (npx playwright install chromium), or the one at $CHROMIUM if set.
function launch() {
  return chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
}

// The site as GitHub Pages publishes it: Jekyll 3.10 (the version Pages runs) builds the blog's posts and pages and
// copies every other file as it is. Set JEKYLL to the jekyll command if it isn't on the PATH.
function jekyll() {
  const tries = [process.env.JEKYLL, 'jekyll', '/opt/rbenv/versions/3.3.6/bin/jekyll'].filter(Boolean);
  for (const cmd of tries) {
    try { execFileSync(cmd, ['-v'], { stdio: 'pipe' }); return cmd; } catch (e) { /* the next one */ }
  }
  throw new Error('The tests need Jekyll 3.10: gem install "jekyll:3.10.0" kramdown-parser-gfm (or set JEKYLL)');
}

let built = null;
function buildSite() {
  if (built) return built;
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'heurastudios-site-'));
  execFileSync(jekyll(), ['build', '--source', ROOT, '--destination', dest, '--quiet'], { stdio: 'pipe' });
  built = dest;
  return dest;
}

// A screenshot's pixels: a PNG as Playwright takes one (8 bits a channel, RGB or RGBA, not interlaced), decoded with
// nothing but zlib -> { width, height, rgb(x, y) -> [r, g, b] }
function readPng(buf) {
  const zlib = require('node:zlib');
  let pos = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      [width, height, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9]];
      if (data[8] !== 8 || data[12] !== 0) throw new Error('readPng: 8-bit, non-interlaced PNGs only');
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type];
  if (!bpp) throw new Error(`readPng: color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * bpp, px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {   // each row's filter undone (PNG spec, 9.2)
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
  }
  return { width, height, rgb: (x, y) => { const o = y * stride + x * bpp; return [px[o], px[o + 1], px[o + 2]]; } };
}

module.exports = { startServer, launch, buildSite, readPng, ROOT };
