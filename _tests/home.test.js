// The home page (Oct 24, 2026: the post-training positioning). The hero (the headline and the lead; Request access is
// the header's one button), a looping recording of one run in Heura Studios with a Pause button (on a phone, a recording
// of the Studio at a phone's size), Tools, Specifications, and the Request access form, with Log in beside it for teams
// that have access (Ryan, Oct 19: no Log in on the page itself, only where its call to action leads). Quiet on purpose: the recording is the one thing that
// moves, and it stops with Pause, with Reduce Motion, and off screen. No text under 11px, no "we".
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

const SCRIPT = 'https://script.google.com/macros/s/AKfycbymRmy_8immz1FDS9UUhf3K3dv8k77KYyOzTlwy4SzNQUM16fwwYgfr7wcwSkxPGGZW3g/exec';

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

async function open(path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + path);
  return { page, errors, ctx, close: () => ctx.close() };
}

// A computed color: rgb()/rgba() in 0 to 255, or color(srgb …) in 0 to 1 (what color-mix() computes to).
function luminance(css) {
  const scale = /^color\(srgb/.test(css) ? 1 : 255;
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / scale)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// The script behind the form, stood in for: answers what reply says and keeps what it was sent.
async function standIn(page, reply = { ok: true }, status = 200) {
  const sent = [];
  await page.route(SCRIPT, route => {
    sent.push(new URLSearchParams(route.request().postData() || ''));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return sent;
}

async function fill(page, values) {
  const form = page.locator('#hm-form');
  for (const [label, value] of Object.entries(values)) await form.getByLabel(label, { exact: true }).fill(value);
}

// The lead says what trains a checkpoint (demonstrations and corrections: documents ground answers, they don't train)
// and the gate, in the words an ML lead would use. One Request access in view: the header's.
test('the hero: the headline and the lead, and the header has the one Request access', async () => {
  const { page, errors, close } = await open('/');
  assert.equal(await page.title(), 'Post-training for AI-native companies – Heura Studios');
  assert.equal(await page.locator('h1').innerText(), 'Specialize the base before you ship the agent.');
  assert.equal(await page.locator('.hm-hero .ov-lead').innerText(),
    'Your team’s demonstrations and corrections train LoRA checkpoints. Each is scored on your eval set, and any that scores below the live one is held back.');
  assert.equal(await page.locator('.hm-hero .ov-btn').count(), 0);
  assert.equal(await page.locator('header').getByRole('link', { name: 'Request access' }).count(), 1);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  assert.match(description, /^Post-training for AI-native companies\. Your team’s demonstrations and corrections train LoRA checkpoints/);
  assert.doesNotMatch(description, /Grounding/);
  assert.deepEqual(errors, []);
  await close();
});

test('the header and the footer go to sections that exist', async () => {
  const { page, close } = await open('/');
  const header = await page.locator('header a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
  assert.deepEqual(header, [['Heura Studios', '/'], ['Tools', '#tools'], ['Blog', '/blog/'],
    ['Request access', '#request']]);
  assert.deepEqual(await page.locator('footer nav').first().locator('a').allTextContents(),
    ['Tools', 'Request access', 'Blog']);
  for (const id of ['tools', 'request']) assert.equal(await page.locator(`main #${id}`).count(), 1, id);
  assert.equal(await page.getByRole('link', { name: 'Get started' }).count(), 0, 'access is requested now, not signed up for');
  await close();
});

test('Log in is where Request access leads, for teams that have access: not in the header, the hero or the footer', async () => {
  const { page, close } = await open('/');
  const logins = page.locator('a[href^="https://app.heurastudios.com/login"]');
  assert.equal(await logins.count(), 1);
  assert.equal(await page.locator('#request').getByRole('link', { name: 'Log in' }).count(), 1);
  assert.equal(await page.locator('#request .hm-login').innerText(), 'Already have access? Log in');
  for (const where of ['header', '.hm-hero', 'footer']) {
    assert.equal(await page.locator(where).getByRole('link', { name: /log in|sign in/i }).count(), 0, where);
  }
  await close();
});

test('the recording plays muted and looping, without controls, and Pause stops it', async () => {
  const { page, errors, close } = await open('/');
  const video = page.locator('.hm-video');
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.deepEqual(await video.evaluate(v => [v.muted, v.loop, v.controls, v.playsInline]), [true, true, false, true]);
  assert.match(await video.evaluate(v => v.currentSrc), /\/img\/pipeline-run\.(webm|mp4)$/);
  assert.equal(await page.locator('#' + await video.getAttribute('aria-describedby')).innerText(),
    'One run on a sample model in Heura Studios: 82 training rows (10 demonstrations and the replay mix), scored on the eval set before and after, promoted on a tie.');
  const toggle = page.getByRole('button', { name: 'Pause the recording' });
  await toggle.click();
  assert.equal(await video.evaluate(v => v.paused), true);
  await page.getByRole('button', { name: 'Play the recording' }).click();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.deepEqual(errors, []);
  await close();
});

test('the recording rests off screen and plays again when it comes back', async () => {
  const { page, close } = await open('/');
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await page.locator('#request').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.hm-video').paused);
  await page.locator('.hm-video').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await close();
});

test('in dark mode it plays the dark recording, and changing the appearance changes the recording', async () => {
  const { page, close } = await open('/', { colorScheme: 'dark' });
  const src = () => page.locator('.hm-video').evaluate(v => v.currentSrc);
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  assert.match(await src(), /pipeline-run-dark\./);
  assert.match(await page.locator('.hm-video').getAttribute('poster'), /pipeline-run-dark\.webp$/);
  await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).check();
  await page.waitForFunction(() => /pipeline-run\.(webm|mp4)$/.test(document.querySelector('.hm-video').currentSrc));
  await page.locator('.hm-video').scrollIntoViewIfNeeded();   // (the setting is in the footer: the recording rested)
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await close();
});

// The page's appearance is known before it paints (the head script), so the frame shows the right poster from the
// first paint, and a dark page never fetches the light recording or its poster. A light page loads its recording once.
for (const scheme of ['light', 'dark']) {
  test(`a ${scheme} page fetches only the ${scheme} recording and poster, and loads it once`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', r => { if (/\/img\/pipeline-run/.test(r.url())) fetched.push(new URL(r.url()).pathname); });
    await page.addInitScript(() => {
      window.loads = 0;
      const load = HTMLMediaElement.prototype.load;
      HTMLMediaElement.prototype.load = function () { window.loads++; return load.call(this); };
    });
    await page.goto(server.url + '/');
    await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
    const own = scheme === 'dark' ? /pipeline-run-dark\./ : /pipeline-run\./;
    assert.ok(fetched.length > 0);
    for (const path of fetched) assert.match(path, own, `${scheme}: fetched ${path}`);
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), scheme === 'dark'
      ? /pipeline-run-dark\.webp/ : /pipeline-run\.webp/);
    assert.equal(await page.evaluate(() => window.loads), scheme === 'dark' ? 1 : 0, 'load() only to change the files');
    await ctx.close();
  });
}

