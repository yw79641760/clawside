// ClawSide - Content Script Entry Point
// Initializes popup (selection bubble + result popup) and dock (floating ball + radial menu).
// Tool modules: src/components/popup.ts and src/components/dock.ts.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  // popup.ts handles selection bubble, result popup, streaming, and messages.
  // dock.ts handles the floating dock, radial menu, and panel state.
  (window as any).csPopup?.init?.();
  (window as any).csDock?.init?.();

})();