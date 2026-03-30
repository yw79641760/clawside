// ClawSide - Content Script Entry Point
// Initializes popup (selection bubble + result popup) and dock (floating ball + radial menu).
// Tool modules: src/components/popup.js and src/components/dock.js.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  // popup.js handles selection bubble, result popup, streaming, and messages.
  // dock.js handles the floating dock, radial menu, and panel state.
  window.csPopup.init();
  window.csDock.init();

})();
