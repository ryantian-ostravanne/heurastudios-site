// Every page: the Appearance setting in the footer, and the header's bottom rule once the page scrolls.
// (The theme itself is applied before the first paint by the inline script in _includes/head.html.)
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'ov-theme';   // localStorage: "light" or "dark". "System" saves nothing and follows the OS.
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var radios = document.querySelectorAll('input[name="ov-appearance"]');
  var fadeTimer = 0;

  // ---- appearance

  function saved() {
    try {
      var value = window.localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function save(value) {
    try {
      if (value) window.localStorage.setItem(KEY, value);
      else window.localStorage.removeItem(KEY);
    } catch (e) {
      // private mode / blocked storage: the choice still holds on this page
    }
  }

  function system() {
    return media && media.matches ? 'dark' : 'light';
  }

  // fade: cross-fade the colors (the .ov-theming class in site.css). Never on the first paint.
  function apply(theme, fade) {
    if (root.getAttribute('data-theme') === theme) return;
    if (fade) {
      root.classList.add('ov-theming');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { root.classList.remove('ov-theming'); }, 400);
    }
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', meta.getAttribute('data-' + theme) || (theme === 'dark' ? '#000000' : '#ffffff'));
  }

  function check(choice) {
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === choice;
  }

  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function (event) {
      var choice = event.target.value;
      if (choice === 'light' || choice === 'dark') {
        save(choice);
        apply(choice, true);
      } else {
        save(null);
        apply(system(), true);
      }
    });
  }

  // the OS switched light/dark while the page is open (only matters on "System")
  if (media) {
    var followSystem = function () { if (!saved()) apply(system(), true); };
    if (media.addEventListener) media.addEventListener('change', followSystem);
    else if (media.addListener) media.addListener(followSystem);
  }

  // a choice made in another tab
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY && event.key !== null) return;
    check(saved() || 'system');
    apply(saved() || system(), true);
  });

  if (!root.getAttribute('data-theme')) apply(saved() || system(), false);
  check(saved() || 'system');

  // ---- the header's bottom rule, once the page has scrolled

  var header = document.querySelector('.ov-top');
  var queued = false;
  function updateHeader() {
    queued = false;
    if (header) header.classList.toggle('is-scrolled', (window.scrollY || window.pageYOffset) > 2);
  }
  window.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(updateHeader);
  }, { passive: true });
  updateHeader();
})();
