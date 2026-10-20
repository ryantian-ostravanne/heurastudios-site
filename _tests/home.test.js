// The home page, editorial version: a large headline on the page's left edge, real Heura Studios screens as the
// pictures, the models as a feature card and two smaller ones, How it works as a tour (each step brings its own
// screen into a stage that stays put while the steps scroll by; at Launch the sample chat pops open), the starter
// kits as a list, and an appearance setting (System, Light, Dark) in the footer. Things rise into place as they
// scroll in, but nothing stays hidden: not with Reduce Motion, not without JavaScript, not once scrolled to.
// No text under 11px, nothing that moves forever, no "we".
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./helpers');

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

// Text on the page that can't be seen because it, or something around it, is fully transparent.
function hiddenText(page) {
  return page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return true;
    return false;
  }).map(el => el.textContent.trim().slice(0, 40)));
}

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 300) { await page.mouse.wheel(0, 300); await page.waitForTimeout(60); }
  await page.waitForTimeout(1400);
}

test('with Reduce Motion on, everything shows at once, without scrolling', async () => {
  const { page, errors, close } = await open('/', { reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  assert.deepEqual(await hiddenText(page), []);
  assert.deepEqual(errors, []);
  await close();
});

test('without JavaScript everything shows, and How it works shows its first screen', async () => {
  const { page, close } = await open('/', { javaScriptEnabled: false });
  assert.deepEqual(await hiddenText(page), []);
  assert.equal(await page.locator('.ov-tour-shot[data-step="pick"]').isVisible(), true);
  await close();
});

test('scrolling down the page brings every part of it into view', async () => {
  const { page, errors, close } = await open('/');
  await scrollThrough(page);
  assert.deepEqual(await hiddenText(page), []);
  assert.deepEqual(errors, []);
  await close();
});

for (const [name, viewport] of [['a desktop', { width: 1280, height: 860 }], ['a phone', { width: 375, height: 812 }]]) {
  test(`How it works on ${name}: each step brings its own screen into a stage that stays in view`, async () => {
    const { page, errors, close } = await open('/', { viewport });
    for (const step of ['pick', 'teach', 'train', 'launch']) {
      await page.locator(`.ov-tour-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForFunction(s => {
        const shown = [...document.querySelectorAll('.ov-tour-shot')].filter(x => getComputedStyle(x).opacity === '1').map(x => x.dataset.step);
        return shown.length === 1 && shown[0] === s;
      }, step, { timeout: 3000 });
      assert.equal(await page.locator(`.ov-tour-step[data-step="${step}"]`).getAttribute('aria-current'), 'step', step);
      assert.equal(await page.locator('.ov-tour-step[aria-current]').count(), 1, step);
      const stage = await page.locator('.ov-tour-stage').boundingBox();
      assert.ok(stage.y >= 0 && stage.y + stage.height <= viewport.height, `the stage is out of view at ${step}: ${JSON.stringify(stage)}`);
      // and the step being shown can be read: its heading is on screen, not under the stage
      const title = await page.locator(`.ov-tour-step[data-step="${step}"] h3`).boundingBox();
      const clear = viewport.width < 900 ? stage.y + stage.height : 0;
      assert.ok(title.y >= clear - 1 && title.y + title.height <= viewport.height, `the ${step} heading is hidden: ${JSON.stringify(title)}, stage ${JSON.stringify(stage)}`);
    }
    assert.deepEqual(errors, []);
    await close();
  });
}

test('the sample chat pops open when How it works reaches Launch, and its bubble closes and opens it', async () => {
  const { page, close } = await open('/');
  const bubble = page.locator('#how .ov-chat-bubble');
  const cardOpacity = v => page.waitForFunction(o => getComputedStyle(document.querySelector('#how .ov-chat-card')).opacity === o, v, { timeout: 3000 });
  await page.locator('.ov-tour-step[data-step="launch"]').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('#how .ov-chat-bubble').getAttribute('aria-expanded') === 'true', null, { timeout: 3000 });
  await cardOpacity('1');
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'false');
  assert.match(await bubble.getAttribute('aria-label'), /^Open/);
  await cardOpacity('0');
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'true');
  assert.match(await bubble.getAttribute('aria-label'), /^Close/);
  await cardOpacity('1');
  await close();
});

test('the models section shows Heura Arche available, then Asteria and Aniketos coming soon', async () => {
  const { page, close } = await open('/');
  const models = await page.locator('#models article').evaluateAll(as => as.map(a => ({
    name: a.querySelector('h3').textContent.replace(/\s+/g, ' ').trim(),
    status: a.querySelector('[data-status]').textContent.replace(/\s+/g, ' ').trim(),
  })));
  assert.deepEqual(models.map(m => m.name), ['Heura Arche', 'Heura Asteria', 'Heura Aniketos']);
  assert.match(models[0].status, /available/i);
  assert.match(models[1].status, /coming soon/i);
  assert.match(models[2].status, /coming soon/i);
  assert.match(await page.locator('#models article').first().innerText(), /2B/);
  await close();
});

test('Asteria is four times as powerful as Arche and needs a GPU', async () => {
  const { page, close } = await open('/');
  const asteria = (await page.locator('#models article:has(#ov-asteria) .ov-model-text').innerText()).replace(/\s+/g, ' ').trim();
  assert.match(asteria, /^Four times as powerful as Arche\./);
  assert.match(asteria, /GPU/);
  assert.doesNotMatch(asteria, /'/, 'curly apostrophes, like the rest of the page');
  await close();
});

test('each starter kit names its three documents, and the page says what every kit holds', async () => {
  const { page, close } = await open('/');
  const kits = await page.locator('#kits').innerText();
  for (const doc of ['Refund Policy', 'Shipping FAQ', 'Warranty', 'Time Off Policy', 'Benefits Guide', 'Remote Work Policy',
    'Passwords and MFA', 'VPN Guide', 'Laptop Requests', 'Product Sheet', 'Pricing', 'Objection Handling']) {
    assert.match(kits, new RegExp(doc), doc);
  }
  assert.match(kits, /3 documents, 6 rules, 10 example answers and 8 test questions/);
  await close();
});

test('pointing at a kit changes nothing, because a kit is not a button', async () => {
  const { page, close } = await open('/');
  const kit = page.locator('#kits .ov-kit').first();
  await kit.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // let it finish rising into place
  const look = () => kit.evaluate(el => {
    const s = getComputedStyle(el);
    return [s.transform, s.boxShadow, s.borderTopColor, s.backgroundColor].join(' | ');
  });
  const before = await look();
  await kit.hover();
  await page.waitForTimeout(500);
  assert.equal(await look(), before);
  await close();
});

for (const width of [320, 375]) {
  test(`no text is smaller than 11px at ${width}px wide`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 760 } });
    const tooSmall = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        if (!text) continue;
        const shown = el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (shown && size < 11) out.push(`${text} (${size}px)`);
      }
      return out;
    });
    assert.deepEqual(tooSmall, []);
    await close();
  });
}

test('the page sells Heura Studios first: How it works and Starter kits come before Models', async () => {
  const { page, close } = await open('/');
  assert.deepEqual(await page.locator('main > section[id]').evaluateAll(s => s.map(x => x.id)), ['how', 'kits', 'models']);
  assert.match(await page.locator('.ov-hero-lead').innerText(), /Heura Studios/);
  assert.match(await page.locator('#how .ov-section-lead').innerText(), /Heura Studios/);
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /Heura Studios/);
  assert.deepEqual(await page.locator('footer nav').first().locator('a').allTextContents(),
    ['How it works', 'Starter kits', 'Models', 'Launch an agent', 'Blog'], 'the footer lists them in the same order');
  await close();
});

test('the header links go to sections that exist', async () => {
  const { page, close } = await open('/');
  const links = await page.locator('header nav a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
  assert.deepEqual(links, [['How it works', '#how'], ['Starter kits', '#kits'], ['Models', '#models'], ['Blog', '/blog/']]);
  for (const [, href] of links.filter(([, h]) => h.startsWith('#'))) assert.equal(await page.locator(href).count(), 1, href);
  await close();
});

for (const scheme of ['light', 'dark']) {
  test(`the product pictures describe themselves, load, and match the ${scheme} appearance`, async () => {
    const { page, close } = await open('/', { colorScheme: scheme });
    const shots = page.locator('main img');
    assert.ok(await shots.count() >= 3);
    for (const alt of await shots.evaluateAll(is => is.map(i => i.getAttribute('alt') || ''))) assert.ok(alt.length > 20, alt);
    for (const img of await shots.all()) {
      if (!(await img.isVisible())) continue;
      await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(i => i.complete && i.naturalWidth > 0, await img.elementHandle(), { timeout: 5000 });
      if (await img.getAttribute('data-theme-free') !== null) continue; // looks the same in both, like the chat window
      assert.match(await img.getAttribute('src'), new RegExp(`-${scheme}\\.webp$`));
    }
    await close();
  });
}

test('in dark mode the panels stand apart from the page', async () => {
  const { page, close } = await open('/', { colorScheme: 'dark' });
  const [panel, pageColor] = await page.evaluate(() => [
    getComputedStyle(document.querySelector('.ov-panel')).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  assert.ok(ratio(panel, pageColor) >= 1.12, `panel ${panel} on ${pageColor} is only ${ratio(panel, pageColor).toFixed(3)}:1`);
  await close();
});

for (const scheme of ['light', 'dark']) {
  test(`with Increase Contrast on (${scheme}), secondary text and panel edges get stronger`, async () => {
    const { page, close } = await open('/', { colorScheme: scheme, contrast: 'more' });
    const [lead, pageColor, edge] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.ov-section-lead')).color,
      getComputedStyle(document.body).backgroundColor,
      getComputedStyle(document.querySelector('.ov-panel')).borderTopColor,
    ]);
    assert.ok(ratio(lead, pageColor) >= 10, `secondary text ${lead} on ${pageColor}: ${ratio(lead, pageColor).toFixed(2)}:1`);
    assert.ok(ratio(edge, pageColor) >= 3, `panel edge ${edge} on ${pageColor}: ${ratio(edge, pageColor).toFixed(2)}:1`);
    await close();
  });
}

test('the header is solid, with nothing showing through it', async () => {
  const { page, close } = await open('/');
  const [filter, background] = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('header'));
    return [s.backdropFilter, s.backgroundColor];
  });
  assert.equal(filter, 'none');
  assert.match(background, /^rgb\(/);
  await close();
});

for (const width of [1280, 834, 375]) {
  test(`at ${width}px the headline starts on the same left edge as every section heading`, async () => {
    const { page, close } = await open('/', { viewport: { width, height: 860 } });
    const lefts = await page.evaluate(stacked => {
      const left = sel => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(sel));
        return Math.round(range.getClientRects()[0].left);
      };
      const out = { edge: left('#models h2'), hero: left('.ov-hero h1'), how: left('#how h2'), kits: left('#kits h2'), closing: left('.ov-closing h2') };
      if (stacked) out.lead = left('.ov-hero-lead');
      return out;
    }, width < 1000);
    for (const [name, x] of Object.entries(lefts)) assert.ok(Math.abs(x - lefts.edge) <= 4, `${name} starts at ${x}px, the page edge is ${lefts.edge}px`);
    await close();
  });
}

test('the appearance setting offers System, Light and Dark; Dark sticks across pages, System gives it back', async () => {
  const { page, ctx, close } = await open('/', { colorScheme: 'light' });
  const group = page.getByRole('radiogroup', { name: 'Appearance' });
  assert.deepEqual(await group.getByRole('radio').evaluateAll(rs => rs.map(r => r.getAttribute('aria-label') || r.labels[0].textContent.trim())), ['System', 'Light', 'Dark']);
  assert.equal(await group.getByRole('radio', { name: 'System' }).isChecked(), true);
  await group.getByRole('radio', { name: 'Dark' }).check();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('ov-theme')), 'dark');
  const other = await ctx.newPage();
  await other.goto(server.url + '/waitlist/');
  assert.equal(await other.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.equal(await other.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' }).isChecked(), true);
  await group.getByRole('radio', { name: 'System' }).check();
  assert.equal(await page.evaluate(() => localStorage.getItem('ov-theme')), null);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 2000 });
  await close();
});

test('the page never says "we"', async () => {
  const { page, close } = await open('/');
  assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b/i);
  await close();
});

test('nothing on the home page moves forever', async () => {
  const { page, close } = await open('/');
  await page.waitForTimeout(1500);
  const forever = await page.evaluate(() => document.getAnimations()
    .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
    .map(a => a.animationName || 'unnamed'));
  assert.deepEqual(forever, []);
  await close();
});

// Ryan, Oct 14, 2026 ("bruh upload the that bruh", to "Say the word and I'll add it anyway"): the page says that an AI
// can answer with Claude, GPT, Gemini or the company's own model instead, with the company's own key, as the Heura
// Studios app's Models page does. It sits under the model cards, as a list like the starter kits.
test('Models: or bring your own, with your company’s own key: Claude, GPT, Gemini or your own model', async () => {
  const { page, errors, close } = await open('/');
  const byo = page.locator('#models .ov-byo');
  assert.equal(await byo.count(), 1);
  assert.equal((await byo.locator('.ov-byo-title').innerText()).trim(), 'Or bring your own');
  assert.match(await byo.locator('.ov-section-lead').innerText(), /another model instead, using your company’s own key/);
  assert.deepEqual(await byo.locator('.ov-kit h4').allTextContents(), ['Claude', 'GPT', 'Gemini', 'Your own model']);
  assert.match(await byo.locator('.ov-kit').nth(1).innerText(), /GPT can also be trained on your examples/);
  assert.match(await byo.locator('.ov-kit').nth(3).innerText(), /Ollama, LM Studio, vLLM/);
  const after = await page.evaluate(() => Boolean(document.querySelector('#models .ov-models')
    .compareDocumentPosition(document.querySelector('#models .ov-byo')) & Node.DOCUMENT_POSITION_FOLLOWING));
  assert.ok(after, 'under the model cards');
  assert.deepEqual(errors, []);
  await close();
});

// Each name in Bring your own sits level with its line, as in the starter kits (an h4 gets no browser margin).
test('Models: in Bring your own, each name lines up with its line, as in the starter kits', async () => {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 375, height: 812 }]) {
    const { page, close } = await open('/', { viewport });
    const rows = await page.locator('#models .ov-byo .ov-kit').evaluateAll(els => els.map(el => {
      const name = el.querySelector('h4'), line = el.querySelector('.ov-kit-docs');
      return { name: name.textContent, margin: getComputedStyle(name).margin,
        top: name.getBoundingClientRect().top, lineTop: line.getBoundingClientRect().top,
        bottom: name.getBoundingClientRect().bottom, rowTop: el.getBoundingClientRect().top };
    }));
    const kit = await page.locator('#kits .ov-kit').first().evaluate(el =>
      el.querySelector('h3').getBoundingClientRect().top - el.getBoundingClientRect().top);
    assert.equal(rows.length, 4);
    for (const r of rows) {
      assert.equal(r.margin, '0px', `${r.name} at ${viewport.width}px`);
      assert.ok(Math.abs((r.top - r.rowTop) - kit) <= 1, `${r.name} starts where a kit's name does at ${viewport.width}px`);
      if (viewport.width >= 480) assert.ok(Math.abs(r.top - r.lineTop) <= 4, `${r.name} level with its line: ${JSON.stringify(r)}`);
      else assert.ok(r.lineTop - r.bottom <= 8, `${r.name} close above its line: ${JSON.stringify(r)}`);
    }
    await close();
  }
});
