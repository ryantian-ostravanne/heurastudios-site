// The home page: the screen recording, and the Request access form.
(function () {
  'use strict';

  // ---- the recording (recording.js: plays while on screen, in the current appearance's files, Pause and Play)
  var video = document.querySelector('.hm-video');
  var toggle = document.querySelector('.hm-toggle');
  if (video && toggle && video.canPlayType && window.ovRecording) ovRecording(video, toggle);

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