// Ryan, Oct 24, 13:54: "like even the iphone thing too". On a phone the desktop recording was a stamp: phones get a
// recording of the Studio at a phone's size (taps and swipes, drawn at 2x), in a frame of its shape. The .mp4 comes
// first: every iPhone decodes H.264 itself, and it's the smaller file.
const PHONE = { width: 390, height: 844 };
for (const scheme of ['light', 'dark']) {
  test(`on a phone (${scheme}) it plays the phone recording, in a frame of its shape, and fetches nothing else`, async () => {
    const ctx = await browser.newContext({ viewport: PHONE, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', r => { if (/\/img\/pipeline-run/.test(r.url())) fetched.push(new URL(r.url()).pathname); });
    await page.goto(server.url + '/');
    await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
    const own = scheme === 'dark' ? /\/img\/pipeline-run-phone-dark\./ : /\/img\/pipeline-run-phone\./;
    assert.match(await page.locator('.hm-video').evaluate(v => v.currentSrc), own);
    assert.match(await page.locator('.hm-video').getAttribute('poster'), own);
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), own);
    const [w, h] = await page.locator('.hm-frame').evaluate(f => [f.clientWidth, f.clientHeight]);
    assert.ok(Math.abs(w / h - 390 / 600) < 0.01, `the frame has the phone recording's shape (${w} x ${h})`);
    assert.ok(fetched.length > 0);
    for (const path of fetched) assert.match(path, own, `${scheme}: fetched ${path}`);
    await ctx.close();
  });
}

