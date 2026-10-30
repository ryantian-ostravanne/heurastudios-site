// The Tools page (Ryan, Oct 29, 2026: "make tools a seperate page", "have every single feature have a video demo
// thingy", then "dont put how to use. like just have the tool thingy and like have the video below"; Interviews drops
// its Soon and gets a video too, and the Playground, the Studio's twelfth tool, joins them). The Studio's tools in its
// three groups and its order, each with what it takes and what it gives (the Oct 24 words) and, below that, its
// recording, made from the real Studio (_tools/record-tools.py): light and dark, playing while it's on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, ROOT } = require('./helpers');

const TOOLS = [
  ['Signal', [['Grounding', 'grounding', 'documents', 'context, retrieved at answer time'],
    ['Policies', 'policies', 'rules, in plain words', 'a constraint on every answer'],
    ['Demonstrations', 'demonstrations', 'input and output pairs', 'training rows, three per new pair'],
    ['Corrections', 'corrections', 'an answer from the Playground, fixed or marked good', 'a demonstration'],
    ['Interviews', 'interviews', 'an operator’s answers to the model’s questions', 'facts and rules it answers from']]],
  ['Training', [['Eval set', 'eval-set', 'prompts, each with what a passing answer must contain', 'a pass rate, before and after every run'],
    ['Base model', 'base-model', 'Heura Arche (2B), or a model you bring', 'the model that answers'],
    ['Fine-tune', 'fine-tune', 'new demonstrations and corrections, plus a replay mix', 'a LoRA checkpoint on Heura Arche'],
    ['OpenAI fine-tune', 'openai-fine-tune', 'the same rows', 'a fine-tuned OpenAI model']]],
  ['Release', [['Promotion gate', 'promotion-gate', 'a run’s checkpoint', 'the live checkpoint, unless it scores lower'],
    ['Serving', 'serving', 'the live checkpoint', 'an OpenAI-compatible endpoint, an embed, an export'],
    ['Playground', 'playground', 'your questions', 'Serving’s answers, and corrections from the ones you mark']]],
];
const OWNERS = ['Eval set', 'Base model', 'OpenAI fine-tune', 'Promotion gate'];
const ALL = TOOLS.flatMap(([, rows]) => rows);

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/tools/');
  return { page, errors, close: () => ctx.close() };
}

