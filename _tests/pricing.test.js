// Pricing (Ryan, Oct 19, 2026: "have 10$ a month for the pro plan ... 20$ a month for the max plan", and the calls to
// action say Launch an agent): Free, Pro and Max on the home page, with the numbers the app's plans have (studio/plans.py
// in Heura Studios; its own tests check its copy of this section). And the header, with Pricing in it and a longer
// button, still fits every width.
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

const PLANS = [
  { name: 'Free', price: '$0', specs: [['AIs', '2'], ['Answers a day', '50'], ['Documents', '25 MB'], ['Trainings', '1 a week']],
    list: ['A chat bubble on your website, with “Powered by Heura Studios”'] },
  { name: 'Pro', price: '$10 a month', specs: [['AIs', '10'], ['Answers a day', '2,000'], ['Documents', '1 GB'], ['Trainings', '10 a day']],
    list: ['A chat bubble on your website', 'The API, for your own apps', 'Downloads to run your AI on your own computer',
      'Claude, GPT, Gemini or your own model', 'Email support'] },
  { name: 'Max', price: '$20 a month', specs: [['AIs', '50'], ['Answers a day', '6,000'], ['Documents', '5 GB'], ['Trainings', '30 a day']],
    list: ['A chat bubble on your website, without “Powered by Heura Studios”', 'The API and downloads, as on Pro',
      'Claude, GPT, Gemini or your own model', 'GPT trained on your examples, with your OpenAI key', 'Priority email support'] },
];

test('Pricing: Free, Pro at $10 a month and Max at $20 a month, each with what it includes', async () => {
  const { page, errors, close } = await open('/');
  const section = page.locator('#pricing');
  assert.equal(await section.getByRole('heading', { level: 2 }).textContent(), 'Pricing');
  const plans = await section.locator('.ov-plan').evaluateAll(cards => cards.map(c => ({
    name: c.querySelector('h3').textContent.trim(),
    price: c.querySelector('.ov-plan-price').textContent.replace(/\s+/g, ' ').trim(),
    specs: [...c.querySelectorAll('.ov-specs div')].map(d => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()]),
    list: [...c.querySelectorAll('.ov-plan-list li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()),
  })));
  assert.deepEqual(plans, PLANS);
  for (const plan of PLANS) assert.equal(await section.getByRole('article', { name: plan.name }).count(), 1, plan.name);
  const fine = await section.locator('.ov-plans-fine').innerText();
  assert.match(fine, /Every account starts on Free; pick Pro or Max on the Plan page in Heura Studios\./);
  assert.match(fine, /US dollars/);
  assert.match(fine, /Stripe/);
  assert.equal(await section.getByRole('link', { name: 'Launch an agent' }).getAttribute('href'), 'https://app.heurastudios.com/signup');
  assert.deepEqual(errors, []);
  await close();
});

test('on a laptop the three plans sit side by side, their rows lined up; below 900px one under another', async () => {
  for (const [width, side] of [[1280, true], [1024, true], [834, false], [375, false]]) {
    const { page, close } = await open('/', { viewport: { width, height: 900 } });
    const cards = await page.locator('.ov-plan').evaluateAll(cs => cs.map(c => {
      const top = sel => Math.round(c.querySelector(sel).getBoundingClientRect().top);
      const box = c.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top), specs: top('.ov-specs'), list: top('.ov-plan-list') };
    }));
    if (side) {
      assert.equal(new Set(cards.map(c => c.top)).size, 1, `${width}: one row`);
      assert.equal(new Set(cards.map(c => c.specs)).size, 1, `${width}: the numbers line up`);
      assert.equal(new Set(cards.map(c => c.list)).size, 1, `${width}: and so do the lists`);
    } else {
      assert.equal(new Set(cards.map(c => c.left)).size, 1, `${width}: one column`);
      assert.ok(cards[0].top < cards[1].top && cards[1].top < cards[2].top, `${width}: Free, Pro, Max`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `${width}: nothing scrolls sideways`);
    await close();
  }
});

// The header: the logo, the five sections (from 960px), Log in (from 360px) and the button. Under 480px the button says
// Launch, and screen readers still hear Launch an agent.
for (const path of ['/', '/privacy/', '/terms/']) {
  test(`${path}: the header fits from 320px to 1280px, its button Launch an agent (Launch on a phone)`, async () => {
    for (const width of [320, 360, 375, 390, 414, 420, 479, 480, 520, 600, 760, 834, 959, 960, 1024, 1280]) {
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
      assert.deepEqual(nav, width >= 960 ? ['How it works', 'Starter kits', 'Models', 'Pricing', 'Blog'] : [], where);
      await close();
    }
  });
}