test('the recording is offered as an .mp4 first, the phone one to phones, even without JavaScript', async () => {
  const { page, close } = await open('/', { javaScriptEnabled: false });
  const sources = await page.locator('.hm-video source').evaluateAll(ss => ss.map(s => [s.getAttribute('media'), s.type,
    s.getAttribute('src')]));
  assert.deepEqual(sources, [
    ['(max-width: 599px)', 'video/mp4', '/img/pipeline-run-phone.mp4'],
    ['(max-width: 599px)', 'video/webm', '/img/pipeline-run-phone.webm'],
    [null, 'video/mp4', '/img/pipeline-run.mp4'],
    [null, 'video/webm', '/img/pipeline-run.webm'],
  ]);
  await close();
  for (const scheme of ['light', 'dark']) {   // and the frame shows the phone poster on a phone
    const phone = await open('/', { javaScriptEnabled: false, colorScheme: scheme, viewport: PHONE });
    assert.match(await phone.page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage),
      scheme === 'dark' ? /pipeline-run-phone-dark\.webp/ : /pipeline-run-phone\.webp/, scheme);
    await phone.close();
  }
});

test('turning a phone to a wider screen changes to the desktop recording, and back', async () => {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(server.url + '/');
  await page.waitForFunction(() => /pipeline-run-phone\./.test(document.querySelector('.hm-video').currentSrc));
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForFunction(() => /\/pipeline-run\.(mp4|webm)$/.test(document.querySelector('.hm-video').currentSrc));
  assert.match(await page.locator('.hm-video').getAttribute('poster'), /\/pipeline-run\.webp$/);
  await page.setViewportSize(PHONE);
  await page.waitForFunction(() => /pipeline-run-phone\./.test(document.querySelector('.hm-video').currentSrc));
  await ctx.close();
});

test('without JavaScript the frame still shows the poster for the system’s appearance', async () => {
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await open('/', { javaScriptEnabled: false, colorScheme: scheme });
    assert.match(await page.locator('.hm-frame').evaluate(f => getComputedStyle(f).backgroundImage), scheme === 'dark'
      ? /pipeline-run-dark\.webp/ : /pipeline-run\.webp/, scheme);
    await close();
  }
});

test('Pause sits beside the caption, or below it on a phone, and is never part of the caption', async () => {
  for (const width of [360, 390, 1280]) {
    const { page, close } = await open('/', { viewport: { width, height: 860 } });
    const caption = page.locator('figure.hm-film > figcaption');
    assert.equal(await caption.count(), 1, `${width}: the figure's caption`);
    assert.equal(await caption.locator('button').count(), 0, `${width}: Pause isn't in it`);
    const [cap, pause, frame] = await page.evaluate(() => ['figure.hm-film > figcaption', '.hm-toggle', '.hm-frame']
      .map(s => document.querySelector(s).getBoundingClientRect().toJSON()));
    if (width < 600) {
      assert.ok(cap.width >= frame.width - 1, `${width}: the caption is as wide as the recording (${cap.width} of ${frame.width})`);
      assert.ok(pause.top >= cap.bottom, `${width}: Pause below the caption`);
    } else {
      assert.ok(pause.left >= cap.right && pause.top < cap.bottom, `${width}: Pause beside the caption`);
    }
    await close();
  }
});

