// ClawSide - Full Side Panel Logic
// Shared modules loaded via <script> in sidepanel.html:
//   src/tools/icons.js        → window.SVG, window.svgIcon()
//   src/tools/browser.js      → getBrowserLocale(), copyToClipboard(), resolveLang(), getBrowserLang()
//   src/tools/streaming-result.js  → window.StreamingResult
//   src/shared/chat-session.js → ChatSession, chatSessionManager

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Config & Constants
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // === Notify background when panel is closed (ESC, click outside, etc.) ===
  window.addEventListener('unload', async () => {
    // Save ask session to history before closing
    await saveAskSessionToHistory();
    chrome.runtime.sendMessage({ type: 'sidepanel-closed' }).catch(() => {});
  });

  // Also save when page visibility changes (e.g., user switches tabs)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      await saveAskSessionToHistory();
    }
  });

  // === Chat State ===
  let chatSession = null;
  let currentChatMessageId = null;

  // === Apply Prompt with special variables (hasSelection, hasContent) ===
  var DEFAULT_PROMPTS = window.csSettings.DEFAULT_PROMPTS;
  var DEFAULT_PORT = window.csSettings.DEFAULT_PORT;

  function applyPrompt(template, vars) {
    if (!template) return '';
    return template
      .replace(/\{text\}/g, vars.text || '')
      .replace(/\{lang\}/g, vars.lang || 'English')
      .replace(/\{title\}/g, vars.title || '')
      .replace(/\{url\}/g, vars.url || '')
      .replace(/\{content\}/g, vars.content || '')
      .replace(/\{question\}/g, vars.question || '')
      .replace(/\{selectedText\}/g, vars.selectedText || '')
      .replace(/\{hasSelection\}[\s\S]*?\{\/hasSelection\}/g, vars.selectedText ? template.match(/\{hasSelection\}[\s\S]*?\{\/hasSelection\}/)?.[0].replace(/\{hasSelection\}|\{\/hasSelection\}/g, '') || '' : '')
      .replace(/\{hasContent\}[\s\S]*?\{\/hasContent\}/g, vars.content ? template.match(/\{hasContent\}[\s\S]*?\{\/hasContent\}/)?.[0].replace(/\{hasContent\}|\{\/hasContent\}/g, '') || '' : '');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 2: State Variables
  // ═══════════════════════════════════════════════════════════════════════════════

  // === UI State ===
  let currentTab = 'translate';
  let history = [];
  let browserLang = 'English';
  // Helper to get i18n message safely (avoid context invalidated errors)
  // Uses window.i18n from browser.js
  const i18n = window.i18n || ((key) => key);
  // Flag to track if pending messages were already loaded (to prevent double init)
  let _pendingMessagesLoaded = false;
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '', model: '', language: 'auto', translateLanguage: 'auto', appearance: 'system', toolPrompts: {} };

  // Per-tool deferred context backfill marker, keyed by current page URL.
  const deferredContextBackfillUrl = {
    summarize: '',
    ask: ''
  };

  // Guards the init() pending-tab logic against double-fires
  let _pendingReadGuard = false;

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 3: Language & i18n
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Translations (i18n + resolveLang/getBrowserLang from browser.js) ===

  async function applyPanelLanguage() {
    // Result titles
    $('titleTranslate') && ($('titleTranslate').textContent = i18n('resultTranslate'));
    $('titleSummarize') && ($('titleSummarize').textContent = i18n('resultSummarize'));
    $('titleAnswer') && ($('titleAnswer').textContent = i18n('resultAnswer'));
    // Copy buttons - icon only, no text
    // $('copyTranslateResult') && ($('copyTranslateResult').innerHTML = `${svgIcon('copy')} ${i18n('copy')}`);
    // $('copySummarizeResult') && ($('copySummarizeResult').innerHTML = `${svgIcon('copy')} ${i18n('copy')}`);
    // Inputs
    $('translateInput') && ($('translateInput').placeholder = i18n('translateInputPlaceholder'));
    // Settings
    $('settingsTitle') && ($('settingsTitle').textContent = i18n('settingsTitle'));
    $('labelTargetLang') && ($('labelTargetLang').textContent = i18n('targetLang'));
    $('labelTargetLangTranslate') && ($('labelTargetLangTranslate').textContent = i18n('labelTargetLangTranslate'));
    $('labelAppearance') && ($('labelAppearance').textContent = i18n('appearance'));
    $('optionAuto') && ($('optionAuto').textContent = i18n('optionAuto'));
    $('optionSystem') && ($('optionSystem').textContent = i18n('systemOpt'));
    $('optionLight') && ($('optionLight').textContent = i18n('lightOpt'));
    $('optionDark') && ($('optionDark').textContent = i18n('darkOpt'));
    $('labelPort') && ($('labelPort').textContent = i18n('gatewayPort'));
    $('labelToken') && ($('labelToken').textContent = i18n('authToken'));
    $('testConnBtn').textContent = i18n('testConn');
    $('gatewayNote') && ($('gatewayNote').innerHTML = i18n('gatewayNote'));
    // Panel headers
    $('titleTranslateHeader') && ($('titleTranslateHeader').textContent = i18n('titleTranslateHeader'));
    $('titleSummarizeHeader') && ($('titleSummarizeHeader').textContent = i18n('titleSummarizeHeader'));
    $('titleAskHeader') && ($('titleAskHeader').textContent = i18n('titleAskHeader'));
    $('titleHistoryHeader') && ($('titleHistoryHeader').textContent = i18n('titleHistoryHeader'));
    // Context refresh
    $('ctxRefreshBtn') && ($('ctxRefreshBtn').title = i18n('ctxRefresh'));
    // Translate input clear
    $('translateInputClear') && ($('translateInputClear').title = i18n('clear'));
    // Chat empty state
    $('chatEmptyText') && ($('chatEmptyText').textContent = i18n('chatEmptyText'));
    $('chatEmptyHint') && ($('chatEmptyHint').textContent = i18n('chatEmptyHint'));
    // Chat input placeholder
    $('chatInput') && ($('chatInput').placeholder = i18n('chatInputPlaceholder'));
    // Chat send button tooltip
    $('chatSendBtn') && ($('chatSendBtn').title = i18n('globalAsk'));
    // Chat header buttons
    $('exportChatBtn') && ($('exportChatBtn').title = i18n('exportChat'));
    $('copyChatBtn') && ($('copyChatBtn').title = i18n('copyChat'));
    $('clearChatBtn') && ($('clearChatBtn').title = i18n('clearChat'));
    // Chat message action buttons (edit/copy in user message, copy in assistant)
    document.querySelectorAll('.message-action-btn[data-action="edit"]').forEach(btn => btn.title = i18n('editMessage'));
    document.querySelectorAll('.message-action-btn[data-action="copy"]').forEach(btn => btn.title = i18n('copy'));
    // Panel labels and buttons
    $('labelTranslateInput') && ($('labelTranslateInput').textContent = i18n('labelTranslateInput'));
    $('historyClearBtn') && ($('historyClearBtn').textContent = i18n('historyClear'));
    $('labelTranslateBtn') && ($('labelTranslateBtn').textContent = i18n('labelTranslateBtn'));
    $('labelSummarizeBtn') && ($('labelSummarizeBtn').textContent = i18n('labelSummarizeBtn'));
    $('labelAskBtn') && ($('labelAskBtn').textContent = i18n('labelAskBtn'));
    // Loading
    $('loadingText') && ($('loadingText').textContent = i18n('loading'));
    // Settings sub-tabs
    $('labelSettingsBasic') && ($('labelSettingsBasic').textContent = i18n('labelSettingsBasic'));
    $('labelSettingsPrompts') && ($('labelSettingsPrompts').textContent = i18n('labelSettingsPrompts'));
    // Feedback
    $('labelFeedback') && ($('labelFeedback').textContent = i18n('labelFeedback'));
    $('feedbackText') && ($('feedbackText').textContent = i18n('feedbackText'));
    // Tools settings
    $('labelToolTranslate') && ($('labelToolTranslate').textContent = i18n('labelToolTranslate'));
    $('labelToolSummarize') && ($('labelToolSummarize').textContent = i18n('labelToolSummarize'));
    $('labelToolAsk') && ($('labelToolAsk').textContent = i18n('labelToolAsk'));
    $('labelToolGlobalTranslate') && ($('labelToolGlobalTranslate').textContent = i18n('labelToolGlobalTranslate'));
    $('labelPromptVars') && ($('labelPromptVars').innerHTML = i18n('placeholderPromptVars'));
    // Context headings
    $('ctxHeadingSummarize') && ($('ctxHeadingSummarize').textContent = i18n('labelContextSummarize'));
    $('ctxHeadingAsk') && ($('ctxHeadingAsk').textContent = i18n('labelContextAsk'));
    $('ctxHeadingTranslate') && ($('ctxHeadingTranslate').textContent = i18n('labelContextTranslate'));
    // Context labels
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = i18n(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-title');
      el.title = i18n(key);
    });
    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = i18n(key);
    });
    // Scan button text
    $('scanGatewayBtn') && ($('scanGatewayBtn').textContent = i18n('scanGateway') || 'Scan');
    // History empty state
    const historyEmptyText = $('historyEmpty')?.querySelector('.empty-text');
    if (historyEmptyText) historyEmptyText.textContent = i18n('emptyHistory');
    const historyEmptyHint = $('historyEmpty')?.querySelector('.empty-hint');
    if (historyEmptyHint) historyEmptyHint.textContent = i18n('historyHint');
  }

  // === DOM ===
  const $ = (id) => document.getElementById(id);

  // Tabs
  const tabTranslate = $('tabTranslate');
  const tabSummarize = $('tabSummarize');
  const tabAsk = $('tabAsk');
  const tabHistory = $('tabHistory');
  const settingsBtn = $('settingsBtn');

  // Panels
  const panelTranslate = $('panelTranslate');
  const panelSummarize = $('panelSummarize');
  const panelAsk = $('panelAsk');
  const panelHistory = $('panelHistory');
  const panelSettings = $('panelSettings');

  // Translate
  const translateInput = $('translateInput');
  const targetLangSelect = $('targetLang');
  const translateBtn = $('translateBtn');
  const translateResult = $('translateResult');
  const translateResultText = $('translateResultText');
  const copyTranslateResult = $('copyTranslateResult');
  const translateStatus = $('translateStatus');

  // Page Context DOM refs (passed to src/shared/panel-context.js; also used in init())
  // (panelContext.init() wires refresh button and text_selected listener internally)
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const exportSummarizeResult = $('exportSummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  // Ask - Chat Interface
  const chatMessages = $('chatMessages');
  const chatInput = $('chatInput');
  const chatSendBtn = $('chatSendBtn');
  const chatEmptyState = $('chatEmptyState');
  const chatEmptyText = $('chatEmptyText');
  const chatEmptyHint = $('chatEmptyHint');
  const chatStatus = $('chatStatus');
  const clearChatBtn = $('clearChatBtn');
  const exportChatBtn = $('exportChatBtn');
  const copyChatBtn = $('copyChatBtn');

  // History
  const historyList = $('historyList');
  const historyCount = $('historyCount');
  const historyEmpty = $('historyEmpty');
  const clearHistoryBtn = $('historyClearBtn');

  // Settings
  const settingBridgePort = $('settingBridgePort');
  const settingAuthToken = $('settingAuthToken');
  const toggleTokenBtn = $('toggleTokenBtn');
  const tokenStatusEl = $('tokenStatus');
  const gatewayStatusEl = $('gatewayStatus');
  const testConnBtn = $('testConnBtn');
  const testConnStatus = $('testConnStatus');
  const browserLangHint = $('browserLangHint');
  const saveSettingsBtn = null; // removed - auto-save instead
  const settingsStatus = null;

  // Loading
  const loadingOverlay = $('loadingOverlay');
  const loadingText = $('loadingText');

  // === Streaming Result Components ===
  const translateStreaming = new StreamingResult({ element: translateResultText });
  const summarizeStreaming = new StreamingResult({ element: summarizeResultText });

  // === Utilities ===
  function showLoading(text, btnElement = null, btnI18nKey = '') {
    // If button element is provided, only update button state (no overlay)
    if (btnElement) {
      btnElement.disabled = true;
      if (btnI18nKey) {
        // Icon after text: "Translating ◌"
        btnElement.innerHTML = i18n(btnI18nKey) + ' ' + svgIcon('loading');
      }
      return;
    }
    // Otherwise show the overlay
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading(btnElement = null, btnI18nKey = '') {
    // If button element is provided, only restore button state (no overlay)
    if (btnElement) {
      btnElement.disabled = false;
      if (btnI18nKey) {
        btnElement.textContent = i18n(btnI18nKey);
      }
      return;
    }
    // Otherwise hide the overlay
    loadingOverlay.classList.add('hidden');
  }

  function showStatus(el, message, type = 'error') {
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function scheduleDeferredContextBackfill(toolTab) {
    if (!['summarize', 'ask'].includes(toolTab)) return;
    const currentUrl = window.panelContext.getCurrentUrl() || '';
    if (deferredContextBackfillUrl[toolTab] === currentUrl) return;
    deferredContextBackfillUrl[toolTab] = currentUrl;
    setTimeout(() => {
      window.panelContext.updatePageContext(translateInput).catch(() => {});
    }, 500);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 4: Tab Navigation
  // ═══════════════════════════════════════════════════════════════════════════════

  async function showTab(tab) {
    currentTab = tab;
    tabTranslate.classList.toggle('active', tab === 'translate');
    tabSummarize.classList.toggle('active', tab === 'summarize');
    tabAsk.classList.toggle('active', tab === 'ask');
    tabHistory.classList.toggle('active', tab === 'history');

    panelTranslate.classList.toggle('hidden', tab !== 'translate');
    panelSummarize.classList.toggle('hidden', tab !== 'summarize');
    panelAsk.classList.toggle('hidden', tab !== 'ask');
    panelHistory.classList.toggle('hidden', tab !== 'history');
    panelSettings.classList.toggle('hidden', tab !== 'settings');
    settingsBtn.classList.toggle('active', tab === 'settings');
    window.panelContext.updateVisibility(tab);

    // When entering summarize tab, check if there's a pending result from another tab
    if (tab === 'summarize') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTabId = activeTab?.id || null;
      if (currentTabId && pendingResults.has(currentTabId)) {
        const pending = pendingResults.get(currentTabId);
        if (pending?.fullText) {
          summarizeStreaming.reset();
          summarizeStreaming.appendChunk(pending.fullText);
          summarizeStreaming.flush();
          summarizeResult.classList.remove('hidden');
          pendingResults.delete(currentTabId);
        }
      } else {
        await loadSummarizeToUi(currentTabId, window.panelContext.getCurrentUrl());
      }
    }

    if (tab === 'history') renderHistory();
    if (tab === 'settings') {
      updateTokenStatus();
      showSettingsSubTab('basic');
      if (browserLangHint) {
        browserLangHint.textContent = `${i18n('browserLangHint')} → ${browserLang}`;
      }
    }
    if (tab === 'ask') {
      // Skip re-init if pending messages were already loaded by handlePendingTab
      if (!_pendingMessagesLoaded) {
        await initChat();
      }
      // NOTE: Do NOT reset _pendingMessagesLoaded here - let refreshChatSession handle it
      chatInput.focus();
    }
    if (tab === 'summarize' || tab === 'ask') {
      scheduleDeferredContextBackfill(tab);
    }
  }

  function showSettingsSubTab(subtab) {
    $('settingsBasic')?.classList.toggle('hidden', subtab !== 'basic');
    $('settingsPrompts')?.classList.toggle('hidden', subtab !== 'prompts');
    $('settingsAbout')?.classList.toggle('hidden', subtab !== 'about');
    $('settingsTabBasic')?.classList.toggle('active', subtab === 'basic');
    $('settingsTabPrompts')?.classList.toggle('active', subtab === 'prompts');
    $('settingsTabAbout')?.classList.toggle('active', subtab === 'about');
  }

  // Update debug info display
  async function updateDebugInfo() {
    const version = chrome.runtime.getManifest?.()?.version || '1.0.0';

    // Get full Chrome version
    const ua = navigator.userAgent;
    const chromeMatch = ua.match(/Chrome\/(\S+)/);
    const chromeVersion = chromeMatch ? chromeMatch[1] : '—';

    // Get current language setting - show actual browser language for 'auto'
    const lang = $('settingLanguage')?.value || 'auto';
    const langText = lang === 'auto' ? browserLang : lang;

    // Get gateway info
    const port = $('settingBridgePort')?.value || '18789';
    const gatewayText = `127.0.0.1:${port}`;

    // Get current tab info
    let tabInfo = '—';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const urlObj = new URL(tab.url);
        tabInfo = urlObj.hostname || urlObj.href;
        if (tabInfo.length > 50) tabInfo = tabInfo.substring(0, 50) + '...';
      }
    } catch {
      // Ignore
    }

    $('debugVersion').textContent = version;
    $('debugChrome').textContent = chromeVersion;
    $('debugLanguage').textContent = langText;
    $('debugGateway').textContent = gatewayText;
    $('debugTab').textContent = tabInfo;
  }

  // Generate debug info text for clipboard
  function generateDebugInfo() {
    const lines = [
      'ClawSide Debug Info',
      `Version: ${$('debugVersion').textContent}`,
      `Chrome: ${$('debugChrome').textContent}`,
      `Language: ${$('debugLanguage').textContent}`,
      `Gateway: ${$('debugGateway').textContent}`,
      `Tab: ${$('debugTab').textContent}`,
    ];
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 5: Settings
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Settings ===
  // === Auto Scan Gateway ===
  async function autoScanGateway() {
    const ports = ['4200', '8642', '11434', '18789'];
    const found = [];

    for (const port of ports) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/',
            messages: [{ role: 'user', content: 'hi' }],
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(tid);
        // 200 = no auth needed, 401/403 = auth required
        if (res.ok) {
          found.push({ port, authRequired: false });
        } else if (res.status === 401 || res.status === 403) {
          found.push({ port, authRequired: true });
        }
      } catch {
        // Port unreachable or timeout — try next
      }
    }
    return found;
  }

  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    const isFirstRun = !result.clawside_settings || !result.clawside_settings.gatewayPort;

    // Auto scan on first run
    if (isFirstRun) {
      const scanStatusEl = $('gatewayStatus');
      const statusBar = $('gatewayStatusBar');
      if (scanStatusEl) {
        statusBar.classList.remove('hidden');
        scanStatusEl.textContent = 'Scanning...';
        scanStatusEl.style.color = 'var(--text)';
      }
      const found = await autoScanGateway();
      if (found) {
        settings = {
          gatewayPort: found.port,
          authToken: found.authRequired ? '' : '',
          language: 'auto',
          translateLanguage: 'auto',
          appearance: 'system',
          toolPrompts: {}
        };
        if (scanStatusEl) {
          scanStatusEl.innerHTML = `Found gateway on port ${found.port}${found.authRequired ? ' \u2014 token required' : ' \u2014 no auth needed'}`;
          scanStatusEl.style.color = 'var(--success)';
        }
      } else {
        settings = { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', translateLanguage: 'auto', appearance: 'system', toolPrompts: {} };
        if (scanStatusEl) {
          scanStatusEl.textContent = 'No gateway found \u2014 please configure manually';
          scanStatusEl.style.color = 'var(--error)';
        }
      }
    } else {
      settings = result.clawside_settings;
    }

    settingBridgePort.value = settings.gatewayPort || DEFAULT_PORT;
    settingAuthToken.value = settings.authToken || '';
    settingLanguage.value = settings.language || 'auto';
    settingAppearance.value = settings.appearance || 'system';
    updateTokenStatus();
    applyLanguage();
    applyAppearance();
    await applyPanelLanguage();
    loadToolPrompts();
  }

  function loadToolPrompts() {
    const prompts = settings.toolPrompts || {};
    // Load system prompt (optional)
    $('promptTranslateSystem') && ($('promptTranslateSystem').value = prompts.translate?.system || DEFAULT_PROMPTS.translate?.system || '');
    $('promptSummarizeSystem') && ($('promptSummarizeSystem').value = prompts.summarize?.system || DEFAULT_PROMPTS.summarize?.system || '');
    $('promptAskSystem') && ($('promptAskSystem').value = prompts.ask?.system || DEFAULT_PROMPTS.ask?.system || '');
    $('promptGlobalTranslateSystem') && ($('promptGlobalTranslateSystem').value = prompts.globalTranslate?.system || DEFAULT_PROMPTS.globalTranslate?.system || '');
    // Load user prompt (required)
    $('promptTranslateUser') && ($('promptTranslateUser').value = prompts.translate?.user || DEFAULT_PROMPTS.translate?.user || '');
    $('promptSummarizeUser') && ($('promptSummarizeUser').value = prompts.summarize?.user || DEFAULT_PROMPTS.summarize?.user || '');
    $('promptAskUser') && ($('promptAskUser').value = prompts.ask?.user || DEFAULT_PROMPTS.ask?.user || '');
    $('promptGlobalTranslateUser') && ($('promptGlobalTranslateUser').value = prompts.globalTranslate?.user || DEFAULT_PROMPTS.globalTranslate?.user || '');
  }

  function applyLanguage() {
    // translateLanguage defaults to language setting, can be overridden by user
    const defaultLang = settings.language === 'auto' ? browserLang : settings.language;
    const translateLang = (settings.translateLanguage && settings.translateLanguage !== 'auto')
      ? settings.translateLanguage
      : defaultLang;
    targetLangSelect.value = translateLang;
    // language: reply language preference (for summarize/ask)
    const replyLang = settings.language === 'auto' ? browserLang : settings.language;
    if (settings.language !== 'auto') {
      settingLanguage.value = settings.language;
    }
  }

  function applyAppearance() {
    const appearance = settings.appearance || 'system';
    document.documentElement.dataset.appearance = appearance;
  }

  function updateTokenStatus() {
    if (!settingAuthToken) return;
    const token = settingAuthToken.value?.trim();
    if (!token) {
      tokenStatusEl.textContent = 'No token';
      tokenStatusEl.className = 'token-status empty';
    } else {
      tokenStatusEl.textContent = 'Token set '; tokenStatusEl.insertAdjacentHTML('beforeend', svgIcon('check'));
      tokenStatusEl.className = 'token-status ok';
    }
  }

  async function checkGatewayStatus() {
    const statusBar = $('gatewayStatusBar');
    statusBar.classList.remove('hidden');

    // Disable button and show loading
    testConnBtn.disabled = true;
    const originalText = testConnBtn.textContent;
    testConnBtn.innerHTML = originalText + ' ' + svgIcon('loading');

    // Clear previous status to give visual feedback that button was clicked
    gatewayStatusEl.textContent = 'Checking...';
    gatewayStatusEl.style.color = 'var(--text)';

    // Use getModels from openai-compatible.js
    try {
      const portNum = settingBridgePort.value?.trim() || DEFAULT_PORT;
      const token = settingAuthToken.value?.trim() || '';

      console.log('[ClawSide] Testing gateway connection on port:', portNum);
      const models = await window.getModels(portNum, token);

      const modelId = models[0].id;
      settings.model = modelId;

      gatewayStatusEl.innerHTML = svgIcon('check') + ' Gateway reachable (model: ' + modelId + ')';
      gatewayStatusEl.style.color = 'var(--success)';
      autoSave();
    } catch (err) {
      console.error('[ClawSide] Test connection error:', err);
      const errMsg = err.message || '';
      if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('invalid_token')) {
        gatewayStatusEl.textContent = '✗ Token rejected by gateway';
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg === 'timeout') {
        gatewayStatusEl.textContent = '✗ Cannot reach gateway — check port';
      } else {
        gatewayStatusEl.textContent = '✗ ' + errMsg;
      }
      gatewayStatusEl.style.color = 'var(--error)';
    } finally {
      // Re-enable button and restore original text
      testConnBtn.disabled = false;
      testConnBtn.textContent = originalText;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 6: Chat Interface
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Chat Interface Functions ===

  // Initialize chat session for current tab
  async function initChat() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const url = tab.url || '';
      chatSession = await window.chatSessionManager.getSession(tab.id, url);

      // Set page context using available methods
      chatSession.setContext({
        url: window.panelContext.getCurrentUrl() || url,
        title: window.panelContext.getCurrentPageTitle() || '',
        content: window.panelContext.getCurrentPageContent() || '',
        selectedText: window.panelContext.getSelectedText() || ''
      });
    }

    renderChatMessages();
    updateChatInputState();
  }

  // Refresh chat session for current tab (e.g., when URL changes)
  async function refreshChatSession() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const url = tab.url || '';

      // Skip chat session refresh if pending messages were just loaded
      // to avoid overwriting the new messages with old ones from storage
      if (_pendingMessagesLoaded) {
        return;
      }

      // Refresh chat session
      chatSession = await window.chatSessionManager.switchContext(tab.id, url);

      // Update context
      chatSession.setContext({
        url: window.panelContext.getCurrentUrl() || url,
        title: window.panelContext.getCurrentPageTitle() || '',
        content: window.panelContext.getCurrentPageContent() || '',
        selectedText: window.panelContext.getSelectedText() || ''
      });

      renderChatMessages();

      // Reset flag after refresh is done
      _pendingMessagesLoaded = false;
    }
  }

  // Refresh summarize result for current tab (e.g., when URL changes)
  async function refreshSummarizeResult() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const url = tab.url || '';
      await loadSummarizeToUi(tab.id, url);
    }
  }

  // Load summarize result to UI for given tab+url
  async function loadSummarizeToUi(tabId, url) {
    if (!tabId || !url) {
      summarizeStreaming.reset();
      summarizeResult.classList.add('hidden');
      return;
    }
    const existing = await loadSummarizeResult(tabId, url);
    if (existing?.summary) {
      summarizeStreaming.reset();
      summarizeStreaming.appendChunk(existing.summary);
      summarizeStreaming.flush();
      summarizeResult.classList.remove('hidden');
    } else {
      summarizeStreaming.reset();
      summarizeResult.classList.add('hidden');
    }
  }

  // Render all chat messages
  function renderChatMessages() {
    if (!chatSession) return;
    if (!chatMessages) return;

    const messages = chatSession.getMessages();
    chatMessages.innerHTML = '';

    if (messages.length === 0) {
      chatEmptyState && chatEmptyState.classList.remove('hidden');
      chatMessages.classList.add('hidden');
    } else {
      chatEmptyState && chatEmptyState.classList.add('hidden');
      chatMessages.classList.remove('hidden');

      messages.forEach(msg => {
        const msgEl = createMessageElement(msg.role, msg.content);
        chatMessages.appendChild(msgEl);
      });

      scrollToBottom();
    }
  }

  // Create message DOM element
  function createMessageElement(role, content) {
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    const userAvatar = '<svg class="avatar-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const assistantAvatar = '<img src="../assets/icons/icon16.png" width="28" height="28" alt="AI">';
    const avatar = role === 'user' ? userAvatar : assistantAvatar;
    const htmlContent = window.marked.parse(content);
    
    // User message: edit and copy icons between avatar and content (on the left side of content bubble)
    if (role === 'user') {
      div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          ${htmlContent}
        </div>
        <div class="message-actions-left">
          <button class="message-action-btn" data-action="edit" title="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="message-action-btn" data-action="copy" title="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;

      // Set i18n titles for user message action buttons
      const editBtn = div.querySelector('[data-action="edit"]');
      const copyBtn = div.querySelector('[data-action="copy"]');
      editBtn.title = i18n('editMessage');
      copyBtn.title = i18n('copy');
    } 
    // Assistant message: copy icon on right outside bubble
    else {
      div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          ${htmlContent}
        </div>
        <div class="message-actions-right">
          <button class="message-action-btn" data-action="copy" title="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;

      // Set i18n title for assistant copy button and wire it
      const copyBtn = div.querySelector('[data-action="copy"]');
      copyBtn.title = i18n('copy');
      copyBtn.addEventListener('click', () => {
        window.copyToClipboard(content);
        showCopiedFeedback(copyBtn);
      });
    }

    return div;
  }

  // Add user message to chat
  function addUserMessage(content) {
    if (!chatSession) return;

    chatSession.addUserMessage(content, null, 'ask');
    if (chatMessages) {
      const msgEl = createMessageElement('user', content);
      chatMessages.appendChild(msgEl);

      // Show messages container, hide empty state
      chatMessages.classList.remove('hidden');
      chatEmptyState && chatEmptyState.classList.add('hidden');
    }
    // Don't save immediately - only save after assistant responds
    if (chatMessages) scrollToBottom();
  }

  // Add assistant message placeholder (for streaming)
  function addAssistantMessagePlaceholder() {
    if (!chatSession) return null;
    if (!chatMessages) return null;

    const msg = chatSession.addAssistantMessage('', null, 'ask');
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    div.dataset.streaming = 'true';

    div.innerHTML = `
      <div class="message-avatar"><img src="../assets/icons/icon16.png" width="28" height="28" alt="AI"></div>
      <div class="message-content streaming">
        <span class="message-loading">
          <span class="loading-label">${i18n('thinking')}</span>
          <span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
        </span>
      </div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();
    return { msg, div };
  }

  // Update streaming message content
  function updateStreamingMessage(content) {
    const streamingDiv = chatMessages.querySelector('.chat-message.assistant[data-streaming="true"] .message-content');
    if (!streamingDiv) return;

    // If we have content, hide the loading placeholder
    if (content) {
      const loadingEl = streamingDiv.querySelector('.message-loading');
      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
    }

    streamingDiv.innerHTML = window.marked.parse(content);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Finalize streaming message
  function finalizeStreamingMessage(content) {
    const streamingDiv = chatMessages.querySelector('.chat-message.assistant[data-streaming="true"]');
    if (streamingDiv) {
      streamingDiv.classList.remove('streaming');
      streamingDiv.removeAttribute('data-streaming');

      // Update content with final text
      const contentDiv = streamingDiv.querySelector('.message-content');
      if (contentDiv && content) {
        contentDiv.innerHTML = window.marked.parse(content);
      }

      // Add actions
      const actionsHtml = `
        <div class="message-actions-right">
          <button class="message-action-btn" data-action="copy" title="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;
      streamingDiv.insertAdjacentHTML('beforeend', actionsHtml);

      // Wire copy button with i18n title
      const copyBtn = streamingDiv.querySelector('[data-action="copy"]');
      copyBtn.title = i18n('copy');
      copyBtn.addEventListener('click', () => {
        window.copyToClipboard(content);
        showCopiedFeedback(copyBtn);
      });

      // Update session
      if (chatSession) {
        chatSession.updateLastAssistantMessage(content);
        chatSession.save();
      }
    }
  }

  // Scroll side panel to bottom (to make input visible)
  function scrollToBottom() {
    window.scrollTo(0, document.body.scrollHeight);
  }

  // Update chat input state
  function updateChatInputState() {
    const hasContent = chatInput.value.trim().length > 0;
    chatSendBtn.disabled = !hasContent;
  }

  // Send chat message
  async function sendChatMessage() {
    const question = chatInput.value.trim();
    if (!question || !chatSession) return;
    
    // Disable input during request
    chatInput.disabled = true;
    chatSendBtn.disabled = true;
    
    try {
      // Add user message
      addUserMessage(question);
      chatInput.value = '';
      updateChatInputState();
      
      // Add assistant placeholder
      addAssistantMessagePlaceholder();
      
      // Build prompt with conversation history
      // Use chatSession.hasPreviousAsk() to include page context only on first message
      await loadSettings();
      chatSession.setContext({
        url: window.panelContext.getCurrentUrl() || chatSession.context.url || '',
        title: window.panelContext.getCurrentPageTitle() || chatSession.context.title || '',
        content: window.panelContext.getCurrentPageContent() || chatSession.context.content || '',
        selectedText: window.panelContext.getSelectedText() || chatSession.context.selectedText || ''
      });
      const promptText = chatSession.buildPrompt();

      // Make API call
      let accumulatedContent = '';
      
      await new Promise((resolve, reject) => {
        const requestId = 'chat_' + Date.now();
        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(handler);
          reject(new Error('Request timeout'));
        }, 60000);
        
        const handler = (msg) => {
          if (msg.requestId === requestId) {
            if (msg.type === 'clawside-stream-chunk') {
              accumulatedContent += msg.chunk;
              updateStreamingMessage(accumulatedContent);
            } else if (msg.type === 'clawside-stream-done') {
              clearTimeout(timeout);
              chrome.runtime.onMessage.removeListener(handler);
              resolve();
            } else if (msg.type === 'clawside-stream-error') {
              clearTimeout(timeout);
              chrome.runtime.onMessage.removeListener(handler);
              reject(new Error(msg.error || 'Streaming error'));
            }
          }
        };
        
        chrome.runtime.onMessage.addListener(handler);
        
        // Send streaming request
        chrome.runtime.sendMessage({
          type: 'clawside-api',
          prompt: promptText,
          requestId,
          stream: true,
          toolName: 'ask'
        });
      });
      
      // Finalize message
      finalizeStreamingMessage(accumulatedContent);
      
    } catch (err) {
      console.error('[Chat] Error:', err);
      showStatus(chatStatus, err.message || 'Failed to send message');
      
      // Remove failed assistant message
      const failedMsg = chatMessages.querySelector('.chat-message.assistant[data-streaming="true"]');
      if (failedMsg) failedMsg.remove();
      
    } finally {
      // Re-enable input
      chatInput.disabled = false;
      updateChatInputState();
      chatInput.focus();
    }
  }

  // Clear chat
  async function clearChat() {
    if (!chatSession) return;

    chatSession.clear();
    await chatSession.removeFromStorage();
    if (chatMessages) {
      chatMessages.innerHTML = '';
      chatEmptyState.classList.remove('hidden');
      chatMessages.classList.add('hidden');
    }
  }

  // === Memory (per-tab + global history) ===

  // Get summarize storage key for tab+url
  function getSummarizeKey(tabId, url) {
    return `clawside_summarize_${tabId}_${window.hashUrl(url)}`;
  }

  async function loadSummarizeResult(tabId, url) {
    const key = getSummarizeKey(tabId, url);
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  }

  async function saveSummarizeResult(tabId, url, summary, title) {
    const key = getSummarizeKey(tabId, url);
    // Clean up old summarize keys before saving (keep last 50)
    await cleanupOldSummarizeKeys();
    await chrome.storage.local.set({ [key]: { summary, title, url, timestamp: Date.now() } });
  }

  // Cleanup old summarize keys (keep most recent 50)
  async function cleanupOldSummarizeKeys() {
    const all = await chrome.storage.local.get(null);
    const summarizeKeys = Object.keys(all).filter(k => k.startsWith('clawside_summarize_'));
    if (summarizeKeys.length > 50) {
      // Sort by timestamp desc
      const keysWithTime = await Promise.all(
        summarizeKeys.map(async k => {
          const val = all[k];
          return { key: k, timestamp: val?.timestamp || 0 };
        })
      );
      keysWithTime.sort((a, b) => b.timestamp - a.timestamp);
      // Delete old ones
      const toDelete = keysWithTime.slice(50).map(k => k.key);
      if (toDelete.length > 0) {
        await chrome.storage.local.remove(toDelete);
      }
    }
  }

  async function loadHistory() {
    const result = await chrome.storage.local.get(['clawside_memory']);
    return result.clawside_memory || [];
  }

  async function saveHistory(items) {
    await chrome.storage.local.set({ clawside_memory: items });
  }

  async function addHistoryItem(item) {
    // Check for duplicate by key
    if (item.key) {
      const items = await loadHistory();
      if (items.some(i => i.key === item.key)) {
        return;
      }
    }

    const items = await loadHistory();
    items.unshift(item);
    if (items.length > 50) items.splice(50);
    await saveHistory(items);
  }

  // Save ask session to history (called when user switches tab or closes panel)
  async function saveAskSessionToHistory() {
    // Skip if already saving (prevent duplicate calls)
    if (saveAskSessionToHistory._saving) return;
    saveAskSessionToHistory._saving = true;

    try {
      if (!chatSession) return;

      const messages = chatSession.messages;
      // Only save if there's at least one user message
      const hasUserMsg = messages?.some(m => m.role === 'user');
      if (!hasUserMsg) return;

      const url = window.panelContext.getCurrentUrl();
      const title = window.panelContext.getCurrentPageTitle();
      const tabId = chatSession?.tabId || '';

      // Build unique key for deduplication
      const historyKey = `cs_history_ask_${tabId}_${window.hashUrl(url)}`;

      // Check for duplicate: skip if most recent item has same key
      const items = await loadHistory();
      const lastItem = items[0];
      if (lastItem && lastItem.key === historyKey) {
        return;
      }

      await addHistoryItem({
        id: crypto.randomUUID(),
        key: historyKey,
        type: 'ask',
        tabId: tabId,
        url: url || '',
        title: title || '',
        messages: messages,
        timestamp: Date.now()
      });
    } finally {
      saveAskSessionToHistory._saving = false;
    }
  }

  // === API via background script (streaming) ===
  // Store pending results per source tab so they can be restored when user switches back
  const pendingResults = new Map(); // requestTabId -> { fullText, toolName }

  async function apiCall(prompt, { onChunk, toolName = 'default', systemPrompt = '' } = {}) {
    // Get current tab ID at request time
    // Note: sidepanel is an extension page, not a content script.
    // We pass null for sourceTabId so openai-compatible.js uses runtime.sendMessage.
    const sourceTabId = null;

    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let fullText = '';
      let settled = false;
      // Capture sourceTabId at closure for response validation
      const requestTabId = sourceTabId;

      const cleanup = () => {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
        // Clean up pending result for this request
        pendingResults.delete(requestTabId);
      };

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; cleanup(); reject(new Error('Request timeout')); }
      }, 90000);

      const handler = (msg) => {
        if (msg.requestId !== requestId) return;

        if (msg.type === 'clawside-stream-chunk') {
          fullText += msg.chunk;
          if (requestTabId) {
            pendingResults.set(requestTabId, { fullText, toolName });
          }
          if (onChunk) {
            onChunk(msg.chunk, fullText);
          }
        }
        if (msg.type === 'clawside-stream-done') {
          if (!settled) { settled = true; cleanup(); resolve(fullText); }
        }
        if (msg.type === 'clawside-stream-error') {
          if (!settled) { settled = true; cleanup(); reject(new Error(msg.error)); }
        }
        return true;
      };

      chrome.runtime.onMessage.addListener(handler);
      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt,
        systemPrompt,
        toolName,
        sourceTabId,
        requestId
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 7: Tool Actions (Translate, Summarize, Ask)
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Actions (streaming) ===
  async function doTranslate() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    const text = translateInput.value.trim();
    if (!text) {
      showStatus(translateStatus, 'Please enter or select text to translate');
      return;
    }
    translateStreaming.reset();
    translateResult.classList.add('hidden');

    // Get page context for translation
    const currentUrl = window.panelContext.getCurrentUrl();
    const currentTitle = window.panelContext.getCurrentPageTitle();
    let pageContent = window.panelContext.getCurrentPageContent();

    showLoading('', translateBtn, 'translating');
    try {
      await loadSettings();
      // Use lang-utils to get translate target language label
      // If user selected specific language in dropdown (not 'auto'), use that; otherwise use settings
      let targetLangLabel;
      if (targetLangSelect.value !== 'auto') {
        const code = window.resolveToCode(targetLangSelect.value, browserLang);
        targetLangLabel = window.codeToLabel(code);
      } else {
        targetLangLabel = window.getTranslateLabel ? window.getTranslateLabel(settings) : 'English';
      }
      const templates = window.csSettings.getPromptTemplates(settings, 'translate');
      const systemPrompt = templates ? applyPrompt(templates.system, { lang: targetLangLabel }) : '';
      const userPrompt = templates ? applyPrompt(templates.user, {
        text,
        lang: targetLangLabel,
        title: currentTitle,
        url: currentUrl,
        content: pageContent ? pageContent.slice(0, 8000) : ''
      }) : '';
      await apiCall(userPrompt, {
        systemPrompt,
        toolName: 'translate',
        onChunk: (chunk) => {
          translateStreaming.appendChunkAndFlush(chunk);
          translateResult.classList.remove('hidden');
        }
      });
      const result = translateStreaming.getRawText();
      const historyKey = `cs_history_translate_${window.hashUrl(text)}`;
      await addHistoryItem({
        id: crypto.randomUUID(),
        key: historyKey,
        type: 'translate',
        tabId: tabId || '',
        original: text, result, lang: targetLang,
        url: currentUrl,
        title: currentTitle,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[ClawSide] Translate error:', err);
      showStatus(translateStatus, err.message);
    } finally {
      hideLoading(translateBtn, 'tabTranslate');
    }
  }

  async function doSummarize() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    const currentUrl = window.panelContext.getCurrentUrl();

    if (!currentUrl) {
      showStatus(summarizeStatus, 'No current page detected. Navigate to a page first.');
      return;
    }

    // Try to load existing summarize result for this tab+url
    if (tabId) {
      const existing = await loadSummarizeResult(tabId, currentUrl);
      if (existing?.summary) {
        summarizeStreaming.reset();
        summarizeStreaming.appendChunk(existing.summary);
        summarizeStreaming.flush();
        summarizeResult.classList.remove('hidden');
        return;
      }
    }

    summarizeStreaming.reset();
    summarizeResult.classList.add('hidden');

    // Reuse currentPageContent from shared context; re-extract only if stale/empty
    let pageContent = window.panelContext.getCurrentPageContent();
    let extractionFailed = false;

    if (!pageContent || pageContent.trim().length < 100) {
      showLoading(i18n('loading'));
      try {
        if (tab?.id) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: window.panelContext.extractPageContext
          });
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          pageContent = extracted.content + (extracted.jsonLd || '');
          window.panelContext.setCurrentPageContent(pageContent); // update shared context
          if (!pageContent || pageContent.trim().length < 100) {
            extractionFailed = true;
          }
        } else {
          extractionFailed = true;
        }
      } catch (err) {
        extractionFailed = true;
      }
    }

    if (extractionFailed) {
      hideLoading();
      showStatus(summarizeStatus, `Cannot extract page content. Try selecting specific text and using the Ask feature instead.`);
      summarizeBtn.disabled = false;
      return;
    }

    showLoading('', summarizeBtn, 'summarizing');
    try {
      await loadSettings();
      const templates = window.csSettings.getPromptTemplates(settings, 'summarize');
      // Use lang-utils to get reply language label directly
      const langLabel = window.getReplyLabel ? window.getReplyLabel(settings) : 'English';
      const systemPrompt = templates ? applyPrompt(templates.system, { lang: langLabel }) : '';
      const userPrompt = templates ? applyPrompt(templates.user, {
        lang: langLabel,
        title: window.panelContext.getCurrentPageTitle(),
        url: window.panelContext.getCurrentUrl(),
        content: pageContent ? pageContent.slice(0, 8000) : ''
      }) : '';
      await apiCall(userPrompt, {
        systemPrompt,
        toolName: 'summarize',
        onChunk: (chunk) => {
          summarizeStreaming.appendChunkAndFlush(chunk);
          summarizeResult.classList.remove('hidden');
        }
      });
      const summary = summarizeStreaming.getRawText();
      const title = window.panelContext.getCurrentPageTitle();
      const url = window.panelContext.getCurrentUrl();
      // Save to tab+url specific storage
      await saveSummarizeResult(tabId, url, summary, title);
      // Also add to global history
      const historyKey = `cs_history_summarize_${tabId}_${window.hashUrl(url)}`;
      await addHistoryItem({
        id: crypto.randomUUID(),
        key: historyKey,
        type: 'summarize',
        tabId: tabId || '',
        url, title,
        summary, timestamp: Date.now()
      });
    } catch (err) {
      console.error('[ClawSide] Summarize error:', err);
      showStatus(summarizeStatus, err.message);
    } finally {
      hideLoading(summarizeBtn, 'tabSummarize');
    }
  }

  async function doCopy(text, btn) {
    if (window.copyToClipboard) await window.copyToClipboard(text);
    btn.innerHTML = svgIcon('check');
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = svgIcon('copy'); btn.classList.remove('copied'); }, 1500);
  }

  // ── Context state delegated to src/shared/panel-context.js ──────


  var truncate = window.truncate || function (str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '\u2026' : str;
  };

  function truncateUrl(url) {
    if (!url) return '—';
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname !== '/' ? u.pathname : '');
    } catch {
      return url.length > 40 ? '...' + url.slice(-37) : url;
    }
  }

  // === Icon Helper (inline SVG, no <use> dependency) ===
  // All icons reference resources/icons/icons.svg sprite via <use>.
  const SVG = {
    translate: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-translate"></use></svg>',
    summarize: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-summarize"></use></svg>',
    ask: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-ask"></use></svg>',
    export: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-export"></use></svg>',
    copy: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-copy"></use></svg>',
    delete: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-delete"></use></svg>',
    check: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-check"></use></svg>',
    eye: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye"></use></svg>',
    eyeoff: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye-off"></use></svg>',
    loading: '<span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>',
  };

  function svgIcon(name) {
    return SVG[name] || '';
  }

  // === History ===
  function formatTime(ts) {
    const d = new Date(ts);
    const diffMs = Date.now() - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/\n/g,'<br>');
  }

  // Build markdown content for export
  function buildExportContent(item) {
    const lines = [];
    const time = new Date(item.timestamp).toLocaleString();

    lines.push(`# ClawSide ${item.type}`);
    lines.push('');
    lines.push(`**Time:** ${time}`);
    if (item.title) {
      lines.push(`**Title:** ${item.title}`);
    }
    if (item.url) {
      lines.push(`**URL:** ${item.url}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    if (item.type === 'translate') {
      lines.push('## Original');
      lines.push('');
      lines.push(item.original || '');
      lines.push('');
      lines.push('## Translation');
      lines.push('');
      lines.push(item.result || '');
    } else if (item.type === 'summarize') {
      lines.push('## Summary');
      lines.push('');
      lines.push(item.summary || '');
    } else if (item.type === 'ask') {
      // Multi-turn conversation
      if (item.messages && item.messages.length > 0) {
        let qnaIndex = 0;
        item.messages.forEach((msg) => {
          if (msg.role === 'user') {
            qnaIndex++;
            lines.push(`## Q${qnaIndex}`);
            lines.push('');
            lines.push('**User:** ' + (msg.content || ''));
            lines.push('');
          } else if (msg.role === 'assistant' && msg.content) {
            lines.push('**Assistant:** ' + msg.content);
            lines.push('');
          }
        });
      }
    }

    return lines.join('\n');
  }

  // Download markdown file
  function downloadMarkdown(filename, content) {
    // Create an anchor element and trigger click download
    // This preserves filename for data URLs
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    // Create temporary anchor to download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 8: History
  // ═══════════════════════════════════════════════════════════════════════════════

  async function renderHistory() {
    const items = await loadHistory();
    const itemLabel = items.length === 1 ? i18n('historyItem') : i18n('historyItems');
    historyCount.textContent = `${items.length} ${itemLabel}`;
    historyEmpty.classList.toggle('hidden', items.length > 0);
    historyList.innerHTML = '';
    clearHistoryBtn.classList.toggle('hidden', items.length === 0);

    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const itemIcon = item.type === 'translate' ? svgIcon('translate') : item.type === 'summarize' ? svgIcon('summarize') : svgIcon('ask');
      const typeLabel = item.type === 'translate' ? i18n('tabTranslate') : item.type === 'summarize' ? i18n('tabSummarize') : i18n('tabAsk');

        let preview;
        if (item.type === 'translate') {
          preview = `<em>"${truncate(item.original, 60)}"</em> → ${item.result}`;
        } else if (item.type === 'summarize') {
          preview = truncate(item.summary || item.url, 80);
        } else if (item.type === 'ask' && item.messages) {
          // Show first question from messages
          const firstUserMsg = item.messages.find(m => m.role === 'user');
          preview = firstUserMsg ? `<em>Q:</em> ${truncate(firstUserMsg.content, 60)}` : '(No question)';
        } else {
          preview = `<em>Q:</em> ${truncate(item.question, 60)}`;
        }

        el.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-icon">${itemIcon}</span>
            <span class="history-item-type">${typeLabel}</span>
            <span class="history-item-actions">
              <button class="history-export-btn" data-index="${idx}" title="${i18n('exportItem')}">${svgIcon("export")}</button>
              <button class="history-copy-btn" data-index="${idx}" title="${i18n('copy')}">${svgIcon("copy")}</button>
              <button class="history-delete-btn" data-index="${idx}" title="${i18n('deleteItem')}">${svgIcon("delete")}</button>
            </span>
            <span class="history-item-time">${formatTime(item.timestamp)}</span>
          </div>
          <div class="history-item-preview">${preview}</div>
          <div class="history-item-detail">
            ${item.type === 'translate' ? `
              <div class="history-item-detail-row"><span class="history-item-detail-label">Original:</span><span class="history-item-detail-value">${escapeHtml(item.original)}</span></div>
              <div class="history-item-detail-row"><span class="history-item-detail-label">Result:</span><span class="history-item-detail-value">${escapeHtml(item.result)}</span></div>
            ` : item.type === 'summarize' ? `
              <div class="history-item-detail-row"><span class="history-item-detail-label">Summary:</span><span class="history-item-detail-value">${escapeHtml(item.summary)}</span></div>
            ` : item.type === 'ask' && item.messages ? `
              ${item.messages.map(m => `<div class="history-item-detail-row"><span class="history-item-detail-label">${m.role === 'user' ? 'Q' : 'A'}:</span><span class="history-item-detail-value">${escapeHtml(m.content || '')}</span></div>`).join('')}
            ` : `
              <div class="history-item-detail-row"><span class="history-item-detail-label">Q:</span><span class="history-item-detail-value">${escapeHtml(item.question)}</span></div>
              <div class="history-item-detail-row"><span class="history-item-detail-label">A:</span><span class="history-item-detail-value">${escapeHtml(item.answer)}</span></div>
            `}
            ${item.url ? `<a class="history-item-source" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${truncate(item.url, 50)}</a>` : ''}
          </div>`;
        el.addEventListener('click', (e) => {
          if (e.target.closest('.history-copy-btn') || e.target.closest('.history-delete-btn')) return;
          el.classList.toggle('expanded');
        });
        historyList.appendChild(el);
      });
  }

  async function doClearHistory() {
    await chrome.storage.local.set({ clawside_memory: [] });
    renderHistory();
  }

  // Event delegation for history copy/delete/export buttons
  historyList.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.history-copy-btn');
    const deleteBtn = e.target.closest('.history-delete-btn');
    const exportBtn = e.target.closest('.history-export-btn');
    if (!copyBtn && !deleteBtn && !exportBtn) return;

    const idx = parseInt(copyBtn?.dataset.index || deleteBtn?.dataset.index || exportBtn?.dataset.index, 10);
    const items = await loadHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length) return;

    if (deleteBtn) {
      items.splice(idx, 1);
      await chrome.storage.local.set({ clawside_memory: items });
      renderHistory();
    } else if (copyBtn) {
      const item = items[idx];
      let text = '';
      if (item.type === 'translate') {
        text = item.result;
      } else if (item.type === 'summarize') {
        text = item.summary;
      } else if (item.type === 'ask' && item.messages) {
        // Combine all messages for copy
        text = item.messages.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n\n');
      } else {
        text = item.answer || item.question;
      }
      if (window.copyToClipboard) await window.copyToClipboard(text || '');
      const originalText = copyBtn.textContent;
      copyBtn.innerHTML = svgIcon('check');
      setTimeout(() => { copyBtn.textContent = originalText; }, 1000);
    } else if (exportBtn) {
      const item = items[idx];
      const toolName = item.type;
      const datetime = new Date(item.timestamp).toLocaleString('sv-SE', { hour12: false }).replace(/[-: ]/g, '').replace(',', '');
      const filename = `clawside_${toolName}_${datetime}.md`;
      const content = buildExportContent(item);
      downloadMarkdown(filename, content);
      const originalHtml = exportBtn.innerHTML;
      exportBtn.innerHTML = svgIcon('check');
      setTimeout(() => { exportBtn.innerHTML = originalHtml; }, 1000);
    }
  });

  // === Messages from content script / background ===
  // text_selected is handled by src/shared/panel-context.js internally.
  chrome.runtime.onMessage.addListener((msg) => {
    // Floating ball: jump to a specific tool tab AND refresh context content.
    // Data arrives via chrome.storage.local (set by background.js) — the
    // storage.onChanged listener below handles it. The direct message is a
    // fallback only when the panel is already open and stable.
    if (msg.type === 'OPEN_TAB_IN_PANEL' && msg.tab) {
      handlePendingTab(null, msg.url || '', msg.title || '', msg.text || '', msg.tab);
    }
    return true;
  });

  // === Event Listeners ===
  tabTranslate.addEventListener('click', () => { showTab('translate'); window.panelContext.updatePageContext(translateInput).catch(() => {}); });
  tabSummarize.addEventListener('click', () => { showTab('summarize'); window.panelContext.updatePageContext(translateInput).catch(() => {}); });
  tabAsk.addEventListener('click', () => { showTab('ask'); window.panelContext.updatePageContext(translateInput).catch(() => {}); });
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));

  // Settings sub-tabs
  $('settingsTabBasic')?.addEventListener('click', () => showSettingsSubTab('basic'));
  $('settingsTabPrompts')?.addEventListener('click', () => showSettingsSubTab('prompts'));
  $('settingsTabAbout')?.addEventListener('click', () => {
    showSettingsSubTab('about');
    updateDebugInfo();
  });

  // Copy debug info button
  $('copyDebugBtn')?.addEventListener('click', async () => {
    const debugText = generateDebugInfo();
    const btn = $('copyDebugBtn');
    if (window.copyToClipboard) await window.copyToClipboard(debugText);
    if (btn) showCopiedFeedback(btn);
  });

  // Tool prompt reset buttons
  $('resetPromptTranslate')?.addEventListener('click', () => {
    $('promptTranslateSystem').value = DEFAULT_PROMPTS.translate?.system || '';
    $('promptTranslateUser').value = DEFAULT_PROMPTS.translate?.user || '';
    saveToolPrompts();
  });
  $('resetPromptSummarize')?.addEventListener('click', () => {
    $('promptSummarizeSystem').value = DEFAULT_PROMPTS.summarize?.system || '';
    $('promptSummarizeUser').value = DEFAULT_PROMPTS.summarize?.user || '';
    saveToolPrompts();
  });
  $('resetPromptAsk')?.addEventListener('click', () => {
    $('promptAskSystem').value = DEFAULT_PROMPTS.ask?.system || '';
    $('promptAskUser').value = DEFAULT_PROMPTS.ask?.user || '';
    saveToolPrompts();
  });
  $('resetPromptGlobalTranslate')?.addEventListener('click', () => {
    $('promptGlobalTranslateSystem').value = DEFAULT_PROMPTS.globalTranslate?.system || '';
    $('promptGlobalTranslateUser').value = DEFAULT_PROMPTS.globalTranslate?.user || '';
    saveToolPrompts();
  });

  // Auto-save tool prompts on input
  $('promptTranslateSystem')?.addEventListener('input', saveToolPrompts);
  $('promptTranslateUser')?.addEventListener('input', saveToolPrompts);
  $('promptSummarizeSystem')?.addEventListener('input', saveToolPrompts);
  $('promptSummarizeUser')?.addEventListener('input', saveToolPrompts);
  $('promptAskSystem')?.addEventListener('input', saveToolPrompts);
  $('promptAskUser')?.addEventListener('input', saveToolPrompts);
  $('promptGlobalTranslateSystem')?.addEventListener('input', saveToolPrompts);
  $('promptGlobalTranslateUser')?.addEventListener('input', saveToolPrompts);

  translateBtn.addEventListener('click', doTranslate);
  targetLangSelect.addEventListener('change', () => {
    const selectedLang = targetLangSelect.value;
    settings.translateLanguage = selectedLang;
    chrome.storage.local.set({ clawside_settings: settings });
  });
  summarizeBtn.addEventListener('click', doSummarize);

  // Chat event listeners
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('input', updateChatInputState);
  chatInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
  });
  clearChatBtn.addEventListener('click', clearChat);

  // Export chat session
  if (exportChatBtn) {
    exportChatBtn.addEventListener('click', async () => {
      if (!chatSession || chatSession.messages.length === 0) return;
      const url = window.panelContext.getCurrentUrl() || '';
      const title = window.panelContext.getCurrentPageTitle() || '';
      const item = {
        type: 'ask',
        url,
        title,
        messages: chatSession.messages,
        timestamp: Date.now()
      };
      const filename = `clawside_ask_${new Date().toLocaleString('sv-SE', { hour12: false }).replace(/[-: ]/g, '').replace(',', '')}.md`;
      const exportContent = buildExportContent(item);
      downloadMarkdown(filename, exportContent);
    });
  }

  // Copy chat session to clipboard
  if (copyChatBtn) {
    copyChatBtn.addEventListener('click', async () => {
      if (!chatSession || chatSession.messages.length === 0) return;
      const text = chatSession.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
      if (window.copyToClipboard) await window.copyToClipboard(text);
      const originalHtml = copyChatBtn.innerHTML;
      copyChatBtn.innerHTML = svgIcon('check');
      setTimeout(() => { copyChatBtn.innerHTML = originalHtml; }, 1000);
    });
  }

  translateInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doTranslate();
    }
  });

  // Clear translate result when input changes
  translateInput.addEventListener('input', () => {
    translateResult.classList.add('hidden');
    // Clear context box selectedText when user manually edits input
    var selectedTextEl = document.getElementById('ctxSelectedText');
    if (selectedTextEl) {
      selectedTextEl.classList.add('hidden');
    }
    // Also clear in TCM so subsequent operations use input value, not selectedText
    window.panelContext.setSelectedText('');
  });

  // Clear translate input button
  const translateInputClear = $('translateInputClear');
  if (translateInputClear) {
    translateInputClear.addEventListener('click', () => {
      translateInput.value = '';
      translateInput.focus();
      translateResult.classList.add('hidden');
      // Clear context box selectedText
      var selectedTextEl = document.getElementById('ctxSelectedText');
      if (selectedTextEl) {
        selectedTextEl.classList.add('hidden');
      }
      window.panelContext.setSelectedText('');
    });
  }

  copyTranslateResult.addEventListener('click', () => doCopy(translateStreaming.getRawText(), copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeStreaming.getRawText(), copySummarizeResult));

  // Export summarize result
  if (exportSummarizeResult) {
    exportSummarizeResult.addEventListener('click', () => {
      const content = summarizeStreaming.getRawText();
      if (!content) return;
      const url = window.panelContext.getCurrentUrl() || '';
      const title = window.panelContext.getCurrentPageTitle() || '';
      const item = { type: 'summarize', url, title, summary: content, timestamp: Date.now() };
      const filename = `clawside_summarize_${new Date().toLocaleString('sv-SE', { hour12: false }).replace(/[-: ]/g, '').replace(',', '')}.md`;
      const exportContent = buildExportContent(item);
      downloadMarkdown(filename, exportContent);
    });
  }

  // Ask from summarize - switch to Ask tab and load summarize as context
  const askFromSummarize = $('askFromSummarize');
  if (askFromSummarize) {
    askFromSummarize.addEventListener('click', async () => {
      const summary = summarizeStreaming.getRawText();
      if (!summary) return;

      // Switch to Ask tab
      showTab('ask');

      // Get current session and add summarize context
      if (chatSession) {
        // Get current tab info
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTabId = tab?.id;
        const currentUrl = window.panelContext.getCurrentUrl();

        // Load existing summarize result to get timestamp
        let timestamp = Date.now();
        if (currentTabId && currentUrl) {
          const existing = await loadSummarizeResult(currentTabId, currentUrl);
          if (existing?.timestamp) {
            timestamp = existing.timestamp;
          }
        }
        // Add user message asking about the summary
        chatSession.addUserMessage('Here is the summary of the current page:', timestamp, 'summarize');
        // Add assistant message with the summarize result
        chatSession.addAssistantMessage(summary, timestamp, 'summarize');
        chatSession.save();
        renderChatMessages();

        // Scroll chat to bottom after DOM update
        if (chatMessages) {
          requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
          });
        }
      }

      // Focus on chat input
      const chatInput = $('chatInput');
      if (chatInput) {
        chatInput.focus();
      }
    });
  }

  // copyAskResult.addEventListener('click', () => doCopy(askStreaming.getRawText(), copyAskResult));

  clearHistoryBtn.addEventListener('click', doClearHistory);

  // Settings
  settingAuthToken.addEventListener('input', updateTokenStatus);
  let saveTimer = null;
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_PORT;
      settings.authToken = settingAuthToken.value.trim();
      settings.language = settingLanguage.value || 'auto';
      settings.appearance = settingAppearance.value || 'system';
      chrome.storage.local.set({ clawside_settings: settings });
      updateTokenStatus();
      applyAppearance();
    }, 300);
  }

  let toolPromptTimer = null;
  function saveToolPrompts() {
    clearTimeout(toolPromptTimer);
    toolPromptTimer = setTimeout(() => {
      settings.toolPrompts = {
        translate: {
          system: $('promptTranslateSystem').value,
          user: $('promptTranslateUser').value
        },
        summarize: {
          system: $('promptSummarizeSystem').value,
          user: $('promptSummarizeUser').value
        },
        ask: {
          system: $('promptAskSystem').value,
          user: $('promptAskUser').value
        },
        globalTranslate: {
          system: $('promptGlobalTranslateSystem').value,
          user: $('promptGlobalTranslateUser').value
        }
      };
      chrome.storage.local.set({ clawside_settings: settings });
    }, 500);
  }

  settingBridgePort.addEventListener('input', () => { autoSave(); });
  settingAuthToken.addEventListener('input', () => { autoSave(); });
  settingLanguage.addEventListener('change', async () => {
    const newLang = settingLanguage.value || 'auto';
    settings.language = newLang;
    applyLanguage();
    await applyPanelLanguage();
    await chrome.storage.local.set({ clawside_settings: settings });
  });
  settingAppearance.addEventListener('change', async () => {
    settings.appearance = settingAppearance.value || 'system';
    applyAppearance();
    await applyPanelLanguage();
    chrome.storage.local.set({ clawside_settings: settings });
  });

  toggleTokenBtn.addEventListener('click', () => {
    const isPassword = settingAuthToken.type === 'password';
    settingAuthToken.type = isPassword ? 'text' : 'password';
    toggleTokenBtn.innerHTML = isPassword ? svgIcon('eyeoff') : svgIcon('eye');
  });
  testConnBtn.addEventListener('click', checkGatewayStatus);

  const scanBtn = $('scanGatewayBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      const originalText = scanBtn.textContent;
      scanBtn.innerHTML = svgIcon('loading');
      const scanStatusEl = $('gatewayStatus');
      const statusBar = $('gatewayStatusBar');
      if (scanStatusEl) {
        statusBar.classList.remove('hidden');
        scanStatusEl.textContent = i18n('scanning') || 'Scanning...';
        scanStatusEl.style.color = 'var(--text)';
      }
      const found = await autoScanGateway();
      scanBtn.disabled = false;
      scanBtn.innerHTML = originalText;
      if (found && found.length > 0) {
        // Auto-fill first found port
        settingBridgePort.value = found[0].port;
        settings.gatewayPort = found[0].port;
        settings.authToken = '';
        settingAuthToken.value = '';
        updateTokenStatus();

        // Show all found gateways
        if (scanStatusEl) {
          const lines = found.map(g => {
            const msg = g.authRequired
              ? i18n('gatewayFoundWithToken').replace('{port}', g.port)
              : i18n('gatewayFound').replace('{port}', g.port);
            return msg;
          });
          scanStatusEl.innerHTML = lines.join('<br>');
          scanStatusEl.style.color = 'var(--success)';
        }
        autoSave();
      } else {
        if (scanStatusEl) {
          scanStatusEl.textContent = i18n('gatewayNotFound');
          scanStatusEl.style.color = 'var(--error)';
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 9: Initialization
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Init ===
  async function init() {
    // Inject SVG sprite for icons
    window.injectSprite(chrome.runtime.getURL('assets/icons/icons.svg')).catch(() => {});

    // Init panel context — MUST await so tabContextManager finishes loading storage
    // before updatePageContext() tries to read from its map.
    await window.panelContext.init({
      panelContext: $('panelContext'),
      ctxFavicon: $('ctxFavicon'),
      ctxTitle: $('ctxTitle'),
      ctxUrl: $('ctxUrl'),
      ctxSelectedText: $('ctxSelectedText'),
      ctxContentPreview: $('ctxContentPreview'),
      ctxHeadingTranslate: $('ctxHeadingTranslate'),
      ctxHeadingSummarize: $('ctxHeadingSummarize'),
      ctxHeadingAsk: $('ctxHeadingAsk'),
      ctxRefreshBtn: $('ctxRefreshBtn'),
      translateInput: translateInput,
    });

    // Detect browser language
    const rawLang = navigator.language || navigator.userLanguage || 'en';
    browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
    await loadSettings();
    if (browserLangHint) browserLangHint.textContent = `${rawLang} → ${browserLang}`;

    // Register the storage listener FIRST — it handles floating-ball clicks when
    // the panel is already open. The write is synchronous, so onChanged fires
    // (and this callback runs) before chrome.storage.local.set returns.
    chrome.storage.onChanged.addListener((changes) => {
      if (!changes._pendingTab) return;
      const tab = changes._pendingTab.newValue;
      if (!tab) return;
      // Guard is module-scoped — set synchronously before the async storage.get call.
      _pendingReadGuard = true;
      chrome.storage.local.get(['_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction', '_pendingMessages'], (stored) => {
        handlePendingTab(tab, stored._pendingUrl || '', stored._pendingTitle || '', stored._pendingText || '', stored._pendingAction, stored._pendingMessages);
      });
    });

    // Read pending tab AFTER listener is registered.
    // IMPORTANT: we must await panelContext.init() so that TCM finishes loading
    // storage before handlePendingTab tries to TCM.get(tabId) — otherwise the
    // TCM map is still empty and TCM.set() overwrites existing content with ''.
    // Cases:
    //  a) Panel freshly opened with pending tab (SW set _pendingTab before open):
    //       onChanged fires → guard=true, _pendingTab still in storage
    //       → storage read sees _pendingTab, guard=true → skip
    //       → panel already on correct tab from onChanged
    //  b) Panel freshly opened, SW set _pendingTab, SW restarted before onChanged:
    //       onChanged fires (guard=true, _pendingTab in storage)
    //       → storage read sees _pendingTab, guard=true → skip
    //       → same as (a)
    //  c) Panel already open, new floating ball click (SW didn't restart):
    //       onChanged fires → guard=true, _pendingTab cleared
    //       → storage read sees no _pendingTab → showTab('translate') ← CORRECT
    //  d) Panel opened without floating ball (no pending tab):
    //       onChanged never fires, guard=false, _pendingTab=null
    //       → storage read → showTab('translate') ← CORRECT
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction', '_pendingMessages'], resolve)
    );
    if (stored._pendingTab) {
      if (!_pendingReadGuard) {
        _pendingReadGuard = true;
        handlePendingTab(stored._pendingTab, stored._pendingUrl || '', stored._pendingTitle || '', stored._pendingText || '', stored._pendingAction, stored._pendingMessages);
      }
    } else if (stored._pendingAction) {
      // Has action but no tab - use action to determine which tab to show
      // Also need to load context and chat messages
      const action = stored._pendingAction;
      const messages = stored._pendingMessages;
      const url = stored._pendingUrl || '';
      const title = stored._pendingTitle || '';
      const text = stored._pendingText || '';

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.id) {
          showTab(action);
          return;
        }

        const actualUrl = url || activeTab.url || '';
        const actualTitle = title || activeTab.title || '';
        const actualFavicon = activeTab.favIconUrl || '';

        const existingCtx = window.tabContextManager.get(activeTab.id);
        const existingContent = existingCtx && existingCtx.content ? existingCtx.content : '';
        const selectedTxt = text || (existingCtx ? existingCtx.selectedText : '');

        const ctx = { url: actualUrl, title: actualTitle, favicon: actualFavicon, content: existingContent, selectedText: selectedTxt };
        window.tabContextManager.set(activeTab.id, ctx);
        window.tabContextManager.setActiveTabId(activeTab.id);

        // Load chat messages BEFORE showTab, so when ask tab renders it has the messages
        if (action === 'ask' && messages && messages.length > 0) {
          _pendingMessagesLoaded = true; // Mark as loaded
          const session = await window.chatSessionManager.getSession(activeTab.id, actualUrl);
          // Set page context
          session.setContext({
            url: actualUrl,
            title: actualTitle,
            content: existingContent,
            selectedText: selectedTxt
          });
          messages.forEach(msg => {
            if (msg.role === 'user') {
              session.addUserMessage(msg.content);
            } else if (msg.role === 'assistant') {
              session.addAssistantMessage(msg.content);
            }
          });
          await session.save();
          // Update global chatSession so renderChatMessages uses the right one
          chatSession = session;
        }

        showTab(action);
        if (window.panelContext._applyContext) window.panelContext._applyContext(ctx);

        // Call renderChatMessages AFTER showTab to ensure the ask panel is visible
        if (action === 'ask' && messages && messages.length > 0) {
          renderChatMessages();
        }

        chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction', '_pendingMessages']);
      });
    } else {
      showTab('translate');
    }

    // Populate context box after tab switch/initial show settles
    await window.panelContext.updatePageContext();

    // Load summarize result for current tab on init
    await refreshSummarizeResult();

    // Listen for Chrome tab switches to refresh context
    chrome.tabs.onActivated.addListener(async (_activeInfo) => {
      await window.panelContext.updatePageContext();
      await refreshChatSession();
      await refreshSummarizeResult();
      // Check if there's a pending summarize result for this browser tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTabId = activeTab?.id || null;
      if (currentTabId && pendingResults.has(currentTabId)) {
        const pending = pendingResults.get(currentTabId);
        if (pending?.fullText) {
          summarizeStreaming.reset();
          summarizeStreaming.appendChunk(pending.fullText);
          summarizeStreaming.flush();
          summarizeResult.classList.remove('hidden');
          pendingResults.delete(currentTabId);
        }
      }
    });

    // Listen for same-tab URL changes (including SPA client-side navigation)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
      if (!changeInfo.url && !changeInfo.title) return;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === tabId) {
        await window.panelContext.updatePageContext();
        await refreshChatSession();
        await refreshSummarizeResult();
      }
    });

    // SPA router: history.pushState/replaceState doesn't change the URL in a way tabs.onUpdated catches,
    // but webNavigation.onHistoryStateUpdated fires for these. Requires "webNavigation" permission.
    chrome.webNavigation?.onHistoryStateUpdated.addListener(async (navInfo) => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === navInfo.tabId) {
        setTimeout(async () => {
          await window.panelContext.updatePageContext();
          await refreshChatSession();
          await refreshSummarizeResult();
        }, 600);
      }
    });

    // Register this panel tab's ID with the background so it can message us later.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({ type: 'panel-ready', panelTabId: tabs[0].id }).catch(() => {});
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 10: Floating Ball Handler & Utilities
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── Floating-ball tab switch handler ─────────────────────────────────────────
  // Called by: (1) storage.onChanged when floating ball is clicked (panel already open),
  //            (2) initial storage read when panel first opens.
  // No guard needed here — callers are responsible for avoiding double-calls.
  function handlePendingTab(tab, url, title, text, action, messages) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) return;

      const actualUrl     = url   || activeTab.url     || '';
      const actualTitle   = title || activeTab.title   || '';
      const actualFavicon = activeTab.favIconUrl       || '';

      const existingCtx = window.tabContextManager.get(activeTab.id);
      // Prefer TCM content (content script already extracted and stored it),
      // but if TCM is empty (content script hasn't written yet, or panel
      // reloaded and lost in-memory map), we re-extract via executeScript.
      const existingContent  = existingCtx && existingCtx.content ? existingCtx.content : '';
      const selectedTxt      = text || (existingCtx ? existingCtx.selectedText : '');

      async function finishWithContent(finalContent) {
        const ctx = { url: actualUrl, title: actualTitle, favicon: actualFavicon, content: finalContent, selectedText: selectedTxt };
        window.tabContextManager.set(activeTab.id, ctx);
        window.tabContextManager.setActiveTabId(activeTab.id);

        // Pre-load chat messages BEFORE showTab if action is 'ask' and there are pending messages
        if (action === 'ask' && messages && messages.length > 0) {
          _pendingMessagesLoaded = true; // Mark as loaded so showTab won't re-init
          chatSession = await window.chatSessionManager.getSession(activeTab.id, actualUrl);
          // Add messages to session
          messages.forEach(msg => {
            if (msg.role === 'user') {
              chatSession.addUserMessage(msg.content);
            } else if (msg.role === 'assistant') {
              chatSession.addAssistantMessage(msg.content);
            }
          });
          await chatSession.save();
        }

        showTab(action || 'translate');
        if (window.panelContext._applyContext) window.panelContext._applyContext(ctx);
        chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction', '_pendingMessages']);

        // Auto-trigger summarize if action is 'summarize' and no existing result
        if (action === 'summarize') {
          const existing = await loadSummarizeResult(activeTab.id, actualUrl);
          if (!existing?.summary) {
            setTimeout(() => doSummarize(), 100);
          }
        }

        // Refresh chat display if messages were loaded
        if (action === 'ask' && messages && messages.length > 0) {
          renderChatMessages();
        }
      }

      const isExtensionPage = !actualUrl
        || actualUrl.startsWith('chrome://')
        || actualUrl.startsWith('chrome-extension://');

      // IMPORTANT: executeScript is async — its .then() fires AFTER handlePendingTab
      // returns and init() continues. To avoid a race where TCM={} is written before
      // executeScript resolves, we ONLY call finishWithContent inside the .then().
      // When TCM already has content, executeScript is skipped and finishWithContent
      // is called immediately (synchronously). When TCM is empty, we wait for
      // executeScript to resolve before calling finishWithContent.
      if (existingContent) {
        // TCM has content — use it directly, no executeScript needed
        finishWithContent(existingContent);
      } else if (activeTab.id && !isExtensionPage) {
        // TCM is empty — extract via executeScript, call finishWithContent when done
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: window.tabContextManager.extractPageContext
        }).then((results) => {
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          finishWithContent(extracted.content + (extracted.jsonLd || ''));
        }).catch(() => {
          finishWithContent('');
        });
      } else {
        // Extension page or no tab — just show the tab
        showTab(action || 'translate');
        chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction', '_pendingMessages']);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 11: End of File
  // ═══════════════════════════════════════════════════════════════════════════════

  // Show copied feedback on button
  function showCopiedFeedback(button) {
    const originalHtml = button.innerHTML;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    button.style.color = 'var(--success)';
    setTimeout(() => {
      button.innerHTML = originalHtml;
      button.style.color = '';
    }, 2000);
  }

  init();
})();
