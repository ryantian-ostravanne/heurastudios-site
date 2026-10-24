// Heura waitlist (heurastudios.com): the logic, kept free of Google services so it runs in Apps Script
// (pasted in as the "core" script file) and in Node tests alike. Code.gs wires it to the sheet.

// (Name, Role and What they will specialize come from the home page's Request access form; a waitlist join leaves
// them blank. New columns go at the end, so the rows already in the sheet keep their places.)
var WAITLIST_HEADER = ['Joined at', 'Email', 'Company', 'Came from', 'Name', 'Role', 'What they will specialize'];
var LIMITS = { email: 254, company: 100, from: 200, name: 100, role: 100, use: 1000 };
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One line of plain text: control characters and runs of whitespace become single spaces.
function oneLine_(v) {
  return v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Sheets treats a cell that starts with = + - @ as a formula; a leading apostrophe keeps it as text.
function asText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// p: the form's fields (email, company, from; name, role and use from Request access; website is the hidden field
// only bots fill).
// deps: rows(), append(row), fill(i, cells) (Name, Role and What they will specialize on row i below the header), now(),
// withLock(fn), busy().
// -> {ok:true} | {ok:true, already:true} | {ok:false, error:'email'|'company'|'name'|'busy'}
function handleJoin(p, deps) {
  if (oneLine_(p.website) !== '') return { ok: true };
  var email = oneLine_(p.email).toLowerCase();
  var company = oneLine_(p.company);
  var from = oneLine_(p.from).slice(0, LIMITS.from);
  var name = oneLine_(p.name);
  var role = oneLine_(p.role).slice(0, LIMITS.role);
  var use = oneLine_(p.use).slice(0, LIMITS.use);
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) return { ok: false, error: 'email' };
  if (!company || company.length > LIMITS.company) return { ok: false, error: 'company' };
  if (name.length > LIMITS.name) return { ok: false, error: 'name' };
  return deps.withLock(function () {
    var rows = deps.rows();
    var at = -1;
    for (var i = 0; i < rows.length; i++) {
      if (oneLine_(rows[i][1]).toLowerCase() === email) { at = i; break; }
    }
    // one row per email. Someone on the waitlist who now asks for access (a name, and none on their row yet): the
    // request goes on that row, so the founders see it
    var request = at >= 0 && name !== '' && oneLine_(rows[at][4]) === '';
    if (at >= 0 && !request) return { ok: true, already: true };
    if (deps.busy()) return { ok: false, error: 'busy' };
    if (request) deps.fill(at, [asText_(name), asText_(role), asText_(use)]);
    else deps.append([deps.now(), asText_(email), asText_(company), asText_(from), asText_(name), asText_(role), asText_(use)]);
    return { ok: true };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { WAITLIST_HEADER: WAITLIST_HEADER, handleJoin: handleJoin };
}