test('with Reduce Motion the recording waits on its first frame until Play', async () => {
  const { page, close } = await open('/', { reducedMotion: 'reduce' });
  await page.waitForTimeout(800);
  const video = page.locator('.hm-video');
  assert.equal(await video.evaluate(v => v.paused), true);
  assert.equal(await video.evaluate(v => v.currentTime), 0);
  await page.getByRole('button', { name: 'Play the recording' }).click();
  await page.waitForFunction(() => !document.querySelector('.hm-video').paused);
  await page.getByRole('button', { name: 'Pause the recording' }).click();
  assert.equal(await video.evaluate(v => v.paused), true);
  await close();
});

test('without JavaScript the recording shows its first frame with the browser’s controls, and nothing plays', async () => {
  const { page, close } = await open('/', { javaScriptEnabled: false });
  const video = page.locator('.hm-video');
  assert.deepEqual(await video.evaluate(v => [v.controls, v.autoplay, v.paused, v.preload]), [true, false, true, 'none']);
  assert.equal(await page.locator('.hm-toggle').isVisible(), false);
  await close();
});

// Ryan, Oct 24, 10:17: the numbered sequence "resembles every vibecoded site": "make it tools instead". The section is
// the Studio's own tool palette: its eleven tools in its three groups, the owner's on dark tiles, and for each what it
// takes and what it gives. Not a numbered list.
// Ryan, 11:06: the icons "look childish" and the names "sound kinda cringe". He picked the schematic drawings (the ground
// symbol, a +/- diff, >= for the gate) on hairline tiles with no pastel colors, and nouns for the names.
const TOOLS = [
  ['Signal', [['Grounding', 'documents', 'context, retrieved at answer time'],
    ['Policies', 'rules, in plain words', 'a constraint on every answer'],
    ['Demonstrations', 'input and output pairs', 'training rows, three per new pair'],
    ['Corrections', 'an answer from the Playground, fixed or marked good', 'a demonstration'],
    ['Interviews', 'an operator’s answers to the model’s questions', 'facts and rules it answers from']]],
  ['Training', [['Eval set', 'prompts, each with what a passing answer must contain', 'a pass rate, before and after every run'],
    ['Base model', 'Heura Arche (2B), or a model you bring', 'the model that answers'],
    ['Fine-tune', 'new demonstrations and corrections, plus a replay mix', 'a LoRA checkpoint on Heura Arche'],
    ['OpenAI fine-tune', 'the same rows', 'a fine-tuned OpenAI model']]],
  ['Release', [['Promotion gate', 'a run’s checkpoint', 'the live checkpoint, unless it scores lower'],
    ['Serving', 'the live checkpoint', 'an OpenAI-compatible endpoint, an embed, an export']]],
];
const OWNERS = ['Eval set', 'Base model', 'OpenAI fine-tune', 'Promotion gate'];

