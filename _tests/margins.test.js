// The margins and the pipeline's wires (Ryan, Oct 29, 2026):
// - "make the website background the canvas thingy ... but only have it on the border/right and left sides": the
//   Studio's canvas (its grey and its dot grid) fills the page's margins, left and right of the column, on every page
//   and in both appearances, from under the header down to the footer, and only where a screen leaves room beside the
//   column: not on a phone, not on a 1280px laptop. Nothing of it is ever behind the column's words.
// - "make the canvas thing still and only have the center part scroll": it stays still while the page scrolls.
// - "make the middle section stand out more": the column is a sheet on the canvas, the page's color with an edge.
// - "for the privacy policy ... add like the pipeline lines as deco", then "make the terms like that too": each legal
//   page's title is a node on a pipeline, wires running in from the screen's left edge and out past its right edge,
//   never over the words. And ("make the bottom privacy and terms and blog thing into the pipelines themselves") the
//   footer is a pipeline: its sections are nodes on the Studio's dark canvas, wired in order.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch, readPng } = require('./helpers');

const PAGES = ['/', '/waitlist/', '/privacy/', '/terms/'];
const LEGAL = ['/privacy/', '/terms/'];
const COLUMN = 1184;   // what .ov-wrap leaves for the words and panels on a wide screen: 1280px less 48px each side
const SHEET = 1280;    // the sheet under the column: .ov-wrap's own width
const PAGE = { light: 255, dark: 0 };     // the page's own color, a channel
const CANVAS = { light: 243, dark: 12 };  // the canvas's grey (#f3f3f3, #0c0c0c)
const EDGE = { light: 228, dark: 38 };    // the sheet's edge, the page's rule (#e4e4e4, #262626)

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser.close(); await server.close(); });

// A page at a size, with what's in main hidden, so a screenshot shows only what's drawn behind it
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

// How far any pixel in columns x0 to x1 (both in) is from a color (a channel), at most
function farthest(shot, x0, x1, from) {
  let most = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const v of shot.rgb(x, y)) most = Math.max(most, Math.abs(v - from));
    }
  }
  return most;
}

// The share of pixels in column x that are a color (a channel, to within 2)
function share(shot, x, color) {
  let n = 0;
  for (let y = 0; y < shot.height; y++) if (shot.rgb(x, y).every(v => Math.abs(v - color) <= 2)) n++;
  return n / shot.height;
}

test('on a wide screen both margins are the canvas, its dots quiet, and nothing is drawn within 20px of the column', async () => {
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
      assert.ok(share(shot, 30, CANVAS[scheme]) > 0.8 && share(shot, width - 31, CANVAS[scheme]) > 0.8,
        `${at}: between the dots, the canvas's grey`);
      assert.equal(farthest(shot, margin - 20, width - 1 - (margin - 20), PAGE[scheme]), 0,
        `${at}: nothing behind the column or in the 20px before it`);
      await close();
    }
  }
});

