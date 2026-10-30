// The margins (Ryan, Oct 29, 2026: "make the website background the canvas thingy ... but only have it on the
// border/right and left sides"): the Studio canvas's dot grid fills the page's margins, left and right of the column,
// on every page and in both appearances, from under the header down to the footer. It fades out before the column, so
// no word or panel ever sits on it, and it only shows where a screen leaves room beside the column: not on a phone,
// not on a 1280px laptop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch, readPng } = require('./helpers');

const PAGES = ['/', '/waitlist/', '/privacy/', '/terms/'];
const COLUMN = 1184;   // what .ov-wrap leaves for the words and panels on a wide screen: 1280px less 48px each side
const PAGE = { light: 255, dark: 0 };   // the page's own color, a channel

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

// The page at a size, with what's in main hidden, so a screenshot shows only what's drawn behind it
async function bare(path, width, scheme = 'light', height = 1000) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(server.url + path);
  await page.addStyleTag({ content: 'main * { visibility: hidden !important; }' });
  return { page, close: () => ctx.close() };
}

// A band of the screen: { x, y, width, height } -> its pixels
async function band(page, clip) {
  return readPng(await page.screenshot({ clip }));
}

// How far any pixel in columns x0 to x1 (both in) is from the page's color, at most
function farthest(shot, x0, x1, page) {
  let most = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const v of shot.rgb(x, y)) most = Math.max(most, Math.abs(v - page));
    }
  }
  return most;
}

test('on a wide screen both margins show the dots, quiet, and nothing is drawn within 20px of the column', async () => {
  const width = 1600, margin = (width - COLUMN) / 2;   // the column's words start 208px in
  for (const scheme of ['light', 'dark']) {
    for (const path of PAGES) {
      const { page, close } = await bare(path, width, scheme);
      const shot = await band(page, { x: 0, y: 120, width, height: 360 });
      const at = `${path} (${scheme})`;
      const left = farthest(shot, 0, margin - 60, PAGE[scheme]);
      const right = farthest(shot, width - 1 - (margin - 60), width - 1, PAGE[scheme]);
      assert.ok(left > 30 && right > 30, `${at}: the dots show in both margins (${left}, ${right})`);
      // quiet: never stronger than the Studio canvas's own dots (#cfcfcf on white, #2c2c2c on black)
      assert.ok(left <= 52 && right <= 52, `${at}: the dots stay quiet (${left}, ${right})`);
      assert.equal(farthest(shot, margin - 20, width - 1 - (margin - 20), PAGE[scheme]), 0,
        `${at}: nothing behind the column or in the 20px before it`);
      await close();
    }
  }
});

test('the dots are the Studio canvas’s grid: 20px apart', async () => {
  const { page, close } = await bare('/', 1600);
  const shot = await band(page, { x: 0, y: 120, width: 140, height: 40 });
  // the row through the dots' middles is the one with the darkest pixel; each dot is a run of its darkest pixels
  let row = 0, darkest = 255;
  for (let y = 0; y < shot.height; y++) {
    for (let x = 0; x < shot.width; x++) {
      if (shot.rgb(x, y)[0] < darkest) [darkest, row] = [shot.rgb(x, y)[0], y];
    }
  }
  const middles = [];
  for (let x = 0; x < shot.width; x++) {
    if (shot.rgb(x, row)[0] > darkest + 4) continue;
    const last = middles[middles.length - 1];
    if (last && x - last.to <= 2) last.to = x; else middles.push({ from: x, to: x });
  }
  // (a dot cut off by the band's edge has its middle out of the band)
  const at = middles.filter(m => m.from > 0 && m.to < shot.width - 1).map(m => (m.from + m.to) / 2);
  assert.ok(at.length >= 5, `dots along the row: ${at}`);
  for (let i = 1; i < at.length; i++) assert.equal(at[i] - at[i - 1], 20, `dots along the row: ${at}`);
  await close();
});

test('a phone, or a laptop with no room beside the column, gets no dots', async () => {
  for (const [width, height] of [[390, 844], [1280, 860]]) {
    for (const path of PAGES) {
      const { page, close } = await bare(path, width, 'light', height);
      const shot = await band(page, { x: 0, y: 120, width, height: 360 });
      assert.equal(farthest(shot, 0, width - 1, PAGE.light), 0, `${path} at ${width}px`);
      await close();
    }
  }
});

test('the header covers the dots as the page scrolls under it, and the footer has none', async () => {
  const width = 1600;
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await bare('/', width, scheme);
    await page.evaluate(() => scrollTo(0, 700));
    await page.waitForTimeout(100);
    const top = await band(page, { x: 0, y: 0, width, height: 60 });   // the header, over the dots
    assert.equal(farthest(top, 0, 140, PAGE[scheme]), 0, `${scheme}: under the header`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const foot = await page.locator('footer').boundingBox();
    const shot = await band(page, { x: 0, y: Math.ceil(foot.y) + 2, width, height: 80 });
    assert.equal(farthest(shot, 0, 140, 0), 0, `${scheme}: the footer (always black)`);
    await close();
  }
});