test('Tools: the Studio’s eleven, in its three groups, each with what it takes and gives, and the owner’s marked', async () => {
  const { page, errors, close } = await open('/');
  const tools = page.locator('#tools');
  assert.equal(await tools.locator('h2').innerText(), 'Tools');
  assert.equal(await tools.locator('.ov-section-lead').innerText(),
    'Operators bring the signal. The owner keeps the eval set, the base model and the gate.');
  assert.equal(await tools.locator('ol').count(), 0, 'not a numbered list');
  // the owner's tools are dark tiles, as in the Studio; the key beside the heading says so (and each one says it too,
  // to a screen reader)
  assert.equal(await tools.locator('.hm-key').innerText(), 'Owner only');
  assert.equal(await tools.locator('.hm-tool .hm-owner').count(), OWNERS.length);
  assert.equal(await tools.locator('.hm-tool .hm-owner').first().evaluate(e => getComputedStyle(e).position), 'absolute');
  assert.deepEqual(await tools.locator('h3').allInnerTexts(), TOOLS.map(([group]) => group));
  for (const [group, rows] of TOOLS) {
    const list = tools.getByRole('list', { name: group, exact: true });
    const items = list.getByRole('listitem');
    assert.equal(await items.count(), rows.length, group);
    for (const [i, [name, takes, gives]] of rows.entries()) {
      const item = items.nth(i);
      assert.equal(await item.locator('.hm-tool-name').innerText(), name);
      // read in order, with its labels: "Ground Takes documents Gives context, retrieved at answer time"
      const said = (await item.evaluate(li => li.textContent)).replace(/\s+/g, ' ').trim();
      const owner = OWNERS.includes(name) ? ' Owner only' : '';
      const soon = name === 'Interviews' ? ' Soon' : '';
      assert.equal(said, `${name}${owner}${soon} Takes ${takes} Gives ${gives}`, name);
      assert.equal(await item.locator('.hm-tile svg[viewBox="0 0 20 20"]').count(), 1, `${name}: its schematic icon`);
      assert.equal(await item.evaluate(li => li.classList.contains('is-owner')), OWNERS.includes(name), `${name}: owner`);
    }
  }
  // no pastel tiles: every operator tool's tile is the same plain tile with a hairline edge, whatever its group (the
  // group's color is its dot); the owner's are dark
  const tiles = await tools.locator('.hm-tile').evaluateAll(ts => ts.map(t => {
    const cs = getComputedStyle(t);
    return { owner: t.closest('.hm-tool').classList.contains('is-owner'), bg: cs.backgroundColor, edge: cs.borderTopWidth };
  }));
  assert.equal(new Set(tiles.filter(t => !t.owner).map(t => t.bg)).size, 1, 'one plain tile for every group');
  assert.ok(tiles.filter(t => !t.owner).every(t => t.edge === '1px'), 'a hairline edge');
  assert.ok(tiles.filter(t => t.owner).every(t => t.bg === 'rgb(29, 29, 31)'), 'the owner’s are dark');
  assert.deepEqual(errors, []);
  await close();
});

test('Tools: the columns line up on a wide screen, and on a phone each row says Takes and Gives', async () => {
  for (const width of [1280, 390]) {
    const { page, close } = await open('/', { viewport: { width, height: 900 } });
    const rows = page.locator('#tools .hm-tool');
    const layout = await rows.evaluateAll(lis => lis.map(li => {
      const [takes, gives] = li.querySelectorAll('.hm-io');
      return { takes: Math.round(takes.getBoundingClientRect().left), gives: Math.round(gives.getBoundingClientRect().left),
        label: getComputedStyle(takes.querySelector('.hm-io-label')).position !== 'absolute' };
    }));
    if (width > 700) {
      assert.equal(new Set(layout.map(r => r.takes)).size, 1, `${width}: every Takes starts at one edge`);
      assert.equal(new Set(layout.map(r => r.gives)).size, 1, `${width}: every Gives starts at one edge`);
      assert.ok(await page.locator('#tools .hm-tools-cols').isVisible(), 'the column names, once');
      assert.ok(layout.every(r => !r.label), 'the per-row labels are for screen readers here');
    } else {
      assert.equal(await page.locator('#tools .hm-tools-cols').isVisible(), false);
      assert.ok(layout.every(r => r.label), `${width}: each row shows its labels`);
    }
    await close();
  }
});

