// Code.gs against stand-ins for the Google services it uses, so the wiring is checked without deploying.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const cells = [[]];   // row 1 is the header
  const sheet = {
    getLastRow: () => cells.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (cells[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValue(v) { (cells[r - 1] ||= [])[c - 1] = v; return this; },
      setValues(rows) { rows.forEach((row, i) => row.forEach((v, j) => { (cells[r - 1 + i] ||= [])[c - 1 + j] = v; })); return this; },
      setFontWeight() { return this; },
    }),
    appendRow: row => cells.push(row),
    setFrozenRows() {},
  };
  const cache = new Map();
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet] }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: text => ({ text, setMimeType(m) { this.mime = m; return this; } }),
    },
    HtmlService: {
      createHtmlOutput: html => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }),
    },
  };
  vm.createContext(ctx);
  for (const f of ['core.js', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return { ctx, cells };
}

test('setup writes the header row once', () => {
  const { ctx, cells } = load();
  ctx.setup();
  ctx.setup();
  assert.deepEqual(cells[0], ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize']);
  assert.equal(cells.length, 1);
});

test('a join from the page (js=1) answers JSON and adds a row', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const out = ctx.doPost({ parameter: { js: '1', email: 'Ann@Acme.co', company: 'Acme', from: '/waitlist/' } });
  assert.equal(out.mime, 'json');
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 2);
  assert.equal(cells[1][1], 'ann@acme.co');
});

test('a request from someone already on the waitlist puts the name, role and use on their row', () => {
  const { ctx, cells } = load();
  ctx.setup();
  ctx.doPost({ parameter: { js: '1', email: 'ann@acme.co', company: 'Acme', from: '/waitlist/' } });
  const out = ctx.doPost({ parameter: { js: '1', kind: 'request', email: 'Ann@Acme.co', company: 'Acme', from: '/',
    name: 'Ann Lee', role: 'Head of ML', use: 'A support agent' } });
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  assert.equal(cells.length, 2, 'one row for that email');
  assert.deepEqual(Array.from(cells[1]).slice(1, 7),   // (the row was made inside the script's own context)
    ['ann@acme.co', 'Acme', '/waitlist/', 'Ann Lee', 'Head of ML', 'A support agent']);
});

test('a plain form post (no JavaScript on the page) gets a page that says so', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const ok = ctx.doPost({ parameter: { email: 'a@b.co', company: 'Acme' } });
  assert.match(ok.html, /on the waitlist/);
  const bad = ctx.doPost({ parameter: { email: 'nope', company: 'Acme' } });
  assert.match(bad.html, /didn.t go through/i);
  assert.equal(cells.length, 2);
});

test('a plain post of a request for access (no JavaScript on the page) gets a page that says it was sent', () => {
  const { ctx, cells } = load();
  ctx.setup();
  const ok = ctx.doPost({ parameter: { kind: 'request', email: 'a@b.co', company: 'Acme', name: 'Ann' } });
  assert.match(ok.html, /Request sent/);
  assert.doesNotMatch(ok.html, /waitlist/);
  assert.equal(cells[1][4], 'Ann');
});

test('the 61st join in a minute is turned away', () => {
  const { ctx } = load();
  ctx.setup();
  let last;
  for (let i = 0; i < 61; i++) last = JSON.parse(ctx.doPost({ parameter: { js: '1', email: `p${i}@b.co`, company: 'Acme' } }).text);
  assert.deepEqual(last, { ok: false, error: 'busy' });
});

test('a failure inside answers a plain error, never a stack trace', () => {
  const { ctx } = load();
  ctx.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('boom: internal detail'); };
  const quiet = console.error;
  console.error = () => {};
  try {
    const out = ctx.doPost({ parameter: { js: '1', email: 'a@b.co', company: 'Acme' } });
    assert.deepEqual(JSON.parse(out.text), { ok: false, error: 'server' });
  } finally {
    console.error = quiet;
  }
});

test('a visit to the web app address says what it is', () => {
  const { ctx } = load();
  assert.deepEqual(JSON.parse(ctx.doGet().text), { ok: true, service: 'Heura waitlist' });
});