test('the middle stands out: a sheet of the page’s color under the column, with an edge, on the canvas', async () => {
  const width = 1600, left = (width - SHEET) / 2, right = left + SHEET;   // the sheet runs from 160px to 1440px
  for (const scheme of ['light', 'dark']) {
    for (const path of ['/', '/privacy/']) {
      const { page, close } = await bare(path, width, scheme);
      const shot = await band(page, { x: 0, y: 120, width, height: 360 });
      const at = `${path} (${scheme})`;
      assert.equal(share(shot, left - 1, EDGE[scheme]), 1, `${at}: the sheet's left edge`);
      assert.equal(share(shot, right, EDGE[scheme]), 1, `${at}: the sheet's right edge`);
      assert.equal(farthest(shot, left, right - 1, PAGE[scheme]), 0, `${at}: the sheet is the page's color`);
      assert.ok(share(shot, left - 6, CANVAS[scheme]) > 0.8 && share(shot, right + 5, CANVAS[scheme]) > 0.8,
        `${at}: the canvas right up to the edge`);
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

test('a phone, or a laptop with no room beside the column, gets no canvas and no sheet', async () => {
  for (const [width, height] of [[390, 844], [1280, 860]]) {
    for (const path of PAGES) {
      const { page, close } = await bare(path, width, 'light', height);
      const shot = await band(page, { x: 0, y: 120, width, height: 360 });
      assert.equal(farthest(shot, 0, width - 1, PAGE.light), 0, `${path} at ${width}px`);
      await close();
    }
  }
});

test('the header covers the canvas as the page scrolls under it, and so does the footer, with its own', async () => {
  const width = 1600;
  for (const scheme of ['light', 'dark']) {
    const { page, close } = await bare('/', width, scheme);
    await page.evaluate(() => scrollTo(0, 700));
    await page.waitForTimeout(100);
    const top = await band(page, { x: 0, y: 0, width, height: 60 });   // the header, over the canvas
    assert.equal(farthest(top, 0, 140, PAGE[scheme]), 0, `${scheme}: under the header`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const row = await page.locator('.ov-foot-bottom').boundingBox();   // (the wires run higher up, by the nodes)
    const shot = await band(page, { x: 0, y: Math.ceil(row.y) + 2, width, height: 40 });
    // the footer's own canvas, always the Studio's dark one: #0c0c0c, its dots #2c2c2c
    const dark = farthest(shot, 0, 140, 12);
    assert.ok(dark > 20 && dark <= 33, `${scheme}: the footer's dark canvas and its dots (${dark})`);
    await close();
  }
});

test('the canvas stays still while the page scrolls: only the column moves', async () => {
  const width = 1600, margin = (width - COLUMN) / 2;
  const { page, close } = await bare('/', width);
  const clip = { x: 0, y: 120, width: margin - 60, height: 300 };
  const before = await band(page, clip);
  await page.evaluate(() => scrollTo(0, 310));   // (not a multiple of 20: dots that scrolled along would be 10px off)
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), 310, 'the page scrolled');
  const after = await band(page, clip);
  let moved = 0;
  for (let y = 0; y < before.height; y++) {
    for (let x = 0; x < before.width; x++) if (before.rgb(x, y).join() !== after.rgb(x, y).join()) moved++;
  }
  assert.equal(moved, 0, 'the margin looks the same after scrolling 310px');
  await close();
});

// pixels in columns x0 to x1 (both in) far from a color: a wire's, not the canvas's, its dots' or the sheet's edge
function wire(shot, x0, x1, from) {
  let n = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = x0; x <= x1; x++) if (shot.rgb(x, y).some(v => Math.abs(v - from) > 100)) n++;
  }
  return n;
}

// A node's wires: in from the screen's left edge to ports left of box, out of one right of it past the right edge,
// nothing between (box: the node's words, hidden)
function wired(shot, box, width, from, at) {
  const left = Math.floor(box.x) - 9, right = Math.ceil(box.x + box.width) + 8;
  assert.ok(wire(shot, 0, left, from) > 0, `${at}: wires on the left`);
  assert.ok(wire(shot, right, width - 1, from) > 0, `${at}: wires on the right`);
  assert.ok(wire(shot, 0, 2, from) > 0, `${at}: in from the screen's left edge`);
  assert.ok(wire(shot, width - 3, width - 1, from) > 0, `${at}: out past its right edge`);
  assert.equal(farthest(shot, left + 9, right - 8, from), 0, `${at}: nothing over the words`);
}

test('the Privacy Policy and the Terms: wires run in to the title from the left edge and out to the right edge, never over the words', async () => {
  for (const path of LEGAL) {
    for (const scheme of ['light', 'dark']) {
      for (const width of [1600, 1180]) {
        const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(server.url + path);
        await page.addStyleTag({ content: '.lg-title h1, .lg-main section { visibility: hidden !important; }' });
        const title = await page.locator('.lg-title').boundingBox();
        const middle = Math.round(title.y + title.height / 2);
        const shot = await band(page, { x: 0, y: middle - 80, width, height: 160 });
        wired(shot, title, width, PAGE[scheme], `${path} at ${width}px (${scheme})`);
        await ctx.close();
      }
    }
  }
});

// The footer's nodes, their ports and the wires' ends, on the screen
async function footerPipe(page) {
  return page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    const ends = (svg) => [...svg.querySelectorAll('path')].map((p) => {
      const m = p.getScreenCTM(), n = p.getTotalLength();
      const at = (l) => { const q = p.getPointAtLength(l); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
      return { from: at(0), to: at(n), shown: getComputedStyle(svg).display !== 'none' };
    });
    const nodes = [...document.querySelectorAll('.ov-pipe > .ov-node')];
    return {
      nodes: nodes.map((n) => ({ ...box(n), name: (n.querySelector('h2') || n.querySelector('.ov-logo')).textContent.trim(),
        in: box(n.querySelector('.ov-port.is-in')), out: box(n.querySelector('.ov-port.is-out')),
        joint: getComputedStyle(n, '::before').content !== 'none' && getComputedStyle(n, '::before').display !== 'none' })),
      wires: [...document.querySelectorAll('.ov-pipe > .ov-wire')].map((w) => ends(w)[0]),
      gaps: [...document.querySelectorAll('.ov-pipe > .ov-wire')].map((w) => ends(w)),
      lanes: [...document.querySelectorAll('.ov-pipe > .ov-node')].map((n) => [...n.querySelectorAll('.ov-lane')].map((l) => {
        const r = l.getBoundingClientRect(), b = parseFloat(getComputedStyle(l).borderTopWidth);
        return { x: r.x, w: r.width, y: r.y + b / 2, shown: getComputedStyle(l).display !== 'none' };
      })),
      edges: [...document.querySelectorAll('.ov-edge')].map((w) => ends(w)),
      width: innerWidth,
    };
  });
}