// Ryan, 11:06: "remove the title what it does and what it doesnt like make it sound better". A spec sheet in its place:
// one row per part, saying exactly what each is (supervised fine-tuning, 2B, OpenAI-compatible), so nothing it can't do
// is claimed and nothing needs a "doesn't" list.
test('Specifications: one row per part, in place of what it does and doesn’t', async () => {
  const { page, close } = await open('/');
  const specs = page.locator('#specs');
  assert.equal(await specs.locator('h2').innerText(), 'Specifications');
  assert.deepEqual(await specs.locator('dt').allInnerTexts(),
    ['Base model', 'Training', 'Training data', 'Evaluation', 'Promotion', 'Serving', 'Export', 'Access']);
  const row = async (term) => (await specs.locator('dl > div', { has: page.locator('dt', { hasText: new RegExp(`^${term}$`) }) })
    .locator('dd').innerText()).replace(/\s+/g, ' ');
  assert.match(await row('Base model'), /^Heura Arche, 2B, built on Qwen3-VL-2B-Instruct\. Or a model you bring: Claude, GPT, Gemini, or any model behind an OpenAI-compatible server\.$/);
  assert.match(await row('Training'), /^Supervised fine-tuning: LoRA adapters on Heura Arche, or OpenAI’s fine-tuning API for its fine-tunable models\.$/);
  assert.match(await row('Training data'), /plus a replay mix of Heura’s own data so the base keeps its general skills\. Answers written by Claude, GPT or Gemini never enter a training set\.$/);
  assert.match(await row('Evaluation'), /^Every run is scored on the eval set before and after it trains\.$/);
  assert.match(await row('Promotion'), /^A checkpoint that scores lower than the live one is held back\. Only the owner can promote it by hand\.$/);
  assert.match(await row('Serving'), /\/v1\/chat\/completions and \/v1\/models/);
  assert.match(await row('Export'), /Apache-2\.0 licence and a NOTICE for Qwen\.$/);
  assert.match(await row('Access'), /^The owner keeps the base model, the eval set, promotion, keys and exports\.$/);
  const text = await page.evaluate(() => document.body.innerText);
  for (const gone of ['What it does', 'It doesn’t', 'doesn’t yet']) assert.ok(!text.includes(gone), gone);
  assert.equal(text.split('Operators bring the signal.').length - 1, 1, 'said once, where the tools start');
  assert.match(await page.locator('#request .ov-section-lead').innerText(),
    /^Access is for teams whose company has a contract with Ostravanne\. A founder checks every request and replies by email\.$/);
  await close();
});

test('Request access asks for a name, a work email, a company, a role and what they will specialize', async () => {
  const { page, close } = await open('/');
  const form = page.locator('#hm-form');
  assert.equal(await form.getAttribute('action'), SCRIPT);
  assert.equal(await form.getAttribute('method'), 'post');
  for (const [label, required] of [['Name', true], ['Work email', true], ['Company', true], ['Role', false],
    ['What will you specialize?', false]]) {
    assert.equal(await form.getByLabel(label, { exact: true }).evaluate(i => i.required), required, label);
  }
  assert.match(await page.locator('#request .ov-section-lead').innerText(), /teams whose company has a contract with Ostravanne/);
  await close();
});

test('sending a request posts every field and says a founder will reply', async () => {
  const { page, errors, close } = await open('/');
  const sent = await standIn(page);
  await fill(page, { 'Name': ' Ann Lee ', 'Work email': 'ann@acme.co', 'Company': 'Acme', 'Role': 'Head of ML',
    'What will you specialize?': 'A support agent for billing questions' });
  await page.getByRole('button', { name: 'Request access' }).last().click();
  const done = page.locator('#hm-done');
  await done.waitFor();
  assert.match(await done.innerText(), /Request sent\s+A founder will reply to ann@acme\.co\./);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-done');
  assert.equal(await page.locator('#hm-form').isVisible(), false);
  const got = Object.fromEntries(sent[0]);
  assert.deepEqual([got.name, got.email, got.company, got.role, got.use, got.kind, got.from, got.js, got.website],
    ['Ann Lee', 'ann@acme.co', 'Acme', 'Head of ML', 'A support agent for billing questions', 'request', '/', '1', '']);
  assert.deepEqual(errors, []);
  await close();
});

