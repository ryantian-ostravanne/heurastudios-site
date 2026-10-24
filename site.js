// Every page. In order:
// - the Appearance setting in the footer (System, Light, Dark). The inline script in each page's <head> has already
//   set html[data-theme] from the saved choice (localStorage "ov-theme": "light" or "dark") or the system's setting,
//   before anything painted. System saves nothing, so the page follows the system's own setting, as Apple's dark mode
//   guidance asks; Light and Dark stick across pages and visits; a choice made in another tab is picked up too.
// - the header's rule once the page scrolls.
// - motion, only when the head script set html.ov-motion (not with Reduce Motion): things rise into place as they
//   come into view ([data-reveal] gets .is-in, once). The home page has none: its recording is its one moving thing.
// - the sample chat (the waitlist page): its bubble opens and closes the window. It pops open after the page loads
//   ([data-chat-open="load"]), until someone uses the bubble.
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'ov-theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var radios = document.querySelectorAll('input[name="ov-appearance"]');
  var motion = root.classList.contains('ov-motion');
  var timer = 0;

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
      // private mode or blocked storage: the choice still holds on this page
    }
  }

  function system() {
    return media && media.matches ? 'dark' : 'light';
  }

  // fade: cross-fade the colors (about 250ms). Never on the first paint.
  function apply(theme, fade) {
    if (root.getAttribute('data-theme') === theme) return;
    if (fade) {
      root.classList.add('ov-theming');
      clearTimeout(timer);
      timer = setTimeout(function () { root.classList.remove('ov-theming'); }, 400);
    }
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', meta.getAttribute('data-' + theme) || (theme === 'dark' ? '#000000' : '#ffffff'));
  }

  function mark(choice) {
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

  if (media) {
    var followSystem = function () { if (!saved()) apply(system(), true); };
    if (media.addEventListener) media.addEventListener('change', followSystem);
    else if (media.addListener) media.addListener(followSystem);
  }

  window.addEventListener('storage', function (event) {
    if (event.key !== KEY && event.key !== null) return;
    mark(saved() || 'system');
    apply(saved() || system(), true);
  });

  if (!root.getAttribute('data-theme')) apply(saved() || system(), false);
  mark(saved() || 'system');

  // ---- the sample chat

  function chat(el) {
    var card = el.querySelector('.ov-chat-card');
    var bubble = el.querySelector('.ov-chat-bubble');
    if (!card || !bubble) return null;
    var touched = false;
    var wait = 0;
    function set(open) {
      el.classList.toggle('is-open', open);
      bubble.setAttribute('aria-expanded', open ? 'true' : 'false');
      bubble.setAttribute('aria-label', open ? 'Close the sample chat' : 'Open the sample chat');
    }
    set(false);
    bubble.hidden = false;
    bubble.addEventListener('click', function () {
      touched = true;
      clearTimeout(wait);
      set(!el.classList.contains('is-open'));
    });
    return {
      pop: function (delay) {
        if (touched) return;
        clearTimeout(wait);
        wait = setTimeout(function () { set(true); }, delay);
      },
      rest: function () {
        if (touched) return;
        clearTimeout(wait);
        set(false);
      }
    };
  }

  var onLoad = document.querySelectorAll('.ov-chat[data-chat-open="load"]');
  for (var c = 0; c < onLoad.length; c++) {
    var loaded = chat(onLoad[c]);
    if (loaded) loaded.pop(motion ? 700 : 0);
  }

  // ---- motion

  if (motion) {
    root.classList.add('ov-live');
    var seen = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (!entries[e].isIntersecting) continue;
        entries[e].target.classList.add('is-in');
        seen.unobserve(entries[e].target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    var reveals = document.querySelectorAll('[data-reveal]');
    for (var r = 0; r < reveals.length; r++) seen.observe(reveals[r]);
  }

  // Reduce Motion turned on with the page open: everything stops moving
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function stillness() {
    if (!calm || !calm.matches || !motion) return;
    motion = false;
    root.classList.remove('ov-motion', 'ov-live');
  }
  if (calm && calm.addEventListener) calm.addEventListener('change', stillness);
  else if (calm && calm.addListener) calm.addListener(stillness);

  // ---- scrolling: the header's rule

  var header = document.querySelector('.ov-top');
  var waiting = false;
  function update() {
    waiting = false;
    if (header) header.classList.toggle('is-scrolled', (window.scrollY || window.pageYOffset) > 2);
  }
  window.addEventListener('scroll', function () {
    if (waiting) return;
    waiting = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  update();
})();
