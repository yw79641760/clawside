// ClawSide - Content Script Entry Point
// Initializes the floating-ball UI (bubble + popup + dock + radial menu).
// All floating-UI logic lives in comp/bubble/bubble.js.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  // csBubble.init() is called after tools are loaded via manifest.json content_scripts.
  // All tool globals (injectTheme, injectStyles, etc.) are available via window.*.
  window.csBubble.init();

})();
