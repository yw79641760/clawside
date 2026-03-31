// ClawSide - Dock (Floating Ball + Radial Menu)
// Persistent floating dock at browser edge, radial menu on hover/click.
// Loaded after tab-context-manager.js in manifest content_scripts array.

(function () {
  'use strict';

  // === Local state ===
  var dock = null;
  var isSticking = false;
  var idleTimer = null;
  var isDragging = false;
  var menuOpen = false;
  var backdrop = null;
  var radialContainer = null;
  var startX, startY, startRight, startBottom;

  // === Inline SVG icons for radial menu buttons ===
  var TOOLS = [
    {
      id: 'translate',
      label: chrome.i18n.getMessage('tabTranslate') || '\u7FFB\u8BD1',
      color: '#58a6ff',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse></svg>',
    },
    {
      id: 'summarize',
      label: chrome.i18n.getMessage('tabSummarize') || '\u603B\u7ED3',
      color: '#3fb950',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    },
    {
      id: 'ask',
      label: chrome.i18n.getMessage('tabAsk') || '\u63D0\u95EE',
      color: '#f0883e',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    },
  ];

  // Radial menu layout constants
  var BUTTON_RADIUS = 16; // px (button is 32x32)
  var EXPAND_RADIUS = 48; // px from dock center to button center
  var PER_ANGLE     = 45; // degrees per button

  // === Init ===
  async function init() {
    // Wire Chrome tab/navigation listeners (shared with popup.js via tabContextManager)
    window.tabContextManager.init();

    var appearance = window.resolveAppearance
      ? window.resolveAppearance('system')
      : 'dark';
    window.injectTheme(window.THEMES[appearance] || window.THEMES.dark);
    window.injectStyles();
    createDock();
    setupPanelStateListener();
    chrome.runtime.sendMessage({
      type: 'content_ready',
      url: window.location.href,
      title: document.title
    }).catch(function () {});
  }

  // === Radial menu positioning ===
  function calculatePetalPositions(radius, perAngle, count, startAngle, clockwise) {
    startAngle = startAngle !== undefined ? startAngle : -90;
    clockwise = clockwise !== undefined ? clockwise : true;
    var degToRad = function (deg) { return (deg * Math.PI) / 180; };
    return Array.from({ length: count }, function (_, i) {
      var direction = clockwise ? -1 : 1;
      var totalDeg = startAngle + i * perAngle * direction;
      var rad = degToRad(totalDeg);
      return { x: radius * Math.sin(rad), y: radius * Math.cos(rad) };
    });
  }

  function getDockCenter() {
    var rect = dock.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function positionRadialMenu() {
    if (!dock) return;
    var c = getDockCenter();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var positions = calculatePetalPositions(EXPAND_RADIUS, PER_ANGLE, TOOLS.length);
    document.querySelectorAll('.cs-radial-btn').forEach(function (btn, i) {
      if (i >= positions.length) return;
      var pos = positions[i];
      var left = Math.max(0, Math.min(vw - 32, c.x + pos.x - BUTTON_RADIUS));
      var top  = Math.max(0, Math.min(vh - 32, c.y + pos.y - BUTTON_RADIUS));
      btn.style.left = left + 'px';
      btn.style.top  = top  + 'px';
    });
  }

  function buildRadialMenu() {
    backdrop = document.createElement('div');
    backdrop.className = 'cs-radial-backdrop';
    document.body.appendChild(backdrop);

    radialContainer = document.createElement('div');

    var leaveTimer = null;
    dock.addEventListener('mouseleave', function () {
      if (!menuOpen) return;
      leaveTimer = setTimeout(function () {
        if (menuOpen) closeMenu(false);
        leaveTimer = null;
      }, 2000);
    });

    TOOLS.forEach(function (tool) {
      var btn = document.createElement('button');
      btn.className = 'cs-radial-btn';
      btn.dataset.tool = tool.id;
      btn.style.cssText += ';background:' + tool.color + '1a;border-color:' + tool.color + '55;';
      btn.innerHTML =
        '<span style="color:' + tool.color + '">' + tool.icon + '</span>' +
        '<span class="cs-radial-label">' + tool.label + '</span>';

      var c = getDockCenter();
      btn.style.left = (c.x - BUTTON_RADIUS) + 'px';
      btn.style.top  = (c.y - BUTTON_RADIUS) + 'px';

      btn.addEventListener('mouseenter', function () {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu(false);
        openPanelWithTab(tool.id);
      });

      radialContainer.appendChild(btn);
      document.body.appendChild(btn);
    });
  }

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    if (!radialContainer) buildRadialMenu();
    positionRadialMenu();
    backdrop.classList.add('visible');
    document.querySelectorAll('.cs-radial-btn').forEach(function (btn, i) {
      setTimeout(function () { btn.classList.add('expanded'); }, i * 60);
    });
    dock.classList.add('menu-open');
  }

  function closeMenu(animate) {
    if (!menuOpen) return;
    menuOpen = false;
    backdrop.classList.remove('visible');
    var btns = document.querySelectorAll('.cs-radial-btn');
    if (animate !== false) {
      [].slice.call(btns).reverse().forEach(function (btn, i) {
        setTimeout(function () { btn.classList.remove('expanded'); }, i * 30);
      });
    } else {
      btns.forEach(function (btn) { btn.classList.remove('expanded'); });
    }
    dock.classList.remove('menu-open');
  }

  function openPanelWithTab(tab) {
    // Pull current tab context from shared tabContextManager (HashMap + LRU).
    var ctx = window.tabContextManager.getCurrent();
    var url   = (ctx && ctx.url)          || window.location.href || '';
    var title = (ctx && ctx.title)        || document.title || '';
    var text  = (ctx && ctx.selectedText) || '';

    chrome.storage.local.set({
      _pendingTab:   tab,
      _pendingUrl:   url,
      _pendingTitle:  title,
      _pendingText:   text,
      _pendingAction: tab // use tab id as action (translate/summarize/ask)
    }).catch(function () {}); // Ignore errors (e.g., extension context invalidated)

    chrome.runtime.sendMessage({
      type:  'panel-open-with-tab',
      tab:   tab,
      url:   url,
      title: title,
      text:  text,
      action: tab
    }).catch(function () {});
  }

  function stickDock() {
    if (!dock) return;
    dock.classList.add('sticking');
    dock.classList.remove('scrolling');
    isSticking = true;
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    isSticking = false;
    if (dock) dock.classList.add('scrolling');
    idleTimer = setTimeout(function () {
      if (dock) dock.classList.remove('scrolling');
      stickDock();
    }, 1000);
  }

  function createDock() {
    if (dock) return;
    dock = document.createElement('button');
    dock.className = 'cs-dock';
    dock.id = 'cs-dock';

    var icon = document.createElement('span');
    icon.className = 'cs-dock-icon';
    icon.textContent = '\xD7';
    icon.style.fontSize = '16px';
    dock.appendChild(icon);

    dock.style.backgroundImage = "url('" + chrome.runtime.getURL('assets/icons/icon32.png') + "')";

    var aboutToDrag = false;
    dock.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      isDragging = true;
      aboutToDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      var rect = dock.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      aboutToDrag = true;
      dock.classList.remove('sticking');
      isSticking = false;
      clearTimeout(idleTimer);
      dock.style.right = Math.max(0, startRight - dx) + 'px';
      dock.style.bottom = Math.max(0, startBottom - dy) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      aboutToDrag = false;
      resetIdleTimer();
    });

    dock.addEventListener('mouseenter', function () {
      if (aboutToDrag) return;
      openMenu();
    });

    dock.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuOpen) closeMenu(); else openMenu();
    });

    document.addEventListener('click', function (e) {
      if (!menuOpen) return;
      if (!dock.contains(e.target) && (!radialContainer || !radialContainer.contains(e.target))) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) closeMenu();
    });

    document.body.appendChild(dock);

    var scrollTimer = null;
    window.addEventListener('scroll', function () {
      if (!isSticking) {
        resetIdleTimer();
      } else {
        dock.classList.remove('sticking');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(stickDock, 1000);
      }
    }, { passive: true });

    idleTimer = setTimeout(stickDock, 1000);
  }

  function setupPanelStateListener() {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.type === 'panel-state') {
        dock.classList.toggle('panel-open', msg.open);
      }
      return true;
    });
  }

  // === Public API ===
  window.csDock = { init: init };

})();
