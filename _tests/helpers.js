// Test helpers: a tiny static server for the site folder (or the site as Jekyll builds it), a Jekyll build like
// GitHub Pages' and a Chromium launcher.
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

function startServer(root = ROOT) {
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

function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}

// The site as GitHub Pages publishes it: Jekyll 3.10 (the version Pages runs) builds the blog's posts and pages and
// copies every other file as it is. Set JEKYLL to the jekyll command if it isn't on the PATH.
function jekyll() {
  const tries = [process.env.JEKYLL, 'jekyll', '/opt/rbenv/versions/3.3.6/bin/jekyll'].filter(Boolean);
  for (const cmd of tries) {
    try { execFileSync(cmd, ['-v'], { stdio: 'pipe' }); return cmd; } catch (e) { /* the next one */ }
  }
  throw new Error('The blog tests need Jekyll 3.10: gem install jekyll -v 3.10.0 kramdown-parser-gfm (or set JEKYLL)');
}

let built = null;
function buildSite() {
  if (built) return built;
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'heurastudios-site-'));
  execFileSync(jekyll(), ['build', '--source', ROOT, '--destination', dest, '--quiet'], { stdio: 'pipe' });
  built = dest;
  return dest;
}

module.exports = { startServer, launch, buildSite, ROOT };
