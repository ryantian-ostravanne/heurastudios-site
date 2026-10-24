// The header: one button, at the right, that fits every width (Ryan, Oct 19, 2026; since Oct 24 it says Request access).
// And no prices on the public pages (Ryan, Oct 19, 20:47: "remove the pricing thing on the main page, only have it on
// the actual product page after the login"): the plans are on the Plan page in Heura Studios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + path);
  return { page, errors, close: () => ctx.close() };
}

test('no prices on the public pages: the plans are in Heura Studios, after logging in', async () => {
  for (const path of ['/', '/privacy/', '/terms/', '/waitlist/']) {
    const { page, errors, close } = await open(path);
    assert.equal(await page.locator('#pricing, .ov-plans').count(), 0, path);
    assert.equal(await page.locator('a[href$="#pricing"]').count(), 0, path);
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /\$\d+ a month|\bPro\b.*\bMax\b/, path);
    assert.deepEqual(errors, [], path);
    await close();
  }
});

// The header: the logo, the two sections (from 760px) and the button, at the right. No Log in (Ryan, Oct 19: not on the
// public pages; it's beside the Request access form on the home page).
for (const path of ['/', '/privacy/', '/terms/']) {
  test(`${path}: the header fits from 320px to 1280px, its one button Request access at the right`, async () => {
    for (const width of [320, 360, 375, 390, 414, 420, 479, 480, 520, 600, 759, 760, 834, 880, 960, 1024, 1280]) {
      const { page, close } = await open(path, { viewport: { width, height: 700 } });
      const row = await page.evaluate(() => {
        const r = document.querySelector('.ov-top-row');
        const cs = getComputedStyle(r);
        const inner = [r.getBoundingClientRect().left + parseFloat(cs.paddingLeft), r.getBoundingClientRect().right - parseFloat(cs.paddingRight)];
        const shown = [...r.children].filter(e => getComputedStyle(e).display !== 'none').map(e => {
          const b = e.getBoundingClientRect();
          return { what: e.className, left: b.left, right: b.right };
        });
        return { inner, shown };
      });
      const where = `${path} at ${width}px`;
      for (const k of row.shown) assert.ok(k.left >= row.inner[0] - 0.5 && k.right <= row.inner[1] + 0.5, `${where}: ${k.what} spills out of the header`);
      for (let i = 1; i < row.shown.length; i++) assert.ok(row.shown[i].left >= row.shown[i - 1].right, `${where}: ${row.shown[i].what} overlaps ${row.shown[i - 1].what}`);
      const header = page.locator('header');
      const button = header.getByRole('link', { name: 'Request access' });
      assert.equal(await button.count(), 1, where);
      assert.equal(await button.getAttribute('href'), path === '/' ? '#request' : '/#request', where);
      assert.equal(await header.locator('a[href*="app.heurastudios.com"]').count(), 0, `${where}: Log in`);
      const last = row.shown[row.shown.length - 1];
      assert.ok(last.what.includes('ov-btn') && Math.abs(last.right - row.inner[1]) <= 1, `${where}: the button sits at the right`);
      const nav = await header.locator('nav a').evaluateAll(as => as.filter(a => a.getBoundingClientRect().width > 0).map(a => a.textContent.trim()));
      assert.deepEqual(nav, width >= 760 ? ['Tools', 'Blog'] : [], where);
      await close();
    }
  });
}