// A computed color: rgb()/rgba() in 0 to 255, or color(srgb …) in 0 to 1 (what color-mix() computes to).
function luminance(css) {
  const scale = /^color\(srgb/.test(css) ? 1 : 255;
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / scale)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('Tools is a page of its own: the heading, the lead, the key, and every tool in its group with what it takes and gives', async () => {
  const { page, errors, close } = await open();
  assert.equal(await page.title(), 'Tools – Heura Studios');
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Tools');
  assert.equal(await page.locator('.tl-intro .ov-lead').innerText(),
    'Operators bring the signal. The owner keeps the eval set, the base model and the gate.');
  assert.equal(await page.locator('.hm-key').innerText(), 'Owner only');
  assert.deepEqual(await page.locator('main h2').allInnerTexts(), TOOLS.map(([group]) => group));
  for (const [group, rows] of TOOLS) {
    const items = page.getByRole('list', { name: group, exact: true }).getByRole('listitem');
    assert.equal(await items.count(), rows.length, group);
    for (const [i, [name, clip, takes, gives]] of rows.entries()) {
      const item = items.nth(i);
      // read in order, with its labels: "Grounding Takes documents Gives context, retrieved at answer time"
      const said = (await item.evaluate(li => [li.querySelector('h3'), ...li.querySelectorAll('dt, dd')]
        .map(e => e.textContent).join(' '))).replace(/\s+/g, ' ').trim();
      assert.equal(said, `${name}${OWNERS.includes(name) ? ' Owner only' : ''} Takes ${takes} Gives ${gives}`, name);
      assert.deepEqual(await item.evaluate(li => [...li.children].map(c => c.tagName)), ['H3', 'DL', 'FIGURE'],
        `${name}: the tool, then its recording, and nothing else`);
      assert.equal(await item.getAttribute('id'), clip, `${name}: a link to it, /tools/#${clip}`);
      assert.equal(await item.locator('.hm-tile svg[viewBox="0 0 20 20"]').count(), 1, `${name}: its schematic icon`);
      assert.equal(await item.evaluate(li => li.classList.contains('is-owner')), OWNERS.includes(name), `${name}: owner`);
    }
  }
  // the owner's tiles are dark, the rest one plain tile with a hairline edge
  const tiles = await page.locator('.tl-tool .hm-tile').evaluateAll(ts => ts.map(t => {
    const cs = getComputedStyle(t);
    return { owner: t.closest('.tl-tool').classList.contains('is-owner'), bg: cs.backgroundColor, edge: cs.borderTopWidth };
  }));
  assert.equal(new Set(tiles.filter(t => !t.owner).map(t => t.bg)).size, 1, 'one plain tile for every group');
  assert.ok(tiles.filter(t => !t.owner).every(t => t.edge === '1px'), 'a hairline edge');
  assert.ok(tiles.filter(t => t.owner).every(t => t.bg === 'rgb(29, 29, 31)'), 'the owner’s are dark');
  // no Soon (Interviews works now), and no how-to: the tool, then its recording
  const words = await page.locator('main').innerText();
  assert.doesNotMatch(words, /\bSoon\b|How to|How it works|Step \d/i);
  assert.deepEqual(errors, []);
  await close();
});

test('each tool has its recording under it: light and dark, named for screen readers, and the files are all there', async () => {
  const { page, close } = await open();
  const films = await page.locator('.tl-tool').evaluateAll(lis => lis.map(li => {
    const v = li.querySelector('video.tl-video'), io = li.querySelector('.tl-io'), frame = li.querySelector('.tl-frame');
    return {
      light: v.getAttribute('data-light'), dark: v.getAttribute('data-dark'), label: v.getAttribute('aria-label'),
      sources: [...v.querySelectorAll('source')].map(s => [s.getAttribute('src'), s.type]),
      muted: v.muted, loop: v.loop, inline: v.playsInline, preload: v.getAttribute('preload'),
      below: frame.getBoundingClientRect().top >= io.getBoundingClientRect().bottom,
    };
  }));
  assert.equal(films.length, ALL.length, 'one recording for every tool');
  for (const [i, [name, clip]] of ALL.entries()) {
    const f = films[i];
    assert.equal(f.light, `/img/tools/${clip}`, name);
    assert.equal(f.dark, `/img/tools/${clip}-dark`, name);
    assert.deepEqual(f.sources, [[`/img/tools/${clip}.mp4`, 'video/mp4'], [`/img/tools/${clip}.webm`, 'video/webm']], name);
    assert.match(f.label, new RegExp(`^${name} in Heura Studios: \\w`), name);
    assert.ok(f.muted && f.loop && f.inline && f.preload !== 'auto', `${name}: muted, looping, inline, not preloaded`);
    assert.ok(f.below, `${name}: under what it takes and gives`);
    for (const file of [`${clip}.mp4`, `${clip}.webm`, `${clip}.webp`, `${clip}-dark.mp4`, `${clip}-dark.webm`, `${clip}-dark.webp`]) {
      const p = path.join(ROOT, 'img', 'tools', file);
      assert.ok(fs.existsSync(p) && fs.statSync(p).size > 10000, `${name}: img/tools/${file}`);
    }
  }
  await close();
});

test('a recording plays while it is on screen, stops when it scrolls away, and Pause and Play are the visitor’s', async () => {
  const { page, close } = await open();
  const film = page.locator('#fine-tune .tl-film');
  await film.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const v = document.querySelector('#fine-tune video');
    return !v.paused && v.currentTime > 0.3;
  }, null, { timeout: 15000 });
  assert.match(await page.locator('#fine-tune video').evaluate(v => v.currentSrc), /\/img\/tools\/fine-tune\.(mp4|webm)$/);
  assert.equal(await page.locator('#grounding video').evaluate(v => v.paused), true, 'one off the screen waits');
  const toggle = page.locator('#fine-tune .tl-toggle');
  assert.equal(await toggle.getAttribute('aria-label'), 'Pause the Fine-tune recording');
  await toggle.click();
  assert.equal(await page.locator('#fine-tune video').evaluate(v => v.paused), true);
  assert.equal(await toggle.innerText(), 'Play');
  await toggle.click();
  await page.waitForFunction(() => !document.querySelector('#fine-tune video').paused);
  await page.locator('#grounding').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#fine-tune video').paused, null, { timeout: 5000 });
  await close();
});

