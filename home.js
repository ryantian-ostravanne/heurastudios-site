// The home page: the recording of a run, and the Request access form.
(function () {
  'use strict';
  var root = document.documentElement;

  // ── the recording ──────────────────────────────────────────────────
  // It plays muted and looping, without the browser's controls, while it's on screen, in the file made for the
  // appearance in use (and on a phone, the one recorded at a phone's size: the sources' media picks it). Pause stops it
  // (and Play starts it again); with Reduce Motion it waits on its first frame until Play. Without JavaScript the
  // browser's controls show instead and nothing plays by itself.
  var video = document.querySelector('.hm-video');
  var toggle = document.querySelector('.hm-toggle');
  if (video && toggle && video.canPlayType) {
    var still = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var phone = window.matchMedia ? matchMedia('(max-width: 599px)') : null;   // as the sources' media says
    var visible = false;
    var chose = null;   // true or false once the visitor has pressed Play or Pause: theirs from then on
    var theme = 'light';   // the appearance of the files the HTML names

    var wanted = function () { return chose !== null ? chose : !(still && still.matches); };
    var start = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* blocked (a data saver): the first frame stays */ });
    };
    var sync = function () {
      var on = wanted();
      if (visible && on) start(); else video.pause();
      toggle.textContent = on ? 'Pause' : 'Play';
      toggle.setAttribute('aria-label', on ? 'Pause the recording' : 'Play the recording');
    };
    var pick = function () {   // the light or the dark recordings, as the page is (load() only to change the files)
      var want = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var desk = video.getAttribute('data-' + want), hand = video.getAttribute('data-phone-' + want);
      if (!desk || !hand) return;
      video.poster = (phone && phone.matches ? hand : desk) + '.webp';   // (the frame's background already is)
      if (want === theme) return;
      theme = want;
      var sources = video.querySelectorAll('source');   // phone .mp4 and .webm, then the desktop's
      sources[0].src = hand + '.mp4';
      sources[1].src = hand + '.webm';
      sources[2].src = desk + '.mp4';
      sources[3].src = desk + '.webm';
      video.load();
      sync();
    };

    video.removeAttribute('controls');
    pick();   // (before preload: a dark page never starts on the light files)
    video.preload = 'metadata';
    toggle.hidden = false;
    toggle.addEventListener('click', function () { chose = !wanted(); sync(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0.25 }).observe(video);
    } else {
      visible = true;
    }
    if (still && still.addEventListener) still.addEventListener('change', sync);
    // a phone turned to a wider screen (or a window narrowed past it): the sources' media picks the other recording,
    // which the browser only does on load()
    if (phone && phone.addEventListener) phone.addEventListener('change', function () { pick(); video.load(); sync(); });
    // the appearance changed (the footer's setting, or the system's): the other recording
    new MutationObserver(pick).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
  }

  // ── Request access ─────────────────────────────────────────────────
  // It checks the fields, posts them to the Apps Script in the form's action with js=1 (so the script answers JSON)
  // and shows the result in place. Without this script the form posts straight to the script.
  var form = document.getElementById('hm-form');
  if (!form || !window.fetch || !window.URLSearchParams || !window.FormData) return;
  var f = form.elements;
  var fields = [f.name, f.email, f.company, f.role, f.use];
  var error = document.getElementById('hm-error');
  var submit = form.querySelector('.hm-submit');
  var done = document.getElementById('hm-done');
  var doneText = document.getElementById('hm-done-text');
  var label = submit.textContent;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var busy = false;
  var hints = fields.map(function (x) { return x.getAttribute('aria-describedby'); });   // (the textarea's hint)

  // Where this person came from, for the sheet (as the waitlist page does): this page's query (utm tags), else the
  // page on this site that sent them here, else the other website that did.
  function whereFrom() {
    if (location.search) return location.pathname + location.search;
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.host === location.host) return ref.pathname + ref.search;
      if (ref) return 'from ' + ref.hostname;
    } catch (e) {
      // an unreadable referrer: fall through
    }
    return location.pathname;
  }
  f.from.value = whereFrom();

  // The message, and the field it's about: marked invalid and described by the message (so a screen reader landing
  // on it hears why), the others back as they were.
  function say(message, field) {
    error.textContent = message;
    fields.forEach(function (x, i) {
      var described = x === field ? ['hm-error'].concat(hints[i] || []).join(' ') : hints[i];
      if (x === field) x.setAttribute('aria-invalid', 'true');
      else x.removeAttribute('aria-invalid');
      if (described) x.setAttribute('aria-describedby', described);
      else x.removeAttribute('aria-describedby');
    });
    if (field) field.focus();
  }

  function ready() {
    busy = false;
    submit.disabled = false;
    submit.textContent = label;
  }

  function sent(address, already) {
    form.hidden = true;
    doneText.textContent = already
      ? 'There’s already a request from ' + address + '. A founder will reply there.'
      : 'A founder will reply to ' + address + '.';
    done.hidden = false;
    done.focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;
    var name = f.name.value.trim();
    var address = f.email.value.trim();
    var company = f.company.value.trim();
    if (!name) return say('Enter your name.', f.name);
    if (address.length > 254 || !EMAIL_RE.test(address)) return say('Enter your work email, like you@company.com.', f.email);
    if (!company) return say('Enter your company’s name.', f.company);
    say('', null);

    busy = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    var body = new URLSearchParams(new FormData(form));
    body.set('name', name);
    body.set('email', address);
    body.set('company', company);
    body.set('js', '1');

    fetch(form.action, { method: 'POST', body: body })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (result) {
        if (result && result.ok) return sent(address, result.already);
        ready();
        if (result && result.error === 'email') return say('That email address doesn’t look right. Check it and try again.', f.email);
        if (result && result.error === 'company') return say('Check your company’s name and try again.', f.company);
        if (result && result.error === 'name') return say('Check your name and try again.', f.name);
        say('That didn’t go through. Try again in a minute.', null);
      })
      .catch(function () {
        ready();
        say('That didn’t go through. Check your connection and try again.', null);
      });
  });
})();
