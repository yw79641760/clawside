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
  window.addEventListener('unload', () => {
    chrome.runtime.sendMessage({ type: 'sidepanel-closed' }).catch(() => {});
  });

  // === Chat State ===
  let chatSession = null;
  let currentChatMessageId = null;
  let firstAsk = true; // flag to include page context on first message

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
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', translateLanguage: 'auto', appearance: 'system', toolPrompts: {} };

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

  // === Translations (chrome.i18n.getMessage + resolveLang/getBrowserLang from browser.js) ===

  async function applyPanelLanguage() {
    // Result titles
    $('titleTranslate') && ($('titleTranslate').textContent = chrome.i18n.getMessage('resultTranslate'));
    $('titleSummarize') && ($('titleSummarize').textContent = chrome.i18n.getMessage('resultSummarize'));
    $('titleAnswer') && ($('titleAnswer').textContent = chrome.i18n.getMessage('resultAnswer'));
    // Copy buttons - icon only, no text
    // $('copyTranslateResult') && ($('copyTranslateResult').innerHTML = `${svgIcon('copy')} ${chrome.i18n.getMessage('copy')}`);
    // $('copySummarizeResult') && ($('copySummarizeResult').innerHTML = `${svgIcon('copy')} ${chrome.i18n.getMessage('copy')}`);
    // Inputs
    $('translateInput') && ($('translateInput').placeholder = chrome.i18n.getMessage('translateInputPlaceholder'));
    // Settings
    $('settingsTitle') && ($('settingsTitle').textContent = chrome.i18n.getMessage('settingsTitle'));
    $('labelTargetLang') && ($('labelTargetLang').textContent = chrome.i18n.getMessage('targetLang'));
    $('labelTargetLangTranslate') && ($('labelTargetLangTranslate').textContent = chrome.i18n.getMessage('labelTargetLangTranslate'));
    $('labelAppearance') && ($('labelAppearance').textContent = chrome.i18n.getMessage('appearance'));
    $('optionAuto') && ($('optionAuto').textContent = chrome.i18n.getMessage('optionAuto'));
    $('optionSystem') && ($('optionSystem').textContent = chrome.i18n.getMessage('systemOpt'));
    $('optionLight') && ($('optionLight').textContent = chrome.i18n.getMessage('lightOpt'));
    $('optionDark') && ($('optionDark').textContent = chrome.i18n.getMessage('darkOpt'));
    $('labelPort') && ($('labelPort').textContent = chrome.i18n.getMessage('gatewayPort'));
    $('labelToken') && ($('labelToken').textContent = chrome.i18n.getMessage('authToken'));
    $('testConnBtn').textContent = chrome.i18n.getMessage('testConn');
    $('gatewayNote') && ($('gatewayNote').innerHTML = chrome.i18n.getMessage('gatewayNote'));
    // Panel headers
    $('titleTranslateHeader') && ($('titleTranslateHeader').textContent = chrome.i18n.getMessage('titleTranslateHeader'));
    $('titleSummarizeHeader') && ($('titleSummarizeHeader').textContent = chrome.i18n.getMessage('titleSummarizeHeader'));
    $('titleAskHeader') && ($('titleAskHeader').textContent = chrome.i18n.getMessage('titleAskHeader'));
    $('titleHistoryHeader') && ($('titleHistoryHeader').textContent = chrome.i18n.getMessage('titleHistoryHeader'));
    // Chat empty state
    $('chatEmptyText') && ($('chatEmptyText').textContent = chrome.i18n.getMessage('chatEmptyText'));
    $('chatEmptyHint') && ($('chatEmptyHint').textContent = chrome.i18n.getMessage('chatEmptyHint'));
    // Chat input placeholder
    $('chatInput') && ($('chatInput').placeholder = chrome.i18n.getMessage('chatInputPlaceholder'));
    // Panel labels and buttons
    $('labelTranslateInput') && ($('labelTranslateInput').textContent = chrome.i18n.getMessage('labelTranslateInput'));
    $('historyClearBtn') && ($('historyClearBtn').textContent = chrome.i18n.getMessage('historyClear'));
    $('labelTranslateBtn') && ($('labelTranslateBtn').textContent = chrome.i18n.getMessage('labelTranslateBtn'));
    $('labelSummarizeBtn') && ($('labelSummarizeBtn').textContent = chrome.i18n.getMessage('labelSummarizeBtn'));
    $('labelAskBtn') && ($('labelAskBtn').textContent = chrome.i18n.getMessage('labelAskBtn'));
    // Loading
    $('loadingText') && ($('loadingText').textContent = chrome.i18n.getMessage('loading'));
    // Settings sub-tabs
    $('labelSettingsBasic') && ($('labelSettingsBasic').textContent = chrome.i18n.getMessage('labelSettingsBasic'));
    $('labelSettingsTools') && ($('labelSettingsTools').textContent = chrome.i18n.getMessage('labelSettingsTools'));
    // Tools settings
    $('labelToolTranslate') && ($('labelToolTranslate').textContent = chrome.i18n.getMessage('labelToolTranslate'));
    $('labelToolSummarize') && ($('labelToolSummarize').textContent = chrome.i18n.getMessage('labelToolSummarize'));
    $('labelToolAsk') && ($('labelToolAsk').textContent = chrome.i18n.getMessage('labelToolAsk'));
    $('labelToolGlobalTranslate') && ($('labelToolGlobalTranslate').textContent = chrome.i18n.getMessage('labelToolGlobalTranslate'));
    $('labelPromptVars') && ($('labelPromptVars').innerHTML = chrome.i18n.getMessage('placeholderPromptVars'));
    // Context headings
    $('ctxHeadingSummarize') && ($('ctxHeadingSummarize').textContent = chrome.i18n.getMessage('labelContextSummarize'));
    $('ctxHeadingAsk') && ($('ctxHeadingAsk').textContent = chrome.i18n.getMessage('labelContextAsk'));
    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = chrome.i18n.getMessage(key);
    });
    // Scan button text
    $('scanGatewayBtn') && ($('scanGatewayBtn').textContent = chrome.i18n.getMessage('scanGateway') || 'Scan');
    // History empty state
    const historyEmptyText = $('historyEmpty')?.querySelector('.empty-text');
    if (historyEmptyText) historyEmptyText.textContent = chrome.i18n.getMessage('emptyHistory');
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
        btnElement.innerHTML = chrome.i18n.getMessage(btnI18nKey) + ' ' + svgIcon('loading');
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
        btnElement.textContent = chrome.i18n.getMessage(btnI18nKey);
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
        const resolvedLang = window.resolveLang(settings.language, browserLang);
        browserLangHint.textContent = `${chrome.i18n.getMessage('browserLangHint')} → ${browserLang}`;
      }
    }
    if (tab === 'ask') {
      await initChat();
      chatInput.focus();
    }
    if (tab === 'summarize' || tab === 'ask') {
      scheduleDeferredContextBackfill(tab);
    }
  }

  function showSettingsSubTab(subtab) {
    $('settingsBasic')?.classList.toggle('hidden', subtab !== 'basic');
    $('settingsTools')?.classList.toggle('hidden', subtab !== 'tools');
    $('settingsTabBasic')?.classList.toggle('active', subtab === 'basic');
    $('settingsTabTools')?.classList.toggle('active', subtab === 'tools');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 5: Settings
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Settings ===
  // === Auto Scan Gateway ===
  async function autoScanGateway() {
    const ports = ['18789', '18790', '18791'];
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
        if (res.ok) return { port, authRequired: false };
        if (res.status === 401 || res.status === 403) return { port, authRequired: true };
      } catch {
        // Port unreachable or timeout — try next
      }
    }
    return null;
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
    // Clear previous status to give visual feedback that button was clicked
    gatewayStatusEl.textContent = 'Checking...';
    gatewayStatusEl.style.color = 'var(--text)';

    // Reuse apiCall to test connection (goes through background script → gateway)
    try {
      const port = settingBridgePort.value?.trim() || DEFAULT_PORT;
      const token = settingAuthToken.value?.trim() || '';
      // Use a minimal prompt to test
      const result = await new Promise((resolve, reject) => {
        const requestId = 'test_' + Date.now();
        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(handler);
          reject(new Error('timeout'));
        }, 15000);
        const handler = (msg) => {
          if (msg.requestId === requestId) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(handler);
            if (msg.type === 'clawside-api-result') resolve(msg.result);
            else reject(new Error(msg.error || 'Unknown error'));
          }
        };
        chrome.runtime.onMessage.addListener(handler);
        chrome.runtime.sendMessage({
          type: 'clawside-api',
          prompt: 'Reply with "OK" only.',
          port, token, requestId, stream: false
        });
      });
      gatewayStatusEl.innerHTML = svgIcon('check') + ' Gateway reachable';
      gatewayStatusEl.style.color = 'var(--success)';
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_token')) {
        gatewayStatusEl.textContent = '✗ Token rejected by gateway';
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg === 'timeout') {
        gatewayStatusEl.textContent = '✗ Cannot reach gateway — check port';
      } else {
        gatewayStatusEl.textContent = '✗ ' + msg;
      }
      gatewayStatusEl.style.color = 'var(--error)';
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
  async function refreshChatContext() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const url = tab.url || '';

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

      // Refresh summarize result for current tab
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
          <button class="message-action-btn" data-action="edit" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="message-action-btn" data-action="copy" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;
      
      // Wire edit button
      const editBtn = div.querySelector('[data-action="edit"]');
      editBtn.addEventListener('click', () => {
        chatInput.value = content;
        chatInput.focus();
        updateChatInputState();
      });
      
      // Wire copy button
      const copyBtn = div.querySelector('[data-action="copy"]');
      copyBtn.addEventListener('click', () => {
        window.copyToClipboard(content);
        showCopiedFeedback(copyBtn);
      });
    } 
    // Assistant message: copy icon on right outside bubble
    else {
      div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          ${htmlContent}
        </div>
        <div class="message-actions-right">
          <button class="message-action-btn" data-action="copy" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;
      
      // Wire copy button
      const copyBtn = div.querySelector('[data-action="copy"]');
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

    chatSession.addUserMessage(content);
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

    const msg = chatSession.addAssistantMessage('');
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    div.dataset.streaming = 'true';

    div.innerHTML = `
      <div class="message-avatar"><img src="../assets/icons/icon16.png" width="28" height="28" alt="AI"></div>
      <div class="message-content streaming"></div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();
    return { msg, div };
  }

  // Update streaming message content
  function updateStreamingMessage(content) {
    const streamingDiv = chatMessages.querySelector('.chat-message.assistant[data-streaming="true"] .message-content');
    if (!streamingDiv) return;

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
          <button class="message-action-btn" data-action="copy" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      `;
      streamingDiv.insertAdjacentHTML('beforeend', actionsHtml);

      // Wire copy button
      const copyBtn = streamingDiv.querySelector('[data-action="copy"]');
      copyBtn.addEventListener('click', () => {
        window.copyToClipboard(content);
        showCopiedFeedback(copyBtn);
      });

      // Update session
      if (chatSession) {
        chatSession.updateLastAssistantMessage(content);
        chatSession.save();
        // First message sent, subsequent messages don't need page context
        firstAsk = false;
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
      // Use firstAsk flag to include page context only on first message
      await loadSettings();
      const langCode = window.resolveLang(settings.language, browserLang);
      const langLabel = langCode === 'zh' ? 'Chinese' : (langCode === 'ja' ? 'Japanese' : 'English');
      chatSession.setContext({
        url: window.panelContext.getCurrentUrl() || chatSession.context.url || '',
        title: window.panelContext.getCurrentPageTitle() || chatSession.context.title || '',
        content: window.panelContext.getCurrentPageContent() || chatSession.context.content || '',
        selectedText: window.panelContext.getSelectedText() || chatSession.context.selectedText || ''
      });
      const extraSystemPrompt = `Response language: ${langLabel}.`;
      const promptText = chatSession.buildPrompt(firstAsk, extraSystemPrompt);
      
      const port = settings.gatewayPort || DEFAULT_PORT;
      const token = settings.authToken || '';
      
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
          port,
          token,
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
    // Reuse hashUrl function
    const hashUrl = (url) => {
      if (!url) return 'none';
      try {
        const u = new URL(url);
        const key = u.origin + u.pathname;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
          const char = key.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
      } catch {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
          const char = url.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
      }
    };
    return `clawside_summarize_${tabId}_${hashUrl(url)}`;
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
    const items = await loadHistory();
    items.unshift(item);
    if (items.length > 50) items.splice(50);
    await saveHistory(items);
  }

  // === API via background script (streaming) ===
  // Store pending results per source tab so they can be restored when user switches back
  const pendingResults = new Map(); // requestTabId -> { fullText, toolName }

  async function apiCall(prompt, { onChunk, toolName = 'default', systemPrompt = '' } = {}) {
    // Get current tab ID at request time
    // Note: sidepanel is an extension page, not a content script.
    // We pass null for sourceTabId so openclaw.js uses runtime.sendMessage.
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
        port: settings.gatewayPort || DEFAULT_PORT,
        token: settings.authToken || '',
        requestId
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 7: Tool Actions (Translate, Summarize, Ask)
  // ═══════════════════════════════════════════════════════════════════════════════

  // === Actions (streaming) ===
  async function doTranslate() {
    const text = translateInput.value.trim();
    if (!text) {
      showStatus(translateStatus, 'Please enter or select text to translate');
      return;
    }
    translateStreaming.reset();
    translateResult.classList.add('hidden');
    showLoading('', translateBtn, 'translating');
    try {
      await loadSettings();
      let targetLang = targetLangSelect.value;
      if (targetLang === 'auto') {
        // translateLanguage is for translation target; language is for summarize/ask reply
        const translateLang = settings.translateLanguage;
        targetLang = (!translateLang || translateLang === 'auto') ? browserLang : (translateLang || browserLang);
      }
      const templates = window.csSettings.getPromptTemplates(settings, 'translate');
      const systemPrompt = templates ? applyPrompt(templates.system, { lang: targetLang }) : '';
      const userPrompt = templates ? applyPrompt(templates.user, { text, lang: targetLang }) : '';
      await apiCall(userPrompt, {
        systemPrompt,
        toolName: 'translate',
        onChunk: (chunk) => {
          translateStreaming.appendChunkAndFlush(chunk);
          translateResult.classList.remove('hidden');
        }
      });
      const result = translateStreaming.getRawText();
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'translate',
        original: text, result, lang: targetLang,
        url: window.panelContext.getCurrentUrl(), timestamp: Date.now()
      });
    } catch (err) {
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
      showLoading(chrome.i18n.getMessage('loading'));
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
      const lang = window.resolveLang(settings.language, browserLang);
      const langLabel = lang === 'zh' ? 'Chinese (中文)' : lang === 'ja' ? 'Japanese (日本語)' : 'English';
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
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'summarize',
        url, title,
        summary, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(summarizeStatus, err.message);
    } finally {
      hideLoading(summarizeBtn, 'tabSummarize');
    }
  }

  async function doCopy(text, btn) {
    if (window.copyToClipboard) await window.copyToClipboard(text);
    btn.innerHTML = svgIcon('check') + ' Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = svgIcon('copy') + ' Copy'; btn.classList.remove('copied'); }, 1500);
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 8: History
  // ═══════════════════════════════════════════════════════════════════════════════

  async function renderHistory() {
    const items = await loadHistory();
    historyCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
    historyEmpty.classList.toggle('hidden', items.length > 0);
    historyList.innerHTML = '';
    clearHistoryBtn.classList.toggle('hidden', items.length === 0);

    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const itemIcon = item.type === 'translate' ? svgIcon('translate') : item.type === 'summarize' ? svgIcon('summarize') : svgIcon('ask');
      const typeLabel = item.type === 'translate' ? chrome.i18n.getMessage('tabTranslate') : item.type === 'summarize' ? chrome.i18n.getMessage('tabSummarize') : chrome.i18n.getMessage('tabAsk');

        let preview;
        if (item.type === 'translate') {
          preview = `<em>"${truncate(item.original, 60)}"</em> → ${item.result}`;
        } else if (item.type === 'summarize') {
          preview = truncate(item.summary || item.url, 80);
        } else {
          preview = `<em>Q:</em> ${truncate(item.question, 60)}`;
        }

        el.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-icon">${itemIcon}</span>
            <span class="history-item-type">${typeLabel}</span>
            <span class="history-item-actions">
              <button class="history-copy-btn" data-index="${idx}" title="Copy">${svgIcon("copy")}</button>
              <button class="history-delete-btn" data-index="${idx}" title="Delete">${svgIcon("delete")}</button>
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

  // Event delegation for history copy/delete buttons
  historyList.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.history-copy-btn');
    const deleteBtn = e.target.closest('.history-delete-btn');
    if (!copyBtn && !deleteBtn) return;

    const idx = parseInt(copyBtn?.dataset.index || deleteBtn?.dataset.index, 10);
    const items = await loadHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length) return;

    if (deleteBtn) {
      items.splice(idx, 1);
      await chrome.storage.local.set({ clawside_memory: items });
      renderHistory();
    } else if (copyBtn) {
      const item = items[idx];
      const text = item.type === 'translate' ? item.result
        : item.type === 'summarize' ? item.summary
        : item.answer || item.question;
      if (window.copyToClipboard) await window.copyToClipboard(text || '');
      const originalText = copyBtn.textContent;
      copyBtn.innerHTML = svgIcon('check');
      setTimeout(() => { copyBtn.textContent = originalText; }, 1000);
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
      handlePendingTab(msg.tab, msg.url || '', msg.title || '', msg.text || '');
    }
    return true;
  });

  // === Event Listeners ===
  tabTranslate.addEventListener('click', () => showTab('translate'));
  tabSummarize.addEventListener('click', () => { showTab('summarize'); window.panelContext.updatePageContext(translateInput).catch(() => {}); });
  tabAsk.addEventListener('click', () => { showTab('ask'); window.panelContext.updatePageContext(translateInput).catch(() => {}); });
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));

  // Settings sub-tabs
  $('settingsTabBasic')?.addEventListener('click', () => showSettingsSubTab('basic'));
  $('settingsTabTools')?.addEventListener('click', () => showSettingsSubTab('tools'));

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

  translateInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doTranslate();
    }
  });

  // Clear translate result when input changes
  translateInput.addEventListener('input', () => {
    translateResult.classList.add('hidden');
  });

  copyTranslateResult.addEventListener('click', () => doCopy(translateStreaming.getRawText(), copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeStreaming.getRawText(), copySummarizeResult));

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
        chatSession.addUserMessage('Here is the summary of the current page:', timestamp);
        // Add assistant message with the summarize result
        chatSession.addAssistantMessage(summary, timestamp);
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
      const newToken = settingAuthToken.value.trim();
      // Skip save if token unchanged (avoid overwriting with stale empty value)
      if (newToken === settings.authToken &&
          (settingBridgePort.value.trim() || DEFAULT_PORT) === settings.gatewayPort &&
          (settingLanguage.value || 'auto') === settings.language &&
          (settingAppearance.value || 'system') === settings.appearance) {
        return;
      }
      settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_PORT;
      settings.authToken = newToken;
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
      scanBtn.textContent = 'Scanning...';
      const scanStatusEl = $('gatewayStatus');
      const statusBar = $('gatewayStatusBar');
      if (scanStatusEl) {
        statusBar.classList.remove('hidden');
        scanStatusEl.textContent = 'Scanning...';
        scanStatusEl.style.color = 'var(--text)';
      }
      const found = await autoScanGateway();
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan';
      if (found) {
        settingBridgePort.value = found.port;
        settings.gatewayPort = found.port;
        settings.authToken = '';
        settingAuthToken.value = '';
        updateTokenStatus();
        if (scanStatusEl) {
          scanStatusEl.innerHTML = `Gateway found on port ${found.port}${found.authRequired ? ' \u2014 token required' : ' \u2014 no auth needed'}`;
          scanStatusEl.style.color = 'var(--success)';
        }
        autoSave();
      } else {
        if (scanStatusEl) {
          scanStatusEl.textContent = 'No gateway found on localhost';
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
      ctxContentPreview: $('ctxContentPreview'),
      ctxHeadingSummarize: $('ctxHeadingSummarize'),
      ctxHeadingAsk: $('ctxHeadingAsk'),
      ctxRefreshBtn: $('ctxRefreshBtn'),
      translateInput: translateInput,
    });

    // Detect browser language
    browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
    const rawLang = navigator.language || navigator.userLanguage || 'en';
    await loadSettings();
    if (browserLangHint) browserLangHint.textContent = `${chrome.i18n.getMessage('browserLangHint')}: ${rawLang} → ${browserLang}`;

    // Register the storage listener FIRST — it handles floating-ball clicks when
    // the panel is already open. The write is synchronous, so onChanged fires
    // (and this callback runs) before chrome.storage.local.set returns.
    chrome.storage.onChanged.addListener((changes) => {
      if (!changes._pendingTab) return;
      const tab = changes._pendingTab.newValue;
      if (!tab) return;
      // Guard is module-scoped — set synchronously before the async storage.get call.
      _pendingReadGuard = true;
      chrome.storage.local.get(['_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction'], (stored) => {
        handlePendingTab(tab, stored._pendingUrl || '', stored._pendingTitle || '', stored._pendingText || '', stored._pendingAction);
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
      chrome.storage.local.get(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction'], resolve)
    );
    if (stored._pendingTab) {
      if (!_pendingReadGuard) {
        _pendingReadGuard = true;
        // NOTE: handlePendingTab runs AFTER panelContext.init() completes
        // (see below — chained via .then) so TCM storage is already loaded.
        handlePendingTab(stored._pendingTab, stored._pendingUrl || '', stored._pendingTitle || '', stored._pendingText || '', stored._pendingAction);
      }
    } else {
      showTab('translate');
    }

    // Populate context box after tab switch/initial show settles
    await window.panelContext.updatePageContext();

    // Load summarize result for current tab on init
    await refreshChatContext();

    // Listen for Chrome tab switches to refresh context
    chrome.tabs.onActivated.addListener(async (_activeInfo) => {
      await window.panelContext.updatePageContext();
      await refreshChatContext();
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
        await refreshChatContext();
      }
    });

    // SPA router: history.pushState/replaceState doesn't change the URL in a way tabs.onUpdated catches,
    // but webNavigation.onHistoryStateUpdated fires for these. Requires "webNavigation" permission.
    chrome.webNavigation?.onHistoryStateUpdated.addListener(async (navInfo) => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === navInfo.tabId) {
        setTimeout(async () => {
          await window.panelContext.updatePageContext();
          await refreshChatContext();
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
  function handlePendingTab(tab, url, title, text, action) {
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
        showTab(tab);
        if (window.panelContext._applyContext) window.panelContext._applyContext(ctx);
        chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction']);

        // Auto-trigger summarize if action is 'summarize' and no existing result
        if (action === 'summarize') {
          const existing = await loadSummarizeResult(activeTab.id, actualUrl);
          if (!existing?.summary) {
            setTimeout(() => doSummarize(), 100);
          }
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
        showTab(tab);
        chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText', '_pendingAction']);
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