const near = (a, b) => Math.abs(a - b) <= 1.5;

test('the footer is a pipeline: its sections are nodes, wired in order, with wires in from the left edge and out past the right', async () => {
  for (const path of PAGES) {
    for (const width of [1600, 1100, 900]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      await page.goto(server.url + path);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const f = await footerPipe(page);
      const at = `${path} at ${width}px`;
      assert.deepEqual(f.nodes.map(n => n.name), ['Heura Studios', 'Product', 'Legal', 'Contact'], at);
      for (let i = 1; i < f.nodes.length; i++) {
        assert.ok(f.nodes[i].x > f.nodes[i - 1].x + f.nodes[i - 1].w, `${at}: ${f.nodes[i].name} right of the one before`);
      }
      // each wire runs from one node's out port to the next one's in port
      assert.equal(f.wires.length, 3, at);
      f.wires.forEach((w, i) => {
        const a = f.nodes[i].out, b = f.nodes[i + 1].in;
        assert.ok(near(w.from.x, a.cx) || near(w.from.x, a.x + a.w - 4), `${at}: wire ${i + 1} leaves ${f.nodes[i].name}'s port (${w.from.x} vs ${a.cx})`);
        assert.ok(near(w.from.y, a.cy), `${at}: wire ${i + 1} level with ${f.nodes[i].name}'s port (${w.from.y} vs ${a.cy})`);
        assert.ok(near(w.to.y, b.cy), `${at}: wire ${i + 1} meets ${f.nodes[i + 1].name}'s port (${w.to.y} vs ${b.cy})`);
        assert.ok(w.to.x >= b.x - 1.5 && w.to.x <= b.x + b.w + 1.5, `${at}: wire ${i + 1} ends at ${f.nodes[i + 1].name}'s port`);
      });
      // and at the ends, wires from the screen's left edge into the first node, and out of the last past the right
      const [into, out] = f.edges, first = f.nodes[0].in, last = f.nodes[3].out;
      for (const w of into) {
        assert.ok(w.from.x <= 0, `${at}: in from the left edge`);
        assert.ok(near(w.to.y, first.cy) && w.to.x >= first.x - 1.5 && w.to.x <= first.x + first.w + 1.5, `${at}: into Heura Studios' port`);
      }
      for (const w of out) {
        assert.ok(w.to.x >= f.width, `${at}: out past the right edge`);
        assert.ok(near(w.from.y, last.cy) && w.from.x >= last.x - 1.5 && w.from.x <= last.x + last.w + 1.5, `${at}: out of Contact's port`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
      await ctx.close();
    }
  }
});

test('the footer’s nodes are wired across too: a port feeds several, and a wire passing a node runs under or over it', async () => {
  for (const width of [1600, 1100, 900]) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(server.url + '/');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const f = await footerPipe(page);
    const at = `${width}px`;
    const all = f.gaps.flat();
    const leaving = (n) => all.filter(w => near(w.from.y, n.out.cy) && Math.abs(w.from.x - n.out.cx) <= 2).length;
    const coming = (n) => all.filter(w => near(w.to.y, n.in.cy) && Math.abs(w.to.x - n.in.cx) <= 2).length;
    const [brand, product, legal, contact] = f.nodes;
    assert.equal(leaving(brand), 3, `${at}: Heura Studios feeds Product, Legal and Contact`);
    assert.equal(leaving(product), 2, `${at}: Product feeds Legal and Contact`);
    assert.equal(coming(legal), 2, `${at}: Legal takes Product and Heura Studios`);
    assert.equal(coming(contact), 3, `${at}: Contact takes Legal, Product and Heura Studios`);
    // a wire that passes a node: clear of its card, across its whole width, meeting the wires in the cells either side
    f.nodes.forEach((n, i) => f.lanes[i].forEach((l) => {
      assert.ok(l.y < n.y - 8 || l.y > n.y + n.h + 8, `${at}: the wire passing ${n.name} clears its card (${l.y} vs ${n.y}..${n.y + n.h})`);
      assert.ok(near(l.x, n.x) && near(l.x + l.w, n.x + n.w), `${at}: it runs the whole width of ${n.name}`);
      assert.ok(f.gaps[i - 1].some(w => near(w.to.y, l.y) && near(w.to.x, n.x)), `${at}: it meets a wire on ${n.name}'s left`);
      assert.ok(f.gaps[i].some(w => near(w.from.y, l.y) && near(w.from.x, n.x + n.w)), `${at}: and one on its right`);
    }));
    assert.equal(f.lanes.flat().length, 4, `${at}: two under Product, one under Legal and one over it`);
    // the long loop clears the copyright row
    const bottom = await page.locator('.ov-foot-bottom').boundingBox();
    assert.ok(Math.max(...f.lanes.flat().map(l => l.y)) < bottom.y - 16, `${at}: above the copyright row`);
    await ctx.close();
  }
});

test('the footer’s links are still a heading and its links in each node, and the wires are drawn, not read', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(server.url + '/terms/');
  const foot = page.locator('footer');
  assert.deepEqual(await foot.getByRole('heading', { level: 2 }).allTextContents(), ['Product', 'Legal', 'Contact']);
  assert.deepEqual(await foot.getByRole('navigation').evaluateAll(ns => ns.map(n => n.getAttribute('aria-labelledby'))),
    ['ov-foot-product', 'ov-foot-legal']);
  assert.equal(await foot.getByRole('link', { name: 'Terms of Service' }).getAttribute('aria-current'), 'page');
  assert.equal(await foot.locator('.ov-wire, .ov-edge, .ov-port, .ov-tile').evaluateAll(
    els => els.filter(e => e.getAttribute('aria-hidden') !== 'true').length), 0, 'decoration is hidden from screen readers');
  await ctx.close();
});

