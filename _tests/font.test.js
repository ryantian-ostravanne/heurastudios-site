// Every word in Cantarell (Ryan, Oct 19, 2026: "can you also change the font of the website using cantarell", and he
// chose everywhere, headlines too): Cantarell from Google Fonts in the two weights it has, 400 and 700, upright and
// italic (the posts use italics), in place of Archivo for the text and Newsreader for the headlines and leads. --sans
// and --serif both name it, so every rule gets it whichever one it picks. Code in a post stays monospace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, buildSite, ROOT } = require('./helpers');

const FAMILY = 'Cantarell:ital,wght@0,400;0,700;1,400;1,700';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// the repo's files that make the site: pages, layouts, posts, styles, scripts and the config (not these tests)
function files(rel = '') {
  const out = [];
  for (const name of fs.readdirSync(path.join(ROOT, rel))) {
    if (name === '.git' || name === '_tests' || name === 'node_modules') continue;
    const r = path.join(rel, name);
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) out.push(...files(r));
    else if (/\.(html|css|js|md|yml)$/.test(name)) out.push(r);
  }
  return out;
}

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

test('every page and layout asks Google Fonts for Cantarell, 400 and 700, upright and italic, and for nothing else', () => {
  const pages = files().filter(f => f.endsWith('.html') && /<head>/.test(read(f)));
  for (const f of ['index.html', 'waitlist/index.html', 'privacy/index.html', 'terms/index.html', '_layouts/base.html']) {
    assert.ok(pages.includes(path.normalize(f)), `${f} is a page with a head`);
  }
  for (const f of pages) {
    const html = read(f);
    const links = [...html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]*)">/g)]
      .map(m => new URL(m[1]));
    assert.equal(links.length, 1, `${f}: one Google Fonts stylesheet`);
    assert.deepEqual(links[0].searchParams.getAll('family'), [FAMILY], f);
    assert.equal(links[0].searchParams.get('display'), 'swap', `${f}: the words show while the font loads`);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/, f);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/, f);
  }
});

test('no page, layout, post, style or script names Archivo or Newsreader, or the width and optical-size axes they had', () => {
  for (const f of files()) {
    const text = read(f);
    for (const old of [/Archivo/i, /Newsreader/i, /\bwdth\b/, /\bopsz\b/, /font-stretch/, /font-variation-settings/,
      /font-optical-sizing/]) {
      const m = text.match(old);
      assert.equal(m, null, `${f}: …${m && text.slice(Math.max(0, m.index - 60), m.index + 30)}…`);
    }
  }
});

test('--sans and --serif in site.css are both Cantarell, with the same fallbacks', () => {
  const css = read('site.css');
  const token = name => (css.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1] || '';
  assert.match(token('sans'), /^"Cantarell", /, '--sans');
  assert.match(token('serif'), /^"Cantarell", /, '--serif');
  assert.equal(token('serif'), token('sans'), 'a headline that can’t get Cantarell falls back to what the text does');
  assert.match(token('sans'), /, sans-serif$/);
});

test('every weight the styles ask for is one Cantarell has, 400 or 700, so what the CSS says is what shows', () => {
  const sheets = files().filter(f => f.endsWith('.css'));
  assert.ok(sheets.length >= 4, sheets.join(', '));
  for (const f of sheets) {
    for (const [, value] of read(f).matchAll(/font-weight:\s*([^;}\s]+)/g)) {
      assert.ok(['400', '700', 'inherit'].includes(value), `${f}: font-weight: ${value}`);
    }
  }
});

// every element with words of its own, and every field: its font and its weight as the page computes them
async function checkWords(url, p) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  try {
    const page = await ctx.newPage();
    await page.goto(url + p);
    const words = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(el => el.matches('input:not([type=hidden])') || [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(el => {
        const s = getComputedStyle(el);
        return { what: `${el.tagName.toLowerCase()} “${(el.value || el.textContent).trim().slice(0, 30)}”`,
          family: s.fontFamily.replace(/"/g, ''), weight: s.fontWeight, style: s.fontStyle, code: Boolean(el.closest('code, pre')) };
      }));
    assert.ok(words.length > 20, `${p}: words found`);
    for (const w of words) {
      if (w.code) { assert.match(w.family, /monospace$/, `${p}: ${w.what}`); continue; }
      assert.match(w.family, /^Cantarell, /, `${p}: ${w.what}`);
      assert.ok(['400', '700'].includes(w.weight), `${p}: ${w.what} at ${w.weight}`);
    }
    return words;
  } finally {
    await ctx.close();
  }
}

test('every word on every page is set in Cantarell, at 400 or 700', async () => {
  for (const p of ['/', '/waitlist/', '/privacy/', '/terms/']) await checkWords(server.url, p);
});

test('and on the blog as Jekyll builds it, a post’s italics included', async () => {
  const built = await startServer(buildSite());
  try {
    for (const p of ['/blog/', '/blog/heura-eval-004/']) await checkWords(built.url, p);
    const words = await checkWords(built.url, '/blog/why-heura-studios-fits-small-business/');
    const italic = words.filter(w => w.what.startsWith('em '));
    assert.ok(italic.length >= 3 && italic.every(w => w.style === 'italic'), JSON.stringify(italic));
  } finally {
    await built.close();
  }
});