test('a request says where the person came from: the page’s utm tags, like the waitlist’s joins', async () => {
  const { page, close } = await open('/?utm_source=launch&utm_medium=email');
  const sent = await standIn(page);
  await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme.co', 'Company': 'Acme' });
  await page.getByRole('button', { name: 'Request access' }).last().click();
  await page.locator('#hm-done').waitFor();
  assert.equal(Object.fromEntries(sent[0]).from, '/?utm_source=launch&utm_medium=email');
  await close();
});

test('someone who already asked is told so', async () => {
  const { page, close } = await open('/');
  await standIn(page, { ok: true, already: true });
  await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme.co', 'Company': 'Acme' });
  await page.getByRole('button', { name: 'Request access' }).last().click();
  await page.locator('#hm-done').waitFor();
  const said = await page.locator('#hm-done').innerText();
  assert.match(said, /There’s already a request from ann@acme\.co\. A founder will reply there\./);
  assert.doesNotMatch(said, /\bwe\b/i, 'the page never says "we", and nor does what it says after sending');
  await close();
});

test('a missing name, an email that does not look like one, or a missing company is caught before anything is sent', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  const send = () => page.getByRole('button', { name: 'Request access' }).last().click();
  const form = page.locator('#hm-form');
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Enter your name.');
  assert.equal(await form.getByLabel('Name', { exact: true }).getAttribute('aria-invalid'), 'true');
  await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme' });
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Enter your work email, like you@company.com.');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-email');
  await fill(page, { 'Work email': 'ann@acme.co' });
  await send();
  assert.equal(await page.locator('#hm-error').innerText(), 'Enter your company’s name.');
  assert.equal(sent.length, 0);
  await close();
});

test('an error is announced and tied to its field, which keeps its red edge while focused', async () => {
  const { page, close } = await open('/');
  const sent = await standIn(page);
  const error = page.locator('#hm-error');
  // in the accessibility tree before there's anything to say, so the first message is announced like the rest
  assert.notEqual(await error.evaluate(e => getComputedStyle(e).display), 'none');
  assert.equal(await error.getAttribute('role'), 'alert');
  await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme.co' });
  const send = () => page.getByRole('button', { name: 'Request access' }).last().click();
  await send();
  const company = page.locator('#hm-company');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-company');
  assert.equal(await company.getAttribute('aria-invalid'), 'true');
  assert.equal(await company.getAttribute('aria-describedby'), 'hm-error');
  await page.waitForFunction(() => getComputedStyle(document.activeElement).borderTopColor === 'rgb(180, 35, 24)',
    null, { timeout: 2000 });   // red while focused (after the border's short transition)
  assert.equal(await page.locator('#hm-use').getAttribute('aria-describedby'), 'hm-use-hint');
  await fill(page, { 'Company': 'Acme', 'Work email': 'ann' });   // now the email is the one to fix
  await send();
  assert.equal(await company.getAttribute('aria-describedby'), null);
  assert.equal(await page.locator('#hm-email').getAttribute('aria-describedby'), 'hm-error');
  assert.equal(sent.length, 0);
  await close();
});

for (const [what, reply, status] of [['the script is down', { ok: true }, 500], ['the script is busy', { ok: false, error: 'busy' }, 200]]) {
  test(`when ${what}, the form stays and says to try again`, async () => {
    const { page, close } = await open('/');
    await standIn(page, reply, status);
    await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme.co', 'Company': 'Acme' });
    const button = page.getByRole('button', { name: 'Request access' }).last();
    await button.click();
    await page.waitForFunction(() => document.getElementById('hm-error').textContent.includes('Try again') ||
      document.getElementById('hm-error').textContent.includes('try again'));
    assert.equal(await page.locator('#hm-form').isVisible(), true);
    assert.equal(await button.isEnabled(), true);
    await close();
  });
}

