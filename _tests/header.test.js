// The header (Ryan, Oct 19, 2026: "instead of get started use like Launch an agent"): the longer button still fits every
// width. And no prices on the public pages (Ryan, 20:47: "remove the pricing thing on the main page, only have it on the
// actual product page after the login"): the plans are on the Plan page in Heura Studios.
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

// The header: the logo, the four sections (from 880px), Log in (from 360px) and the button. Under 480px the button says
// Launch, and screen readers still hear Launch an agent.
for (const path of ['/', '/privacy/', '/terms/']) {
  test(`${path}: the header fits from 320px to 1280px, its button Launch an agent (Launch on a phone)`, async () => {
    for (const width of [320, 360, 375, 390, 414, 420, 479, 480, 520, 600, 760, 834, 879, 880, 960, 1024, 1280]) {
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
      const button = header.getByRole('link', { name: 'Launch an agent' });
      assert.equal(await button.count(), 1, where);
      assert.equal(await button.getAttribute('href'), 'https://app.heurastudios.com/signup', where);
      const { seen, space } = await button.evaluate(a => {   // the words that are drawn: the rest is clipped to a pixel on a phone
        const more = a.querySelector('.ov-cta-more');
        const clipped = more.getBoundingClientRect().width <= 1;
        const range = document.createRange();   // and the space before "an agent" is drawn too (a flex item would lose it)
        range.setStart(more.firstChild, 0);
        range.setEnd(more.firstChild, 1);
        return { seen: (clipped ? a.textContent.replace(more.textContent, '') : a.textContent).replace(/\s+/g, ' ').trim(),
          space: clipped ? null : range.getBoundingClientRect().width };
      });
      assert.equal(seen, width < 480 ? 'Launch' : 'Launch an agent', where);
      if (width >= 480) assert.ok(space > 2, `${where}: Launch and an agent run together (the space is ${space}px)`);
      assert.equal(await header.getByRole('link', { name: 'Log in' }).isVisible(), width >= 360, `${where}: Log in`);
      const nav = await header.locator('nav a').evaluateAll(as => as.filter(a => a.getBoundingClientRect().width > 0).map(a => a.textContent.trim()));
      assert.deepEqual(nav, width >= 880 ? ['How it works', 'Starter kits', 'Models', 'Blog'] : [], where);
      await close();
    }
  });
}
