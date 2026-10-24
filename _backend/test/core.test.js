const test = require('node:test');
const assert = require('node:assert/strict');
const { handleJoin, WAITLIST_HEADER } = require('../core.js');

// A stand-in for the sheet: rows below the header, in the header's column order.
function fakeDeps(rows = [], opts = {}) {
  const appended = [];
  const filled = [];   // [row index below the header, [Name, Role, What they will specialize]]
  return {
    appended,
    filled,
    deps: {
      rows: () => rows.concat(appended),
      append: row => appended.push(row),
      fill: (i, cells) => filled.push([i, cells]),
      now: () => new Date('2026-10-12T07:00:00Z'),
      withLock: fn => fn(),
      busy: () => !!opts.busy,
    },
  };
}

test('the sheet has the columns the founders read', () => {
  assert.deepEqual(WAITLIST_HEADER, ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize']);
});

test('a new person is added with the time, their email in lowercase, the company and where they came from', () => {
  const { deps, appended } = fakeDeps();
  const r = handleJoin({ email: '  Ann@Acme.CO ', company: ' Acme Inc ', from: '/waitlist/?utm_source=x' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(appended.length, 1);
  assert.deepEqual(appended[0], [new Date('2026-10-12T07:00:00Z'), 'ann@acme.co', 'Acme Inc', '/waitlist/?utm_source=x', '', '', '']);
});

test('a request for access keeps the name, the role and what they will specialize', () => {
  const { deps, appended } = fakeDeps();
  const r = handleJoin({ email: 'ann@acme.co', company: 'Acme', from: '/', name: ' Ann Lee ', role: 'Head of ML',
    use: 'A support agent\nfor billing questions' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(appended[0].slice(4), ['Ann Lee', 'Head of ML', 'A support agent for billing questions']);
});

// Someone who joined the waitlist and now asks for access: the founders need the request's name, role and what they
// will specialize, so those go on the row that email already has (one row per email), and the answer is a plain ok.
test('someone on the waitlist who then requests access gets the request on their row, and a plain ok', () => {
  const joined = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/waitlist/', '', '', ''];
  const { deps, appended, filled } = fakeDeps([joined]);
  const r = handleJoin({ email: ' Ann@Acme.co', company: 'Acme Inc', from: '/', name: 'Ann Lee', role: '=Head of ML',
    use: 'A support agent\nfor billing' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(appended.length, 0, 'still one row per email');
  assert.deepEqual(filled, [[0, ['Ann Lee', "'=Head of ML", 'A support agent for billing']]]);
});

test('asking for access again keeps the first request and says so', () => {
  const asked = [new Date('2026-10-01T00:00:00Z'), 'ann@acme.co', 'Acme', '/', 'Ann Lee', 'Head of ML', 'A support agent'];
  const { deps, appended, filled } = fakeDeps([asked]);
  const r = handleJoin({ email: 'ann@acme.co', company: 'Acme', from: '/', name: 'Ann', role: 'CTO', use: 'Other' }, deps);
  assert.deepEqual(r, { ok: true, already: true });
  assert.equal(appended.length + filled.length, 0);
});

test('a name over 100 characters is refused; the role and what they will specialize are capped', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'Acme', name: 'x'.repeat(101) }, deps), { ok: false, error: 'name' });
  assert.equal(appended.length, 0);
  handleJoin({ email: 'a@b.co', company: 'Acme', name: 'x'.repeat(100), role: 'r'.repeat(300), use: 'u'.repeat(3000) }, deps);
  assert.deepEqual(appended[0].slice(4).map(v => v.length), [100, 100, 1000]);
});

test('joining twice with the same email (any case) keeps one row and still says ok', () => {
  const { deps, appended } = fakeDeps([[new Date(), 'ann@acme.co', 'Acme', '/']]);
  assert.deepEqual(handleJoin({ email: 'ANN@acme.co', company: 'Acme' }, deps), { ok: true, already: true });
  assert.equal(appended.length, 0);
});

test('an email that does not look like one is refused', () => {
  const { deps, appended } = fakeDeps();
  for (const email of ['', 'ann', 'ann@acme', 'a b@acme.co', 'x'.repeat(250) + '@a.co']) {
    assert.deepEqual(handleJoin({ email, company: 'Acme' }, deps), { ok: false, error: 'email' }, email);
  }
  assert.equal(appended.length, 0);
});

test('the company is required and at most 100 characters', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: '   ' }, deps), { ok: false, error: 'company' });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'x'.repeat(101) }, deps), { ok: false, error: 'company' });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'x'.repeat(100) }, deps), { ok: true });
  assert.equal(appended.length, 1);
});

test('a bot that fills the hidden field is told ok but nothing is saved', () => {
  const { deps, appended } = fakeDeps();
  assert.deepEqual(handleJoin({ email: 'bot@spam.co', company: 'Spam', website: 'http://spam' }, deps), { ok: true });
  assert.equal(appended.length, 0);
});

test('text that Sheets would run as a formula is stored as plain text', () => {
  const { deps, appended } = fakeDeps();
  handleJoin({ email: 'a@b.co', company: '=HYPERLINK("http://x","y")', from: '+1', name: '@me', role: '-1', use: '=2+2' }, deps);
  assert.equal(appended[0][2], '\'=HYPERLINK("http://x","y")');
  assert.equal(appended[0][3], "'+1");
  assert.deepEqual(appended[0].slice(4), ["'@me", "'-1", "'=2+2"]);
});

test('line breaks and control characters are flattened, and where they came from is capped', () => {
  const { deps, appended } = fakeDeps();
  handleJoin({ email: 'a@b.co', company: 'Acme\n\tInc\u0000', from: '/' + 'p'.repeat(400) }, deps);
  assert.equal(appended[0][2], 'Acme Inc');
  assert.equal(appended[0][3].length, 200);
});

test('when a flood of joins arrives, new ones are turned away for the minute', () => {
  const { deps, appended } = fakeDeps([], { busy: true });
  assert.deepEqual(handleJoin({ email: 'a@b.co', company: 'Acme' }, deps), { ok: false, error: 'busy' });
  assert.equal(appended.length, 0);
});

test('the duplicate check and the write happen under the lock', () => {
  const { deps } = fakeDeps();
  let inside = false;
  const seen = [];
  deps.withLock = fn => { inside = true; try { return fn(); } finally { inside = false; } };
  const rows = deps.rows;
  deps.rows = () => { seen.push(['rows', inside]); return rows(); };
  const append = deps.append;
  deps.append = row => { seen.push(['append', inside]); append(row); };
  handleJoin({ email: 'a@b.co', company: 'Acme' }, deps);
  assert.deepEqual(seen, [['rows', true], ['append', true]]);
});