test('on a phone the footer’s nodes stack, a wire down from each one to the next; none at the ends', async () => {
  for (const width of [390, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(server.url + '/');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const f = await footerPipe(page);
    const at = `${width}px`;
    for (let i = 1; i < f.nodes.length; i++) {
      const a = f.nodes[i - 1], b = f.nodes[i];
      assert.ok(b.y > a.y + a.h, `${at}: ${b.name} under ${a.name}`);
      assert.ok(near(a.out.cx, b.in.cx), `${at}: ${a.name}'s port above ${b.name}'s`);
      assert.ok(a.out.cy > a.y + a.h - 3 && b.in.cy < b.y + 3, `${at}: the ports on the bottom and top edges`);
      assert.ok(b.joint, `${at}: a wire down into ${b.name}`);
    }
    assert.equal(f.nodes[0].joint, false, `${at}: nothing into the first`);
    assert.ok(f.wires.every(w => !w.shown) && f.edges.flat().every(w => !w.shown) && f.lanes.flat().every(l => !l.shown),
      `${at}: the row's wires are put away`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
    await ctx.close();
  }
});

test('no title wires where there is no room (under 1100px), none on the other pages; nothing scrolls sideways', async () => {
  // (the drawing itself: the box the wires meet is a line, 0px tall)
  const shown = async (page, sel) => page.locator(sel).first().isVisible();
  for (const width of [390, 1024, 1100, 1280, 1600, 2560]) {
    for (const path of [...PAGES, '/blog/']) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(server.url + path);
      const at = `${path} at ${width}px`;
      if (LEGAL.includes(path)) assert.equal(await shown(page, '.lg-title .ov-wires-in'), width >= 1100, `${at}: the title's`);
      else assert.equal(await page.locator('main .ov-wires').count(), 0, `${at}: no title wires`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${at}: sideways`);
      await ctx.close();
    }
  }
});
