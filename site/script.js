// Optional enhancement: "Copy command" buttons. The page works fully without JavaScript.
(function () {
  'use strict';
  var status = document.getElementById('copy-status');
  var buttons = document.querySelectorAll('.copy-btn');
  if (!buttons.length) return;

  function announce(msg) { if (status) status.textContent = msg; }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  buttons.forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function (ok) {
        var msg = ok ? 'Copied ' + text : 'Could not copy. Type ' + text + ' in Discord.';
        btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
        announce(msg);
        setTimeout(function () { btn.textContent = label; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else {
        done(fallbackCopy(text));
      }
    });
  });
})();
