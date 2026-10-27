// Shared by the two forms that post to the Google Apps Script in _backend/:
// the home page's Request access form (home.js) and the waitlist form (waitlist/waitlist.js).
//
// With JS: check the fields, POST them with js=1 (so the script answers JSON) and show the result in place.
// Without JS: the browser posts the form itself and the script answers with a plain page.
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function isEmail(value) {
    return value.length <= 254 && EMAIL_RE.test(value);
  }

  // The sheet's "Came from" column: this page's query (utm tags), else the page on this site that linked here,
  // else the other website that did.
  function whereFrom() {
    if (location.search) return location.pathname + location.search;
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.host === location.host) return ref.pathname + ref.search;
      if (ref) return 'from ' + ref.hostname;
    } catch (e) {
      // unreadable referrer: fall through
    }
    return location.pathname;
  }

  // opts:
  //   form            the <form>; its action is the Apps Script URL
  //   fields          names of the inputs that can be flagged invalid
  //   error           the element that shows messages (role="alert")
  //   done, doneText  the panel shown on success, and the element for its text
  //   sendingLabel    the submit button's text while sending
  //   validate(v)     v: the trimmed values by name -> [message, fieldName] for the first problem, or nothing
  //   serverErrors    the script's error codes -> [message, fieldName]
  //   doneMessage(email, already) -> the success text ("already": this email had already signed up)
  function setupForm(opts) {
    var form = opts.form;
    var submit = form.querySelector('[type="submit"]');
    var label = submit.textContent;
    var inputs = opts.fields.map(function (name) { return form.elements[name]; });
    var hints = inputs.map(function (x) { return x.getAttribute('aria-describedby'); });   // e.g. a textarea's hint
    var busy = false;

    form.elements.from.value = whereFrom();

    // Show a message. The field it's about is marked invalid and described by the message (so a screen reader on
    // it hears why); every other field goes back to how it was.
    function say(message, fieldName) {
      opts.error.textContent = message;
      inputs.forEach(function (x, i) {
        var flagged = fieldName && x === form.elements[fieldName];
        var described = flagged ? [opts.error.id].concat(hints[i] || []).join(' ') : hints[i];
        if (flagged) x.setAttribute('aria-invalid', 'true');
        else x.removeAttribute('aria-invalid');
        if (described) x.setAttribute('aria-describedby', described);
        else x.removeAttribute('aria-describedby');
      });
      if (fieldName) form.elements[fieldName].focus();
    }

    function ready() {
      busy = false;
      submit.disabled = false;
      submit.textContent = label;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;

      var values = {};
      inputs.forEach(function (x) { values[x.name] = x.value.trim(); });
      var problem = opts.validate(values);
      if (problem) return say(problem[0], problem[1]);
      say('', null);

      busy = true;
      submit.disabled = true;
      submit.textContent = opts.sendingLabel;
      var body = new URLSearchParams(new FormData(form));
      Object.keys(values).forEach(function (name) { body.set(name, values[name]); });
      body.set('js', '1');

      fetch(form.action, { method: 'POST', body: body })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (result) {
          if (result && result.ok) {
            form.hidden = true;
            opts.doneText.textContent = opts.doneMessage(values.email, result.already);
            opts.done.hidden = false;
            opts.done.focus();
            return;
          }
          ready();
          var known = result && opts.serverErrors[result.error];
          if (known) say(known[0], known[1]);
          else say('That didn’t go through. Try again in a minute.', null);
        })
        .catch(function () {
          ready();
          say('That didn’t go through. Check your connection and try again.', null);
        });
    });
  }

  // Old browsers fall back to the plain, no-JS post.
  if (!window.fetch || !window.URLSearchParams || !window.FormData) return;
  window.ovForm = { setup: setupForm, isEmail: isEmail };
})();
