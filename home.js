// The home page: the screen recording, and the Request access form.
(function () {
  'use strict';
  var root = document.documentElement;

  // ---- the recording
  // Plays muted and looping while it's on screen, in the files for the current theme (and, on a phone, the files
  // recorded at phone size: the <source media> picks those). Play/Pause is the visitor's call from then on.
  // With Reduce Motion it waits on its first frame until Play. Without JS the browser's own controls show instead.

  function setupRecording(video, toggle) {
    var reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var phone = window.matchMedia ? matchMedia('(max-width: 599px)') : null;   // same breakpoint as <source media>
    var onScreen = false;
    var userChoice = null;      // true/false once the visitor presses Play or Pause
    var loadedTheme = 'light';  // the HTML names the light files

    function shouldPlay() {
      return userChoice !== null ? userChoice : !(reduceMotion && reduceMotion.matches);
    }

    function sync() {
      var play = shouldPlay();
      if (onScreen && play) {
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked (e.g. data saver): the first frame stays */ });
      } else {
        video.pause();
      }
      toggle.textContent = play ? 'Pause' : 'Play';
      toggle.setAttribute('aria-label', play ? 'Pause the recording' : 'Play the recording');
    }

    // Point the poster and the <source>s at the current theme's files. Returns true if the sources changed
    // (the browser only re-picks a source on load()).
    function matchTheme() {
      var theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var desktopBase = video.getAttribute('data-' + theme);
      var phoneBase = video.getAttribute('data-phone-' + theme);
      if (!desktopBase || !phoneBase) return false;
      video.poster = (phone && phone.matches ? phoneBase : desktopBase) + '.webp';
      if (theme === loadedTheme) return false;
      loadedTheme = theme;
      var sources = video.querySelectorAll('source');
      for (var i = 0; i < sources.length; i++) {
        var base = sources[i].hasAttribute('media') ? phoneBase : desktopBase;
        sources[i].src = base + (sources[i].type === 'video/webm' ? '.webm' : '.mp4');
      }
      return true;
    }

    function reload() {
      video.load();
      sync();
    }

    video.removeAttribute('controls');
    if (matchTheme()) video.load();   // before preload, so a dark page never fetches the light files
    video.preload = 'metadata';
    toggle.hidden = false;
    toggle.addEventListener('click', function () {
      userChoice = !shouldPlay();
      sync();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0.25 }).observe(video);
    } else {
      onScreen = true;
    }
    if (reduceMotion && reduceMotion.addEventListener) reduceMotion.addEventListener('change', sync);
    // crossed the phone breakpoint: the other <source>s apply, but only after load()
    if (phone && phone.addEventListener) {
      phone.addEventListener('change', function () {
        matchTheme();
        reload();
      });
    }
    // theme changed (the footer's setting, or the system's)
    new MutationObserver(function () {
      if (matchTheme()) reload();
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
  }

  var video = document.querySelector('.hm-video');
  var toggle = document.querySelector('.hm-toggle');
  if (video && toggle && video.canPlayType) setupRecording(video, toggle);

  // ---- Request access (the shared form logic is in form.js)

  var form = document.getElementById('hm-form');
  if (!form || !window.ovForm) return;
  ovForm.setup({
    form: form,
    fields: ['name', 'email', 'company', 'role', 'use'],
    error: document.getElementById('hm-error'),
    done: document.getElementById('hm-done'),
    doneText: document.getElementById('hm-done-text'),
    sendingLabel: 'Sending…',
    validate: function (v) {
      if (!v.name) return ['Enter your name.', 'name'];
      if (!ovForm.isEmail(v.email)) return ['Enter your work email, like you@company.com.', 'email'];
      if (!v.company) return ['Enter your company’s name.', 'company'];
    },
    serverErrors: {
      email: ['That email address doesn’t look right. Check it and try again.', 'email'],
      company: ['Check your company’s name and try again.', 'company'],
      name: ['Check your name and try again.', 'name'],
    },
    doneMessage: function (email, already) {
      return already
        ? 'There’s already a request from ' + email + '. A founder will reply there.'
        : 'A founder will reply to ' + email + '.';
    },
  });
})();
