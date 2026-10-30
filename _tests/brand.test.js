// The name is Heura Studios (Ryan, Oct 13, 2026: every logo, tab title, page text and both legal documents), and the
// footer no longer says "Made by Ostravanne." (the copyright line stays).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, ROOT } = require('./helpers');

const OLD = /Heura Studio(?!s)/;
const PAGES = ['/', '/tools/', '/waitlist/', '/privacy/', '/terms/'];
const SERVED = ['index.html', 'waitlist/index.html', 'privacy/index.html', 'terms/index.html', 'site.css', 'site.js',
  'legal.css', 'waitlist/waitlist.js', 'home.css', 'home.js', 'form.js', '_includes/head.html', '_includes/header.html',
  '_includes/footer.html', '_includes/logo.html', '_data/tools.yml', 'tools/index.html', 'tools.css', 'tools.js', 'recording.js'];

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

test('no served page, script or style uses the old name', () => {
  for (const file of SERVED) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = text.match(OLD);
    assert.equal(m, null, `${file}: …${m && text.slice(Math.max(0, m.index - 60), m.index + 20)}…`);
    assert.doesNotMatch(text, /Heura Studios[’']s/, `${file}: say "in Heura Studios" instead`);
  }
});

test('every page: the logo reads Heura Studios in the header and the footer, and the tab title ends with it', async () => {
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(server.url + p);
    assert.deepEqual(await page.locator('.ov-logo').allTextContents(), ['Heura Studios', 'Heura Studios'], p);
    assert.match(await page.title(), /Heura Studios$/, p);
    const meta = await page.locator('meta[name="description"], meta[property^="og:"]').evaluateAll(
      els => els.map(e => e.getAttribute('content')).join(' | '));
    assert.doesNotMatch(meta, OLD, p);
    await ctx.close();
  }
});

test('the footer no longer says Made by Ostravanne; the copyright line stays', async () => {
  for (const p of PAGES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.url + p);
    const foot = await page.locator('footer').innerText();
    assert.doesNotMatch(foot, /Made by Ostravanne/, p);
    assert.match(foot, /© 2026 Ostravanne/, p);
    assert.equal(await page.locator('.ov-foot-by').count(), 0, p);
    await ctx.close();
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'site.css'), 'utf8'), /\.ov-foot-by/, 'its style went with it');
});