test('the script refusing the email or the company points at that field', async () => {
  const { page, close } = await open('/');
  await standIn(page, { ok: false, error: 'company' });
  await fill(page, { 'Name': 'Ann', 'Work email': 'ann@acme.co', 'Company': 'Acme' });
  await page.getByRole('button', { name: 'Request access' }).last().click();
  await page.waitForFunction(() => document.getElementById('hm-error').textContent !== '');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hm-company');
  await close();
});

for (const width of [320, 390, 1440]) {
  test(`at ${width}px nothing scrolls sideways and no text is smaller than 11px`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 800 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    const tooSmall = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        if (!text) continue;
        const shown = el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
        if (shown && parseFloat(getComputedStyle(el).fontSize) < 11) out.push(text);
      }
      return out;
    });
    assert.deepEqual(tooSmall, []);
    await close();
  });
}

for (const width of [1280, 834, 375]) {
  test(`at ${width}px the headline starts on the same left edge as every section heading`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 860 } });
    const lefts = await page.evaluate(() => {
      const left = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return Math.round(range.getClientRects()[0].left);
      };
      return [left(document.querySelector('h1')), ...[...document.querySelectorAll('main h2:not(.ov-sr)')].map(left)];
    });
    for (const x of lefts) assert.ok(Math.abs(x - lefts[0]) <= 4, `${lefts}`);
    await close();
  });
}

for (const scheme of ['light', 'dark']) {
  test(`secondary text reads at 4.5:1 or more (${scheme})`, async () => {
    const { page, close } = await open('/', { colorScheme: scheme });
    const pairs = await page.evaluate(() => ['.hm-caption', '.ov-section-lead', '.hm-key', '.hm-io', '.hm-io-label', '.hm-specs dd', '.hm-hint', '.hm-fine'].map(sel => {
      const el = document.querySelector(sel);
      let bg = 'rgba(0, 0, 0, 0)';
      for (let e = el; e && /rgba\(.*, 0\)$/.test(bg); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
      return [sel, getComputedStyle(el).color, /rgba\(.*, 0\)$/.test(bg) ? getComputedStyle(document.documentElement).backgroundColor : bg];
    }));
    for (const [sel, fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${sel}: ${fg} on ${bg}`);
    await close();
  });
}

test('the appearance setting offers System, Light and Dark; Dark sticks across pages, System gives it back', async () => {
  const { page, ctx, close } = await open('/', { colorScheme: 'light' });
  const group = page.getByRole('radiogroup', { name: 'Appearance' });
  assert.deepEqual(await group.getByRole('radio').evaluateAll(rs => rs.map(r => r.labels[0].textContent.trim())), ['System', 'Light', 'Dark']);
  await group.getByRole('radio', { name: 'Dark' }).check();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  const other = await ctx.newPage();
  await other.goto(server.url + '/waitlist/');
  assert.equal(await other.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  await group.getByRole('radio', { name: 'System' }).check();
  assert.equal(await page.evaluate(() => localStorage.getItem('ov-theme')), null);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await close();
});

test('the page never says "we", nor the words the voice leaves out', async () => {
  const { page, close } = await open('/');
  const text = await page.evaluate(() => document.body.innerText);
  assert.doesNotMatch(text, /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b|\bwe’re\b/i);
  assert.doesNotMatch(text, /no code|build your own AI|cheaper than|AI-powered|seamless|unlock|supercharge|!/i);
  await close();
});

test('nothing but the recording moves, and nothing rises into place', async () => {
  const { page, close } = await open('/');
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(() => document.getAnimations().map(a => a.animationName || a.transitionProperty || 'x')), []);
  assert.equal(await page.locator('[data-reveal], [data-parallax]').count(), 0);
  await close();
});
