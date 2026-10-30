// The site's screen recordings (the home page's run, home.js; each tool's, tools.js): ovRecording(video, toggle, words)
// plays one muted and looping while it's on screen, in the files for the current appearance (data-light, data-dark:
// each a path without its extension). With data-phone-light and data-phone-dark too, a phone gets the files recorded at
// a phone's size (the <source media> picks those). Play/Pause (toggle) is the visitor's call from then on. With Reduce
// Motion it waits on its first frame until Play. Without JS the browser's own controls show and nothing plays by itself.
(function () {
  'use strict';
  var root = document.documentElement;

  window.ovRecording = function (video, toggle, words) {
    words = words || { play: 'Play the recording', pause: 'Pause the recording' };
    var reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var hasPhone = video.hasAttribute('data-phone-light') && video.hasAttribute('data-phone-dark');
    var phone = hasPhone && window.matchMedia ? matchMedia('(max-width: 599px)') : null;   // same breakpoint as <source media>
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
      toggle.setAttribute('aria-label', play ? words.pause : words.play);
    }

    // Point the poster and the <source>s at the current theme's files. Returns true if the sources changed
    // (the browser only re-picks a source on load()).
    function matchTheme() {
      var theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var base = video.getAttribute('data-' + theme);
      var phoneBase = hasPhone ? video.getAttribute('data-phone-' + theme) : base;
      if (!base || !phoneBase) return false;
      video.poster = (phone && phone.matches ? phoneBase : base) + '.webp';
      if (theme === loadedTheme) return false;
      loadedTheme = theme;
      var sources = video.querySelectorAll('source');
      for (var i = 0; i < sources.length; i++) {
        var b = sources[i].hasAttribute('media') ? phoneBase : base;
        sources[i].src = b + (sources[i].type === 'video/webm' ? '.webm' : '.mp4');
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
  };
})();
