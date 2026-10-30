// The Tools page: each tool's recording plays while it's on screen, with its own Pause and Play (recording.js).
(function () {
  'use strict';
  if (!window.ovRecording) return;
  var films = document.querySelectorAll('.tl-film');
  for (var i = 0; i < films.length; i++) {
    var video = films[i].querySelector('.tl-video');
    var toggle = films[i].querySelector('.tl-toggle');
    if (!video || !toggle || !video.canPlayType) continue;
    var name = toggle.getAttribute('data-name');
    ovRecording(video, toggle, { play: 'Play the ' + name + ' recording', pause: 'Pause the ' + name + ' recording' });
  }
})();
