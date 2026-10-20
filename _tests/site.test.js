// heurastudios.com: the home page sends everyone to the waitlist, and the waitlist page saves a work email and a
// company to the Apps Script behind the form (stood in for here, so no Google setup is needed).
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
  return { page, errors, close: () => ctx.close() };
}

// The form's endpoint, answered by a stand-in. Every request it gets is recorded.
async function standIn(page, answer) {
  const action = await page.getAttribute('#wl-form', 'action');
  const sent = [];
  await page.route(url => url.href === action, async route => {
    sent.push(Object.fromEntries(new URLSearchParams(route.request().postData() || '')));
    if (answer === 'network') return route.abort();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
  });
  return sent;
}

async function fill(page, email, company) {
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Company name').fill(company);
  await page.getByRole('button', { name: 'Join waitlist' }).click();
}

// Launch (Ryan, Oct 14, 2026): the app is open to anyone at app.heurastudios.com, so every call to action signs up there,
// on the home page and both legal pages. The waitlist page stays for anyone who follows an old link.
// Oct 19, 2026 (Ryan: "instead of get started use like Launch an agent"): the calls to action say Launch an agent. And
// Log in is behind it ("remove the login on the main page and only have the option when i click Launch an Agent"): the
// sign-up page it opens says Already have an account? Log in.
const APP = 'https://app.heurastudios.com';
test('every call to action is Launch an agent at app.heurastudios.com, and Log in is behind it', async () => {
  for (const path of ['/', '/privacy/', '/terms/']) {
    const { page, errors, close } = await open(path);
    const starts = page.getByRole('link', { name: 'Launch an agent' });
    assert.ok(await starts.count() >= (path === '/' ? 4 : 2), `${path}: header, hero and the closing band; the footer`);
    for (const href of await starts.evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(href, `${APP}/signup`, path);
    assert.equal(await page.getByRole('link', { name: 'Log in' }).count(), 0, `${path}: no Log in`);
    assert.equal(await page.locator(`a[href^="${APP}/login"]`).count(), 0, path);
    assert.equal(await page.getByRole('link', { name: 'Join waitlist' }).count(), 0, `${path}: no waitlist buttons`);
    assert.equal(await page.getByRole('link', { name: 'Get started' }).count(), 0, `${path}: no Get started left`);
    const text = await page.evaluate(() => document.body.innerText);
    if (path === '/') assert.doesNotMatch(text, /early access|store/i, path);   // the home page's copy; the legal text says both
    assert.deepEqual(errors, [], path);
    await close();
  }
});

test('no Log in on the waitlist page either', async () => {
  const { page, errors, close } = await open('/waitlist/');
  assert.equal(await page.getByRole('link', { name: 'Log in' }).count(), 0);
  assert.equal(await page.locator(`a[href^="${APP}/login"]`).count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('"Email the founders" writes to Ryan, Leo and Ethan, on both pages', async () => {
  for (const path of ['/', '/waitlist/']) {
    const { page, errors, close } = await open(path);
    const link = page.getByRole('link', { name: 'Email the founders' });
    assert.equal(await link.count(), 1, path);
    assert.equal(await link.getAttribute('href'),
      'mailto:ryantian@ostravanne.com,leoli@ostravanne.com,ethanwang@ostravanne.com', path);
    assert.deepEqual(errors, []);
    await close();
  }
});

test('the waitlist page asks for a work email and a company name, nothing else', async () => {
  const { page, errors, close } = await open('/waitlist/');
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Join the waitlist');
  // the fields a person is asked to fill (the bot trap is hidden from people and screen readers)
  const fields = await page.locator('#wl-form input:not([type=hidden])').evaluateAll(is => is.filter(i => !i.closest('[aria-hidden="true"]')).map(i => i.name));
  assert.deepEqual(fields, ['email', 'company']);
  assert.equal(await page.getByLabel('Work email').getAttribute('type'), 'email');
  assert.equal(await page.getByLabel('Work email').getAttribute('autocomplete'), 'email');
  assert.equal(await page.getByLabel('Company name').getAttribute('autocomplete'), 'organization');
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

test('joining sends the email, the company and where they came from, then says they are on the list', async () => {
  const { page, close } = await open('/waitlist/?utm_source=launch');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].js, '1');
  assert.equal(sent[0].email, 'ann@acme.co');
  assert.equal(sent[0].company, 'Acme');
  assert.equal(sent[0].from, '/waitlist/?utm_source=launch');
  assert.equal(sent[0].website, '');
  assert.match(await page.locator('#wl-done').innerText(), /ann@acme\.co/);
  assert.equal(await page.locator('#wl-form').isVisible(), false);
  await close();
});

test('someone already on the list is told so, kindly', async () => {
  const { page, close } = await open('/waitlist/');
  await standIn(page, { ok: true, already: true });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
  assert.match(await page.locator('#wl-done').innerText(), /already/i);
  await close();
});

test('a work email that does not look like one is caught before anything is sent', async () => {
  const { page, close } = await open('/waitlist/');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme', 'Acme');
  assert.match(await page.locator('#wl-error').innerText(), /work email/i);
  assert.equal(await page.getByLabel('Work email').getAttribute('aria-invalid'), 'true');
  assert.equal(sent.length, 0);
  await close();
});

test('a missing company name is caught before anything is sent', async () => {
  const { page, close } = await open('/waitlist/');
  const sent = await standIn(page, { ok: true });
  await fill(page, 'ann@acme.co', '   ');
  assert.match(await page.locator('#wl-error').innerText(), /company/i);
  assert.equal(sent.length, 0);
  await close();
});

for (const [what, answer] of [['the server says no', { ok: false, error: 'busy' }], ['the network fails', 'network']]) {
  test(`when ${what}, the form stays and says to try again`, async () => {
    const { page, close } = await open('/waitlist/');
    await standIn(page, answer);
    await fill(page, 'ann@acme.co', 'Acme');
    await page.locator('#wl-error').filter({ hasText: /try again/i }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Join waitlist' }).isEnabled(), true);
    assert.equal(await page.getByLabel('Work email').inputValue(), 'ann@acme.co');
    await close();
  });
}

test('the server refusing the email or the company points at that field', async () => {
  const { page, close } = await open('/waitlist/');
  await standIn(page, { ok: false, error: 'company' });
  await fill(page, 'ann@acme.co', 'Acme');
  await page.locator('#wl-error').filter({ hasText: /company/i }).waitFor();
  assert.equal(await page.getByLabel('Company name').getAttribute('aria-invalid'), 'true');
  await close();
});

test('without JavaScript the form still posts straight to the waitlist script', async () => {
  const { page, close } = await open('/waitlist/', { javaScriptEnabled: false });
  const form = page.locator('#wl-form');
  assert.match(await form.getAttribute('action'), /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
  assert.equal((await form.getAttribute('method')).toLowerCase(), 'post');
  assert.equal(await form.isVisible(), true);
  await close();
});

test('an appearance chosen on the waitlist page carries over to the home page', async () => {
  const { page, close } = await open('/waitlist/', { colorScheme: 'dark' });
  await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).check();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await page.goto(server.url + '/');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.equal(await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Light' }).isChecked(), true);
  await close();
});

test('the waitlist page never says "we", before or after joining', async () => {
  const WE = /\bwe\b|\bwe'll\b|\bwe're\b|\bwe’ll\b/i;
  for (const answer of [{ ok: true }, { ok: true, already: true }]) {
    const { page, close } = await open('/waitlist/');
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), WE);
    await standIn(page, answer);
    await fill(page, 'ann@acme.co', 'Acme');
    await page.getByRole('heading', { name: "You’re on the waitlist" }).waitFor();
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), WE);
    await close();
  }
});

test('on the waitlist page the sample chat pops open by itself, and its bubble closes and opens it', async () => {
  const { page, close } = await open('/waitlist/');
  const bubble = page.locator('.wl-art .ov-chat-bubble');
  await page.waitForFunction(() => document.querySelector('.wl-art .ov-chat-bubble')?.getAttribute('aria-expanded') === 'true', null, { timeout: 4000 });
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'false');
  await bubble.click();
  assert.equal(await bubble.getAttribute('aria-expanded'), 'true');
  await close();
});

test('nothing scrolls sideways on a phone', async () => {
  for (const path of ['/', '/waitlist/']) {
    const { page, close } = await open(path, { viewport: { width: 375, height: 812 } });
    await page.waitForTimeout(300);
    for (let y = 0; y < 6000; y += 400) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, path);
    await close();
  }
});
