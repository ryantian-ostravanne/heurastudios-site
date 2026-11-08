// heurastudios.com/blog/: model reports and notes. A post is Markdown in _posts/ (its report PDF in reports/), and
// GitHub Pages builds it with Jekyll. These tests build the site the same way (Jekyll 3.10) and read the result.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launch, buildSite, ROOT } = require('./helpers');

let server, browser, site;
test.before(async () => { site = buildSite(); server = await startServer(site); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

const POST = '/blog/heura-eval-004/';
const PDF = '/reports/heura-eval-004.pdf';
const TITLE = 'Heura Eval 004: Arche 0.19 vs 0.20 vs 0.21';
const SUMMARY = 'Arche 0.21 more than doubles both business benchmarks and keeps nearly all of 0.20’s learning from ' +
  'taught answers. What changed, what we saw in the Studio, and what isn’t scored yet.';
// the second post (Ryan, Oct 15, 2026): a note for small business owners, without a report
const SMB = '/blog/why-heura-studios-fits-small-business/';
const SMB_TITLE = 'Your business, your computer, your assistant: why Heura Studios fits small business';
const SMB_SUMMARY = 'Most AI assistants ask you to hand your documents and customer conversations to someone else’s ' +
  'servers. Heura Studios can run on your own computer, learns your business, and lets you check it before customers see it.';
// the third post (Ryan, Nov 8, 2026: "write a blog about the new training tech"; his title): sleep training, Arche 0.30 to 0.32
const SLEEP = '/blog/sleep-training/';
const SLEEP_TITLE = 'Sleep training Arche';
const SLEEP_SUMMARY = 'We adapted Google Research’s SLEEP framework to Heura Arche and taught it two new jobs. It learned ' +
  'them better than a plain fine-tune, and its second run forgot less than its first. Not enough yet to ship.';
const SLEEP_IMAGES = ['/img/blog/sleep-training-how-it-works.png', '/img/blog/sleep-training-jobs.png'];

async function open(p, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const res = await page.goto(server.url + p);
  return { page, errors, status: res.status(), close: () => ctx.close() };
}

test('the blog lists the posts, newest first, each with its date, summary and report', async () => {
  const { page, errors, status, close } = await open('/blog/');
  assert.equal(status, 200);
  assert.equal(await page.title(), 'Blog – Heura Studios');
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Blog');
  assert.equal(await page.locator('.bl-lead').textContent(), 'Model reports and notes from the Heura Studios team.');
  const hrefs = await page.locator('.bl-list > li h2 a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  assert.deepEqual(hrefs, [SLEEP, SMB, POST]);
  const newest = page.locator('.bl-list > li').first();
  assert.equal(await newest.locator('time').textContent(), 'November 8, 2026');
  assert.equal(await newest.locator('time').getAttribute('datetime'), '2026-11-08');
  assert.equal(await newest.getByRole('link', { name: SLEEP_TITLE }).getAttribute('href'), SLEEP);
  assert.equal(await newest.locator('.bl-summary').textContent(), SLEEP_SUMMARY);
  assert.equal(await newest.locator('.bl-report').count(), 0, 'no report to download');
  const first = page.locator('.bl-list > li').nth(1);
  assert.equal(await first.locator('time').textContent(), 'October 15, 2026');
  assert.equal(await first.locator('time').getAttribute('datetime'), '2026-10-15');
  assert.equal(await first.getByRole('link', { name: SMB_TITLE }).getAttribute('href'), SMB);
  assert.equal(await first.locator('.bl-summary').textContent(), SMB_SUMMARY);
  assert.equal(await first.locator('.bl-report').count(), 0, 'a post without a report has no report link');
  const second = page.locator('.bl-list > li').nth(2);
  assert.equal(await second.locator('time').textContent(), 'October 14, 2026');
  assert.equal(await second.locator('time').getAttribute('datetime'), '2026-10-14');
  const link = second.getByRole('link', { name: TITLE });
  assert.equal(await link.getAttribute('href'), POST);
  assert.equal(await second.locator('.bl-summary').textContent(), SUMMARY);
  assert.equal(await second.getByRole('link', { name: 'Report (PDF)' }).getAttribute('href'), PDF);
  const dates = await page.locator('.bl-list time').evaluateAll(ts => ts.map(t => t.getAttribute('datetime')));
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
  assert.deepEqual(errors, []);
  await close();
});

test('a post: its title, byline, the report to download, the scorecard and the way back', async () => {
  const { page, errors, status, close } = await open(POST);
  assert.equal(status, 200);
  assert.equal(await page.title(), `${TITLE} – Heura Studios`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), TITLE);
  assert.equal(await page.locator('.bl-byline').innerText(), 'October 14, 2026, by Ryan');
  const downloads = page.getByRole('link', { name: 'Download the full report (PDF)' });
  assert.equal(await downloads.count(), 2, 'under the byline and at the end');
  for (const href of await downloads.evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(href, PDF);
  const heads = await page.locator('table').first().locator('th').allTextContents();
  assert.deepEqual(heads, ['Measure', 'Arche 0.19', 'Arche 0.20', 'Arche 0.21', '0.21 vs 0.20']);
  const v1 = await page.locator('table').first().locator('tr', { hasText: 'Business AI Benchmark v1' }).locator('td').allTextContents();
  assert.deepEqual(v1.slice(1, 4), ['29.2%', '33.3%', '89.2%']);
  assert.match(await page.locator('.bl-post').innerText(), /0\.21 practised all 16 task types/, 'the caveat');
  for (const alt of await page.locator('.bl-post img').evaluateAll(is => is.map(i => i.getAttribute('alt')))) {
    assert.ok(alt && alt.length > 40, 'every chart says what it shows');
  }
  assert.equal(await page.getByRole('link', { name: 'All posts' }).getAttribute('href'), '/blog/');
  const meta = async sel => page.locator(sel).getAttribute('content');
  assert.equal(await meta('meta[name="description"]'), SUMMARY);
  assert.equal(await meta('meta[property="og:type"]'), 'article');
  assert.equal(await meta('meta[property="og:url"]'), 'https://heurastudios.com' + POST);
  assert.equal(await meta('meta[property="og:title"]'), TITLE);
  assert.equal(await meta('meta[name="twitter:card"]'), 'summary_large_image');
  assert.deepEqual(errors, []);
  await close();
});

test('the small-business post: its title, byline, sections, the jobs, the footnote and how to get started', async () => {
  const { page, errors, status, close } = await open(SMB);
  assert.equal(status, 200);
  assert.equal(await page.title(), `${SMB_TITLE} – Heura Studios`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), SMB_TITLE);
  assert.equal(await page.locator('.bl-byline').innerText(), 'October 15, 2026, by the Ostravanne team');
  assert.equal(await page.locator('.bl-download').count(), 0, 'no report to download');
  assert.deepEqual(await page.locator('.bl-post h2').allTextContents(), [
    '1. It can run on your own computer', '2. It learns your business, not the internet’s',
    '3. It can take on the backend busywork', '4. You can check it before customers see it', '5. You’re not locked in',
    '6. Your data is not our product', '7. Simple, predictable cost', 'An honest note on who it’s for',
    'What to expect from the first month', 'Launch an agent']);
  assert.equal(await page.locator('.bl-post h2 em').textContent(), 'your');
  assert.deepEqual(await page.locator('.bl-post ul > li > strong').allTextContents(), ['Checking invoices:',
    'Reorder decisions:', 'Ticket routing:', 'Customer list cleanup:', 'Reports without the risk:', 'Deadlines:',
    'Approval checks:']);
  assert.deepEqual(await page.locator('.bl-post ol > li > strong').allTextContents(),
    ['Pick one job', 'Add your documents and rules', 'Run the exam', 'Switch it on']);
  assert.deepEqual(await page.locator('.bl-post p > strong').allTextContents(),
    ['How we keep it dependable.', 'What it isn’t.']);
  const text = await page.locator('.bl-post').innerText();
  assert.match(text, /small enough to run on a laptop\*\. When you run it/);
  assert.match(text, /\*Runs on modest hardware, for example an integrated GPU with 12 execution units \(EUs\), a 200 MHz base clock boosting to 650–700 MHz/);
  assert.match(text, /Training may require better specs, but you can do it on something like a MacBook Pro\./);
  assert.match(text, /use your API keys for Claude or ChatGPT and we will cover your tokens/);
  assert.doesNotMatch(text, /FIX THIS|\[ ?FIX/i, 'the draft’s note to the team stays out of the post');
  // it ends with a way in since the app opened (Ryan picked the ending, Oct 15, 23:10): Launch an agent since Oct 19
  const post = page.locator('.bl-post');
  assert.equal(await post.getByRole('link', { name: 'Launch an agent' }).getAttribute('href'), 'https://app.heurastudios.com/signup');
  assert.equal(await post.getByRole('link', { name: 'email the founders' }).getAttribute('href'),
    'mailto:ryantian@ostravanne.com,leoli@ostravanne.com,ethanwang@ostravanne.com');
  assert.match(text, /Heura Studios is open\. Launch an agent with one job\. And tell us what you.d want your assistant to do: email the founders\. We read every email\./);
  assert.doesNotMatch(text, /not open yet|waitlist/i, 'no waitlist now that it’s open');
  assert.equal(await page.getByRole('link', { name: 'All posts' }).getAttribute('href'), '/blog/');
  const meta = async sel => page.locator(sel).getAttribute('content');
  assert.equal(await meta('meta[name="description"]'), SMB_SUMMARY);
  assert.equal(await meta('meta[property="og:type"]'), 'article');
  assert.equal(await meta('meta[property="og:url"]'), 'https://heurastudios.com' + SMB);
  assert.equal(await meta('meta[property="og:title"]'), SMB_TITLE);
  assert.deepEqual(errors, []);
  await close();
});

test('the sleep training post: its title, byline, sections, pictures, scorecard, sources and what’s next', async () => {
  const { page, errors, status, close } = await open(SLEEP);
  assert.equal(status, 200);
  assert.equal(await page.title(), `${SLEEP_TITLE} – Heura Studios`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), SLEEP_TITLE);
  assert.equal(await page.locator('.bl-byline').innerText(), 'November 8, 2026, by Ryan');
  assert.equal(await page.locator('.bl-download').count(), 0, 'no report to download');
  assert.deepEqual(await page.locator('.bl-post h2').allTextContents(),
    ['Background', 'Method', 'Results', 'Release status', 'Limitations', 'Next steps']);
  assert.deepEqual(await page.locator('.bl-post ul > li > strong').evaluateAll(ss => ss.map(s => s.textContent)).then(a => a.slice(0, 3)),
    ['Expansion.', 'Consolidation.', 'Dreaming.'], 'the method, in the paper’s words');
  // the two pictures: each says what it shows, is served, and has loaded
  const imgs = page.locator('.bl-post img');
  assert.deepEqual(await imgs.evaluateAll(is => is.map(i => i.getAttribute('src'))), SLEEP_IMAGES);
  for (const alt of await imgs.evaluateAll(is => is.map(i => i.getAttribute('alt')))) {
    assert.ok(alt && alt.length > 40, 'every picture says what it shows');
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.bl-post img')].every(i => i.complete && i.naturalWidth > 0));
  for (const src of SLEEP_IMAGES) {
    const res = await fetch(server.url + src);
    assert.equal(res.status, 200, src);
    assert.equal(res.headers.get('content-type'), 'image/png', src);
  }
  // the scorecard: the versions, the two jobs and what the live model keeps
  const table = page.locator('.bl-post table').first();
  assert.deepEqual(await table.locator('th').allTextContents(),
    ['Measure', 'Arche 0.26 (live)', '0.30, plain', '0.31, sleep', '0.32, sleep']);
  const row = async name => (await table.locator('tr', { hasText: name }).locator('td').allTextContents()).slice(1);
  assert.deepEqual(await row('CASE-1'), ['9', '26', '35', '36']);
  assert.deepEqual(await row('DATA-1'), ['2', '58', '70', '63']);
  assert.deepEqual(await row('Business AI Benchmark v1'), ['91.7%', '90.4%', '88.3%', '88.3%']);
  assert.deepEqual(await row('Lessons learned in the Studio'), ['39', '32', '33', '33']);
  // the sources: the paper and Google Research's post
  const post = page.locator('.bl-post');
  assert.equal(await post.getByRole('link', { name: 'SLEEP framework' }).getAttribute('href'),
    'https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/');
  assert.equal(await post.getByRole('link', { name: 'Language Models Need Sleep: Learning to Self-Modify and Consolidate Memories' })
    .getAttribute('href'), 'https://arxiv.org/abs/2606.03979');
  const text = await post.innerText();
  assert.match(text, /94 and 88 more benchmark items right than the live model, against 73 for the plain fine-tune/);
  assert.match(text, /neither sleep version has shipped, and Arche 0\.26 is still the live model/);
  assert.match(text, /a version that scores below the live one is held back/, 'the Promotion gate’s rule, as the home page says it');
  assert.equal(await post.locator('ol > li').count(), 3, 'what’s next');
  assert.equal(await page.getByRole('link', { name: 'All posts' }).getAttribute('href'), '/blog/');
  const meta = async sel => page.locator(sel).getAttribute('content');
  assert.equal(await meta('meta[name="description"]'), SLEEP_SUMMARY);
  assert.equal(await meta('meta[property="og:type"]'), 'article');
  assert.equal(await meta('meta[property="og:url"]'), 'https://heurastudios.com' + SLEEP);
  assert.equal(await meta('meta[property="og:title"]'), SLEEP_TITLE);
  assert.deepEqual(errors, []);
  await close();
});

test('the report PDF is served as it is', async () => {
  const res = await fetch(server.url + PDF);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.ok(bytes.equals(fs.readFileSync(path.join(ROOT, PDF))));
});

test('every page links to the blog from its header and its footer', async () => {
  for (const p of ['/', '/privacy/', '/terms/', '/waitlist/', '/blog/', POST, SMB, SLEEP]) {
    const { page, close } = await open(p);
    const header = await page.locator('header nav a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
    assert.deepEqual(header[header.length - 1], ['Blog', '/blog/'], `${p} header`);
    const footer = await page.locator('footer nav').first().locator('a')
      .evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
    assert.deepEqual(footer[footer.length - 1], ['Blog', '/blog/'], `${p} footer`);
    const current = await page.locator('a[href="/blog/"][aria-current="page"]').count();
    assert.equal(current, p === '/blog/' ? 2 : 0, `${p}: the blog's own page says it's the one you're on`);
    await close();
  }
});

// The blog's header and footer match every other page's: Request access (the home page's form), and no Log in (Ryan,
// Oct 19: not on the public pages; it's beside the form now). A post can still have its own links, like the
// small-business post's Launch an agent.
const APP = 'https://app.heurastudios.com';
test('the blog has Request access and no Log in, like every other page', async () => {
  for (const p of ['/blog/', POST, SMB, SLEEP]) {
    const { page, errors, close } = await open(p);
    const asks = page.locator('header, footer').getByRole('link', { name: 'Request access' });
    assert.equal(await asks.count(), 2, `${p}: in the header and the footer`);
    for (const href of await asks.evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(href, '/#request', p);
    assert.equal(await page.locator(`a[href^="${APP}/login"]`).count(), 0, `${p}: no Log in`);
    for (const old of ['Get started', 'Launch an agent', 'Sign in']) {
      assert.equal(await page.locator('header, footer').getByRole('link', { name: old }).count(), 0, `${p}: ${old}`);
    }
    assert.equal(await page.getByRole('link', { name: 'Join waitlist' }).count(), 0, `${p}: no waitlist buttons`);
    assert.deepEqual(errors, [], p);
    await close();
  }
});

test('the blog fits a phone, in light and dark', async () => {
  for (const colorScheme of ['light', 'dark']) {
    for (const p of ['/blog/', POST, SMB, SLEEP]) {
      const { page, close } = await open(p, { viewport: { width: 375, height: 800 }, colorScheme });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(wide <= 0, `${p} (${colorScheme}) scrolls sideways by ${wide}px`);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(bg, colorScheme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)', `${p} (${colorScheme})`);
      await close();
    }
  }
});

// every published file that isn't the blog's own: what Jekyll copied must be the file as it is in the repo
function published(dir, rel = '') {
  const out = [];
  for (const name of fs.readdirSync(path.join(dir, rel))) {
    const r = path.join(rel, name);
    if (fs.statSync(path.join(dir, r)).isDirectory()) out.push(...published(dir, r));
    else out.push(r);
  }
  return out;
}

test('building the site copies every asset as it is (the pages are built from the layout)', () => {
  const files = published(site);
  assert.ok(files.includes('index.html') && files.includes(path.join('privacy', 'index.html')));
  for (const f of files.filter(f => !f.endsWith('.html'))) {
    assert.ok(fs.readFileSync(path.join(site, f)).equals(fs.readFileSync(path.join(ROOT, f))), `${f} changed in the build`);
  }
});

test('the repo’s own files aren’t published', async () => {
  for (const p of ['/docs/superpowers/specs/2026-10-15-blog-design.md', '/README.md', '/README.html', '/_config.yml',
    '/_posts/2026-10-14-heura-eval-004.md', '/_posts/2026-10-15-why-heura-studios-fits-small-business.md',
    '/_posts/2026-11-08-sleep-training.md',
    '/_layouts/post.html', '/_tests/helpers.js', '/_backend/core.js']) {
    assert.equal((await fetch(server.url + p)).status, 404, p);
  }
  assert.ok(!fs.existsSync(path.join(site, 'docs')), 'docs/ stays out of the site');
});
