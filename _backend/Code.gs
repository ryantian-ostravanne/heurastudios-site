/** @OnlyCurrentDoc */
// Google Apps Script entry points for the site's two forms (waitlist + Request access). Bound to the
// "Heura waitlist" sheet; @OnlyCurrentDoc limits its permissions to that one sheet. The logic is in core.js
// (paste it in as a second script file named "core"); this file wires it to the sheet.
//
// First deploy: run setup(), then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone),
//   and put the /exec URL in form_endpoint in _config.yml.
// Ship a change: paste, run setup() (adds any missing header cell), then
//   Deploy > Manage deployments > Edit > Version: New version (keeps the same /exec URL).

var JOINS_PER_MINUTE = 60;   // rate limit: more new rows than this in a minute are turned away (bot floods)

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// Fills in any missing header cell and freezes the header row. Rows below it are never touched.
function setup() {
  var sheet = sheet_();
  var n = WAITLIST_HEADER.length;
  var have = sheet.getRange(1, 1, 1, n).getValues()[0];
  for (var c = 0; c < n; c++) {
    if (!have[c]) sheet.getRange(1, c + 1).setValue(WAITLIST_HEADER[c]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
}

function deps_() {
  var sheet = sheet_();
  return {
    rows: function () {
      var last = sheet.getLastRow();
      return last < 2 ? [] : sheet.getRange(2, 1, last - 1, WAITLIST_HEADER.length).getValues();
    },
    append: function (row) {
      sheet.appendRow(row);
    },
    fill: function (i, cells) {   // row i below the header: its Name, Role and What they will specialize
      sheet.getRange(i + 2, 5, 1, cells.length).setValues([cells]);
    },
    now: function () {
      return new Date();
    },
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        return fn();
      } finally {
        SpreadsheetApp.flush();   // the next request sees this one's row
        lock.releaseLock();
      }
    },
    busy: function () {
      var cache = CacheService.getScriptCache();
      var key = 'joins-' + Math.floor(Date.now() / 60000);
      var n = Number(cache.get(key) || 0) + 1;
      cache.put(key, String(n), 120);
      return n > JOINS_PER_MINUTE;
    },
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function page_(title, body) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><div style="font:17px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
    'max-width:34em;margin:12vh auto;padding:0 20px;color:#000">' + body + '</div>')
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Both forms post here. With js=1 (form.js) the answer is JSON; without JavaScript the browser posts the form
// itself, so the answer is a plain page.
function doPost(e) {
  var p = (e && e.parameter) || {};
  var result;
  try {
    result = handleJoin(p, deps_());
  } catch (err) {
    console.error(err);
    result = { ok: false, error: 'server' };
  }
  if (p.js === '1') return json_(result);
  if (!result.ok) {
    return page_('Something went wrong', "<h1>That didn't go through.</h1><p>Go back, check your work email and company, and try again.</p>");
  }
  return p.kind === 'request'   // the home page's Request access form
    ? page_('Request sent', '<h1>Request sent.</h1><p>A founder will reply by email.</p>' +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>')
    : page_("You're on the waitlist", "<h1>You're on the waitlist.</h1><p>We'll email you when the Heura Studio beta opens.</p>" +
      '<p><a href="https://heurastudios.com">Back to heurastudios.com</a></p>');
}

function doGet() {
  return json_({ ok: true, service: 'Heura waitlist' });
}
