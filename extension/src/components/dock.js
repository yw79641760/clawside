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

  // === Tool definitions ===
  var TOOLS = [
    {
      id: 'translate',
      label: chrome.i18n.getMessage('globalTranslate') || '\u5168\u6587\u7FFB\u8BD1',
      cancelLabel: chrome.i18n.getMessage('cancelGlobalTranslate') || '\u53D6\u6D88\u5168\u6587\u7FFB\u8BD1',
      loadingLabel: chrome.i18n.getMessage('translating') || '\u7FFB\u8BD1\u4E2D...',
      color: '#58a6ff',
      icon: window.svgIcon('translate'),
      loadingIcon: window.svgIcon('loading'),
      cancelIcon: window.svgIcon('cancel'),
    },
    {
      id: 'summarize',
      label: chrome.i18n.getMessage('globalSummarize') || '\u5168\u6587\u603B\u7ED3',
      color: '#3fb950',
      icon: window.svgIcon('summarize'),
    },
    {
      id: 'ask',
      label: chrome.i18n.getMessage('globalAsk') || '\u5168\u6587\u63D0\u95EE',
      color: '#f0883e',
      icon: window.svgIcon('ask'),
    },
  ];

  // === Translation state ===
  var isTranslating = false;

  // === Radial menu layout constants ===
  var BUTTON_RADIUS = 16; // px (button is 32x32)
  var EXPAND_RADIUS = 48; // px from dock center to button center
  var PER_ANGLE     = 45; // degrees per button

  // === Init ===
  async function init() {
    // Wire Chrome tab/navigation listeners (shared with popup.js via tabContextManager)
    window.tabContextManager.init();

    // Inject SVG sprite for icons
    window.injectSprite(chrome.runtime.getURL('assets/icons/icons.svg')).catch(function () {});

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
    // 清理旧的 radialContainer 和 backdrop（如果存在）
    var oldContainer = document.querySelector('.cs-radial-container');
    var oldBackdrop = document.querySelector('.cs-radial-backdrop');
    if (oldContainer) oldContainer.remove();
    if (oldBackdrop) oldBackdrop.remove();

    backdrop = document.createElement('div');
    backdrop.className = 'cs-radial-backdrop';
    document.body.appendChild(backdrop);

    radialContainer = document.createElement('div');
    radialContainer.className = 'cs-radial-container';

    var leaveTimer = null;
    dock.addEventListener('mouseleave', function () {
      if (!menuOpen) return;
      leaveTimer = setTimeout(function () {
        if (menuOpen) closeMenu(false);
        leaveTimer = null;
      }, 2000);
    });

    var pageTranslated = document.body.classList.contains('cs-page-translated');

    TOOLS.forEach(function (tool) {
      var btn = document.createElement('button');
      btn.className = 'cs-radial-btn';
      btn.dataset.tool = tool.id;
      btn.style.cssText += ';background:' + tool.color + '1a;border-color:' + tool.color + '55;';

      var label = tool.label;
      var icon = tool.icon;
      if (tool.id === 'translate') {
        if (isTranslating) {
          label = tool.loadingLabel || tool.label;
          icon = tool.loadingIcon || tool.icon;
        } else if (pageTranslated) {
          // 只有正在显示翻译时才显示取消 icon
          // 如果是 hidden 状态（翻译被隐藏），显示默认 icon 让用户可以重新显示
          label = tool.cancelLabel || tool.label;
          icon = tool.cancelIcon || tool.icon;
        }
      }

      btn.innerHTML =
        '<span style="color:' + tool.color + '">' + icon + '</span>' +
        '<span class="cs-radial-label">' + label + '</span>';

      var c = getDockCenter();
      btn.style.left = (c.x - BUTTON_RADIUS) + 'px';
      btn.style.top  = (c.y - BUTTON_RADIUS) + 'px';

      btn.addEventListener('mouseenter', function () {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      });
      btn.addEventListener('click', function (e) {
        if (isTranslating) {
          return;
        }
        e.stopPropagation();
        closeMenu(false);
        if (tool.id === 'translate') {
          handleTranslate();
        } else {
          openPanelWithTab(tool.id);
        }
      });

      radialContainer.appendChild(btn);
    });

    // 将 radialContainer 添加到 document.body
    document.body.appendChild(radialContainer);
  }

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    if (radialContainer) {
      radialContainer.querySelectorAll('.cs-radial-btn').forEach(function (btn) { btn.remove(); });
      backdrop.remove();
      radialContainer = null;
    }
    buildRadialMenu();
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
    var ctx = window.tabContextManager.getCurrent();
    var url   = (ctx && ctx.url)          || window.location.href || '';
    var title = (ctx && ctx.title)        || document.title || '';
    var text  = (ctx && ctx.selectedText) || '';

    // Check if side panel is already open by checking the dock's panel-open class
    var panelAlreadyOpen = dock && dock.classList.contains('panel-open');

    if (panelAlreadyOpen) {
      // Side panel is already open - send message to switch tab directly
      chrome.runtime.sendMessage({
        type:  'OPEN_TAB_IN_PANEL',
        tab:   tab,
        url:   url,
        title: title,
        text:  text,
        action: tab
      }).catch(function () {});
      // Also update storage for the storage listener in sidepanel.js
      chrome.storage.local.set({
        _pendingTab:   tab,
        _pendingUrl:   url,
        _pendingTitle:  title,
        _pendingText:   text,
        _pendingAction: tab
      }).catch(function () {});
    } else {
      // Side panel is not open - use the full open flow
      chrome.storage.local.set({
        _pendingTab:   tab,
        _pendingUrl:   url,
        _pendingTitle:  title,
        _pendingText:   text,
        _pendingAction: tab
      }).catch(function () {});

      chrome.runtime.sendMessage({
        type:  'panel-open-with-tab',
        tab:   tab,
        url:   url,
        title: title,
        text:  text,
        action: tab
      }).catch(function () {});
    }
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

  // === Translate batch - sends single request, returns parsed translations ===
  function translateBatchRequest(batch, targetLang, settings) {
    return new Promise(function (resolve, reject) {
      var requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var fullText = '';

      // Show loading placeholders for all paragraphs in this batch first
      batch.forEach(function(para) {
        if (para.idx !== undefined && window.csPageParser.showLoadingPlaceholder) {
          window.csPageParser.showLoadingPlaceholder(para.idx);
        }
      });

      var prompt = window.csPageParser.buildTranslationPrompt(batch, targetLang, settings);

      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt: prompt,
        port: settings.gatewayPort,
        token: settings.authToken,
        requestId: requestId,
        toolName: 'translate'
      });

      var listener = function (msg) {
        if (msg.requestId !== requestId) return;
        if (msg.type === 'clawside-stream-chunk') {
          fullText += msg.chunk;
        } else if (msg.type === 'clawside-stream-done') {
          chrome.runtime.onMessage.removeListener(listener);
          // Use page.js to parse the response
          var translations = window.csPageParser.parseTranslationResponse(fullText);
          // Show the translations (this will replace loading placeholders)
          window.csPageParser.showTranslation(translations);
          resolve(translations);
        } else if (msg.type === 'clawside-stream-error') {
          chrome.runtime.onMessage.removeListener(listener);
          // Show error placeholder for all paragraphs in this batch
          batch.forEach(function(para) {
            if (para.idx !== undefined && window.csPageParser.showErrorPlaceholder) {
              window.csPageParser.showErrorPlaceholder(para.idx);
            }
          });
          reject(new Error(msg.error));
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      setTimeout(function () {
        chrome.runtime.onMessage.removeListener(listener);
        // Show error placeholder for all paragraphs in this batch on timeout
        batch.forEach(function(para) {
          if (para.idx !== undefined && window.csPageParser.showErrorPlaceholder) {
            window.csPageParser.showErrorPlaceholder(para.idx);
          }
        });
        reject(new Error('Request timeout'));
      }, 180000);
    });
  }

  // === Global translate handler ===
  async function doGlobalTranslate() {
    // 检查页面是否处于隐藏状态（之前翻译过，但被隐藏了）
    var isHidden = document.body.classList.contains('cs-page-hidden');
    if (isHidden) {
      // 之前有翻译结果，只是被隐藏了，重新显示
      document.querySelectorAll('.cs-translation.hidden').forEach(function(el) {
        el.classList.remove('hidden');
      });
      document.body.classList.remove('cs-page-hidden');
      document.body.classList.add('cs-page-translated');
      if (radialContainer) buildRadialMenu();
      return;
    }

    // Use page.js to parse paragraphs from DOM
    var paragraphData = window.csPageParser.parseParagraph();

    // Get settings
    var stored = await chrome.storage.local.get(['clawside_settings']);
    var s = window.csSettings.validateSettings(stored.clawside_settings);
    var browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
    var targetLang = (s.translateLanguage && s.translateLanguage !== 'auto')
      ? s.translateLanguage
      : (s.language && s.language !== 'auto' ? s.language : browserLang);

    // Batch translate - 10 paragraphs per batch
    var BATCH_SIZE = 10;
    var batchCount = Math.ceil(paragraphData.length / BATCH_SIZE);

    for (var i = 0; i < batchCount; i++) {
      var start = i * BATCH_SIZE;
      var end = Math.min(start + BATCH_SIZE, paragraphData.length);
      var batch = paragraphData.slice(start, end);

      var batchTranslations = await translateBatchRequest(batch, targetLang, s);

      // Use page.js to show translation
      window.csPageParser.showTranslation(batchTranslations);
    }
  }

  // === Main translate handler ===
  async function handleTranslate() {
    if (isTranslating) {
      return;
    }

    // 检查页面是否已经有翻译结果（包括显示和隐藏状态）
    var hasTranslation = window.csPageParser.isPageTranslated();
    if (hasTranslation) {
      // 已经有翻译，检查是显示还是隐藏状态
      var isHidden = document.body.classList.contains('cs-page-hidden');
      if (isHidden) {
        // 之前有翻译结果，只是被隐藏了，重新显示
        document.querySelectorAll('.cs-translation.hidden').forEach(function(el) {
          el.classList.remove('hidden');
        });
        document.body.classList.remove('cs-page-hidden');
        document.body.classList.add('cs-page-translated');
      } else {
        // 翻译正在显示，隐藏它
        window.csPageParser.hideTranslation();
      }
      buildRadialMenu();
      return;
    }

    isTranslating = true;
    // 重新构建菜单以显示 loading 图标，并定位按钮
    buildRadialMenu();
    positionRadialMenu();

    try {
      await doGlobalTranslate();
    } catch (err) {
      console.error('Global translate failed:', err);
    } finally {
      isTranslating = false;
      buildRadialMenu();
      positionRadialMenu();
    }
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