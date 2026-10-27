// Ryan, Oct 14, 2026: "change the website name into heura studios with an S and add the logo to the thing where you
// see the link". A browser tab, a bookmark and a search result show the site's icon; a shared link's preview shows
// the site's name and a picture. All of them are the Heura Studios logo and name. The logo since Oct 26, 2026 ("make
// that our company logo now"): five pipeline wires plugged in on the left, three running as one bundle through the
// middle, black and white only. favicon.svg is the bare mark (white in dark mode); the other icons are the mark in
// white on a black tile, so they show on light and dark tab bars alike.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, ROOT } = require('./helpers');

const PAGES = ['/', '/waitlist/', '/privacy/', '/terms/'];
const CARD = 'https://heurastudios.com/og-image.png';

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

test('every page links the same icons: the ICO, the SVG, two PNGs and the Apple touch icon', async () => {
  for (const p of PAGES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.url + p);
    const icons = await page.locator('link[rel="icon"]').evaluateAll(
      els => els.map(e => [e.getAttribute('href'), e.getAttribute('type'), e.getAttribute('sizes')]));
    assert.deepEqual(icons, [
      ['/favicon.ico', null, '48x48'],
      ['/favicon.svg', 'image/svg+xml', null],
      ['/favicon-32.png', 'image/png', '32x32'],
      ['/icon-512.png', 'image/png', '512x512'],
    ], p);
    assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'), '/apple-touch-icon.png', p);
    await ctx.close();
  }
});

test('the icon files have the sizes their links promise, and the card is 1200 x 630', () => {
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'an icon file');
  const sizes = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) sizes.push(ico[6 + 16 * i] || 256);
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
  assert.deepEqual(pngSize('favicon-32.png'), [32, 32]);
  assert.deepEqual(pngSize('icon-512.png'), [512, 512]);
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(pngSize('og-image.png'), [1200, 630]);
  assert.match(fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8'), /^<svg [^>]*viewBox="10 10 100 100"/);
});

// Each icon drawn at 96 x 96: the middle wire runs through the centre; between the top wire and the second one (which
// dips into the bundle there) is a gap; a tile's top edge is black.
async function draw(page, src) {
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 96, 96);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
    return { wire: at(48, 48), gap: at(48, 28), plug: at(7, 48), edge: at(48, 2) };
  }, src);
}
const white = ([r, g, b, a]) => r > 200 && g > 200 && b > 200 && a > 200;
const black = ([r, g, b, a]) => r < 40 && g < 40 && b < 40 && a > 200;

test('each icon is the logo: the wires in white on a black tile, and favicon.svg the bare mark', async () => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(server.url + '/');
  for (const file of ['favicon.ico', 'favicon-32.png', 'icon-512.png', 'apple-touch-icon.png']) {
    const px = await draw(page, `${server.url}/${file}`);
    assert.ok(white(px.wire), `${file}: the middle wire is white, got ${px.wire}`);
    assert.ok(black(px.gap), `${file}: the tile shows between the wires, got ${px.gap}`);
    assert.ok(black(px.edge), `${file}: the tile is black at its edge, got ${px.edge}`);
  }
  const svg = await draw(page, `${server.url}/favicon.svg`);
  assert.ok(black(svg.wire), `favicon.svg: the middle wire is black, got ${svg.wire}`);
  assert.ok(black(svg.plug), `favicon.svg: the middle wire's plug is black, got ${svg.plug}`);
  assert.ok(svg.gap[3] < 30, `favicon.svg: nothing between the wires, got ${svg.gap}`);
  await ctx.close();
  const dark = await browser.newContext({ colorScheme: 'dark' });
  const dpage = await dark.newPage();
  await dpage.goto(server.url + '/');
  const d = await draw(dpage, `${server.url}/favicon.svg`);
  assert.ok(white(d.wire), `favicon.svg in dark mode: the middle wire is white, got ${d.wire}`);
  await dark.close();
});

test('every page shares as Heura Studios: the site name, the card with its size and words, a large card on X', async () => {
  for (const p of PAGES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.url + p);
    const tags = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')]
        .map(m => [m.getAttribute('property') || m.getAttribute('name'), m.getAttribute('content')])));
    assert.equal(tags['og:site_name'], 'Heura Studios', p);
    assert.equal(tags['og:image'], CARD, p);
    assert.equal(tags['og:image:width'], '1200', p);
    assert.equal(tags['og:image:height'], '630', p);
    assert.match(tags['og:image:alt'] || '', /^Heura Studios/, p);
    assert.equal(tags['twitter:card'], 'summary_large_image', p);
    assert.equal(tags['twitter:title'], tags['og:title'], p);
    assert.equal(tags['twitter:description'], tags['og:description'], p);
    assert.equal(tags['twitter:image'], CARD, p);
    await ctx.close();
  }
});

test('the home page names the site for search results: WebSite data called Heura Studios', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(server.url + '/');
  const data = await page.locator('script[type="application/ld+json"]').evaluateAll(
    els => els.map(e => JSON.parse(e.textContent)));
  const site = data.find(d => d['@type'] === 'WebSite');
  assert.ok(site, 'a WebSite entry');
  assert.equal(site['@context'], 'https://schema.org');
  assert.equal(site.name, 'Heura Studios');
  assert.equal(site.url, 'https://heurastudios.com/');
  await ctx.close();
});