test('in the dark appearance each shows its dark first frame and plays its dark files', async () => {
  const { page, close } = await open({ colorScheme: 'dark' });
  const posters = await page.locator('.tl-video').evaluateAll(vs => vs.map(v => v.poster));
  for (const [i, [name, clip]] of ALL.entries()) assert.match(posters[i], new RegExp(`/img/tools/${clip}-dark\\.webp$`), name);
  const frame = await page.locator('#serving .tl-frame').evaluate(f => getComputedStyle(f).backgroundImage);
  assert.match(frame, /serving-dark\.webp/);
  await page.locator('#serving .tl-film').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('#serving video').paused, null, { timeout: 15000 });
  assert.match(await page.locator('#serving video').evaluate(v => v.currentSrc), /\/img\/tools\/serving-dark\.(mp4|webm)$/);
  await close();
});

test('with Reduce Motion nothing plays until Play; without JavaScript the browser’s own controls show', async () => {
  const still = await open({ reducedMotion: 'reduce' });
  await still.page.locator('#policies .tl-film').scrollIntoViewIfNeeded();
  await still.page.waitForTimeout(800);
  assert.equal(await still.page.locator('#policies video').evaluate(v => v.paused), true);
  assert.equal(await still.page.locator('#policies .tl-toggle').innerText(), 'Play');
  await still.page.locator('#policies .tl-toggle').click();
  await still.page.waitForFunction(() => !document.querySelector('#policies video').paused, null, { timeout: 15000 });
  await still.close();

  const plain = await open({ javaScriptEnabled: false });
  const v = await plain.page.locator('.tl-video').evaluateAll(vs => vs.map(x => [x.hasAttribute('controls'), x.paused]));
  assert.ok(v.length === ALL.length && v.every(([controls, paused]) => controls && paused), 'controls, and nothing playing');
  assert.equal(await plain.page.locator('.tl-toggle:visible').count(), 0);
  await plain.close();
});

test('the header and the footer link here, and say it is the page you are on', async () => {
  const { page, close } = await open();
  for (const where of ['header', 'footer']) {
    const link = page.locator(where).getByRole('link', { name: 'Tools', exact: true });
    assert.equal(await link.getAttribute('href'), '/tools/', where);
    assert.equal(await link.getAttribute('aria-current'), 'page', where);
  }
  await close();
});

test('on a phone the cards stack and nothing scrolls sideways; the quiet words read at 4.5:1 or more', async () => {
  const { page, close } = await open({ viewport: { width: 390, height: 844 } });
  const boxes = await page.locator('.tl-tool').evaluateAll(lis => lis.slice(0, 3).map(li => li.getBoundingClientRect().toJSON()));
  assert.ok(boxes[1].top >= boxes[0].bottom && boxes[2].top >= boxes[1].bottom, 'one card under another');
  assert.ok(boxes.every(b => b.left >= 0 && b.right <= 390), 'inside the screen');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'nothing sideways');
  await close();
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await open({ colorScheme: scheme });
    const pairs = await page.evaluate(() => ['.tl-io dt', '.tl-io dd', '.hm-key', '.tl-intro .ov-lead'].map(sel => {
      const el = document.querySelector(sel);
      let bg = 'rgba(0, 0, 0, 0)';
      for (let e = el; e && /rgba\(.*, 0\)$/.test(bg); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
      return [sel, getComputedStyle(el).color, /rgba\(.*, 0\)$/.test(bg) ? getComputedStyle(document.documentElement).backgroundColor : bg];
    }));
    for (const [sel, fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${scheme} ${sel}: ${fg} on ${bg}`);
    await close();
  }
});
