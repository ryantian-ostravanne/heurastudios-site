// The waitlist page (/waitlist/): the form, the sample chat widget, and the reveal-on-scroll animation.
(function () {
  'use strict';
  var root = document.documentElement;
  var motion = root.classList.contains('ov-motion');   // set in <head> unless Reduce Motion is on

  // ---- the form (the shared form logic is in form.js)

  var form = document.getElementById('wl-form');
  if (form && window.ovForm) {
    ovForm.setup({
      form: form,
      fields: ['email', 'company'],
      error: document.getElementById('wl-error'),
      done: document.getElementById('wl-done'),
      doneText: document.getElementById('wl-done-text'),
      sendingLabel: 'Joining…',
      validate: function (v) {
        if (!ovForm.isEmail(v.email)) return ['Enter your work email, like you@company.com.', 'email'];
        if (!v.company) return ['Enter your company’s name.', 'company'];
        if (v.company.length > 100) return ['Your company’s name can be up to 100 characters.', 'company'];
      },
      serverErrors: {
        email: ['That email address doesn’t look right. Check it and try again.', 'email'],
        company: ['Check your company’s name and try again.', 'company'],
      },
      doneMessage: function (email, already) {
        return already
          ? 'You were already on it. An email will go to ' + email + ' when the Heura Studios beta opens.'
          : 'An email will go to ' + email + ' when the Heura Studios beta opens.';
      },
    });
  }

  // ---- the sample chat: the bubble opens and closes the window. [data-chat-open="load"] pops it open shortly
  // after the page loads, unless the visitor has already used the bubble.

  function setupChat(el) {
    var card = el.querySelector('.ov-chat-card');
    var bubble = el.querySelector('.ov-chat-bubble');
    if (!card || !bubble) return;
    var touched = false;
    var timer = 0;

    function setOpen(open) {
      el.classList.toggle('is-open', open);
      bubble.setAttribute('aria-expanded', open ? 'true' : 'false');
      bubble.setAttribute('aria-label', open ? 'Close the sample chat' : 'Open the sample chat');
    }

    setOpen(false);
    bubble.hidden = false;
    bubble.addEventListener('click', function () {
      touched = true;
      clearTimeout(timer);
      setOpen(!el.classList.contains('is-open'));
    });
    if (el.getAttribute('data-chat-open') === 'load') {
      timer = setTimeout(function () { if (!touched) setOpen(true); }, motion ? 700 : 0);
    }
  }

  var chats = document.querySelectorAll('.ov-chat');
  for (var c = 0; c < chats.length; c++) setupChat(chats[c]);

  // ---- reveal on scroll: [data-reveal] elements get .is-in once they come into view (the CSS animates it)

  if (motion) {
    root.classList.add('ov-live');
    var seen = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.classList.add('is-in');
        seen.unobserve(entries[i].target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    var reveals = document.querySelectorAll('[data-reveal]');
    for (var r = 0; r < reveals.length; r++) seen.observe(reveals[r]);
  }

  // Reduce Motion turned on with the page open: stop animating
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function stopMotion() {
    if (!reduce.matches || !motion) return;
    motion = false;
    root.classList.remove('ov-motion', 'ov-live');
  }
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', stopMotion);
  else if (reduce && reduce.addListener) reduce.addListener(stopMotion);
})();
