// ClawSide - Full Side Panel Logic

(function () {
  'use strict';

  const DEFAULT_PORT = '18789';

  // === State ===
  let currentTab = 'translate';
  let selectedText = '';
  let currentUrl = '';
  let currentPageTitle = '';
  let currentPageContent = '';
  let history = [];
  let browserLang = 'English';
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', appearance: 'system' };

  // === Translations ===
  let I18N = null;

  async function loadI18n() {
    if (I18N) return I18N;
    try {
      const res = await fetch(chrome.runtime.getURL('i18n.json'));
      I18N = await res.json();
    } catch {
      I18N = { en: {}, zh: {}, ja: {} };
    }
    return I18N;
  }

  function resolveLang(lang, browserLang) {
    if (lang === 'auto') return browserLang === 'zh' ? 'zh' : browserLang === 'ja' ? 'ja' : 'en';
    return lang === 'Chinese' ? 'zh' : lang === 'Japanese' ? 'ja' : 'en';
  }

  async function applyPanelLanguage() {
    const i18n = await loadI18n();
    const lang = resolveLang(settings.language, browserLang);
    const t = i18n[lang] || i18n.en || {};
    // Result titles
    $('titleTranslate').textContent = t.resultTranslate;
    $('titleSummarize').textContent = t.resultSummarize;
    $('titleAnswer').textContent = t.resultAnswer;
    // Copy buttons
    $('copyTranslateResult').textContent = t.copy;
    $('copySummarizeResult').textContent = t.copy;
    $('copyAskResult').textContent = t.copy;
    // Inputs
    $('askQuestion').placeholder = t.askPlaceholder;
    $('translateInput').placeholder = t.translateInputPlaceholder;
    // Settings
    $('settingsTitle').textContent = t.settingsTitle;
    $('labelTargetLang').textContent = t.targetLang;
    $('labelTargetLangTranslate').textContent = t.labelTargetLangTranslate || t.targetLang;
    $('labelAppearance').textContent = t.appearance;
    $('optionAuto').textContent = t.optionAuto;
    $('optionSystem').textContent = t.systemOpt;
    $('optionLight').textContent = t.lightOpt;
    $('optionDark').textContent = t.darkOpt;
    $('labelPort').textContent = t.gatewayPort;
    $('labelToken').textContent = t.authToken;
    $('testConnBtn').textContent = t.testConn;

    $('gatewayNote').innerHTML = t.gatewayNote;
    // Panel headers
    $('titleTranslateHeader').textContent = t.titleTranslateHeader;
    $('titleSummarizeHeader').textContent = t.titleSummarizeHeader;
    $('titleAskHeader').textContent = t.titleAskHeader;
    $('titleHistoryHeader').textContent = t.titleHistoryHeader;
    // Panel labels and buttons

    
    
    
    
    
    // History
    $('labelTranslateInput').textContent = t.labelTranslateInput;
    $('historyClearBtn').textContent = t.historyClear;
    // Panel buttons
    $('labelTranslateBtn').textContent = t.labelTranslateBtn;
    $('labelSummarizeBtn').textContent = t.labelSummarizeBtn;
    $('labelAskBtn').textContent = t.labelAskBtn;
    // Loading
    $('loadingText').textContent = t.loading;
    // History empty state
    const historyEmptyText = $('historyEmpty').querySelector('.empty-text');
    if (historyEmptyText) historyEmptyText.textContent = t.emptyHistory;
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

  // Summarize
  const pageUrlEl = $('pageUrl');
  const summarizeFavicon = $('summarizeFavicon');
  const summarizeTitle = $('summarizeTitle');
  const summarizeContentPreview = $('summarizeContentPreview');
  const askFavicon = $('askFavicon');
  const askTitle = $('askTitle');
  const askContextUrl = $('askContextUrl');
  const askContentPreview = $('askContentPreview');
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  // Ask
  const askContextUrlEl = $('askContextUrl');
  const askQuestion = $('askQuestion');
  const askBtn = $('askBtn');
  const askResult = $('askResult');
  const askResultText = $('askResultText');
  const copyAskResult = $('copyAskResult');
  const askStatus = $('askStatus');

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

  // === Utilities ===
  function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function showStatus(el, message, type = 'error') {
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function showTab(tab) {
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

    if (tab === 'history') renderHistory();
    if (tab === 'settings') {
      updateTokenStatus();
      if (browserLangHint) {
        const resolvedLang = resolveLang(settings.language, browserLang);
        const t2 = I18N ? (I18N[resolvedLang] || I18N.en || {}) : {};
        browserLangHint.textContent = `${t2.browserLangHint || 'Browser language'} → ${browserLang}`;
      }
    }
    if (tab === 'ask') askQuestion.focus();
    // Fetch current tab URL for summarize/ask context
    if (tab === 'summarize' || tab === 'ask') {
      chrome.tabs.query({ active: true, currentWindow: true }).then(async ([t]) => {
        if (t) {
          currentUrl = t.url || '';
          currentPageTitle = t.title || '';
          const favicon = t.favIconUrl || '';
          // Extract page content
          let content = '';
          if (t.id) {
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: extractPageContent
              });
              content = results?.[0]?.result || '';
            } catch {}
          }
          currentPageContent = content;
          // Update summarize panel
          if (summarizeFavicon) summarizeFavicon.src = favicon;
          if (summarizeTitle) summarizeTitle.textContent = currentPageTitle || '—';
          if (pageUrlEl) pageUrlEl.textContent = currentUrl || '—';
          if (summarizeContentPreview) summarizeContentPreview.textContent = content ? content.slice(0, 20) + '...' : '';
          // Update ask panel
          if (askFavicon) askFavicon.src = favicon;
          if (askTitle) askTitle.textContent = currentPageTitle || '—';
          if (askContextUrlEl) askContextUrlEl.textContent = currentUrl || '—';
          if (askContentPreview) askContentPreview.textContent = content ? content.slice(0, 20) + '...' : '';
        }
      }).catch(() => {});
    }
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', appearance: 'system' };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_PORT;
    settingAuthToken.value = settings.authToken || '';
    settingLanguage.value = settings.language || 'auto';
    settingAppearance.value = settings.appearance || 'system';
    updateTokenStatus();
    applyLanguage();
    applyAppearance();
    await applyPanelLanguage();
  }

  function applyLanguage() {
    // For auto mode, use browserLang; otherwise use the saved setting
    const lang = settings.language === 'auto' ? browserLang : settings.language;
    targetLangSelect.value = lang;
    // Keep Settings dropdown in sync with the resolved display
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
    gatewayStatusEl.textContent = 'Checking...';
    gatewayStatusEl.style.color = '';

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

  // === Memory ===
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
  function apiCall(prompt, { onChunk } = {}) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let fullText = '';
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
      };

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; cleanup(); reject(new Error('Request timeout')); }
      }, 90000);

      const handler = (msg) => {
        if (msg.requestId !== requestId) return;

        if (msg.type === 'clawside-stream-chunk' && onChunk) {
          fullText += msg.content;
          onChunk(msg.content, fullText);
        }
        if (msg.type === 'clawside-stream-done') {
          if (!settled) { settled = true; cleanup(); resolve(fullText); }
        }
        if (msg.type === 'clawside-stream-error') {
          if (!settled) { settled = true; cleanup(); reject(new Error(msg.error)); }
        }
      };

      chrome.runtime.onMessage.addListener(handler);
      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt,
        port: settings.gatewayPort || DEFAULT_PORT,
        token: settings.authToken || '',
        requestId
      });
    });
  }

  // === Actions (streaming) ===
  async function doTranslate() {
    const text = translateInput.value.trim();
    if (!text) {
      showStatus(translateStatus, 'Please enter or select text to translate');
      return;
    }
    translateResult.classList.add('hidden');
    translateResultText.textContent = '';
    translateBtn.disabled = true;
    showLoading('Translating...');
    try {
      await loadSettings();
      // Read from DOM first (user's current selection), fallback to settings for 'auto'
      let targetLang = targetLangSelect.value;
      if (targetLang === 'auto') {
        targetLang = (!settings.language || settings.language === 'auto') ? browserLang : (settings.language || browserLang);
      }
      const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`;
      // Stream chunks into result
      await apiCall(prompt, {
        onChunk: (chunk) => {
          translateResultText.textContent += chunk;
          translateResult.classList.remove('hidden');
        }
      });
      const result = translateResultText.textContent;
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'translate',
        original: text, result, lang: targetLang,
        url: currentUrl, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(translateStatus, err.message);
    } finally {
      hideLoading();
      translateBtn.disabled = false;
    }
  }

  async function doSummarize() {
    if (!currentUrl) {
      showStatus(summarizeStatus, 'No current page detected. Navigate to a page first.');
      return;
    }
    summarizeResult.classList.add('hidden');
    summarizeResultText.textContent = '';
    summarizeBtn.disabled = true;
    showLoading('Extracting page content...');

    let pageContent = '';
    let extractionFailed = false;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent
        });
        pageContent = results?.[0]?.result || '';
        if (!pageContent || pageContent.trim().length < 100) {
          extractionFailed = true;
        }
      } else {
        extractionFailed = true;
      }
    } catch (err) {
      extractionFailed = true;
    }

    if (extractionFailed) {
      hideLoading();
      showStatus(summarizeStatus, `Cannot extract page content. Try selecting specific text and using the Ask feature instead.`);
      summarizeBtn.disabled = false;
      return;
    }

    showLoading('Summarizing...');
    try {
      await loadSettings();
      const lang = resolveLang(settings.language, browserLang);
      const langLabel = lang === 'zh' ? 'Chinese (中文)' : lang === 'ja' ? 'Japanese (日本語)' : 'English';
      let prompt;
      if (pageContent) {
        prompt = `You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences in ${langLabel}. Focus on the main points and key information. Only output the summary in ${langLabel}, nothing else.\n\nPage title: ${currentPageTitle}\nPage URL: ${currentUrl}\n\nContent:\n${pageContent.slice(0, 8000)}`;
      } else {
        prompt = `You are a page summarizer. Summarize the content at the following URL in 3-5 clear sentences in ${langLabel}. Focus on the main points and key information. Only output the summary in ${langLabel}, nothing else.\n\nURL: ${currentUrl}`;
      }
      await apiCall(prompt, {
        onChunk: (chunk) => {
          summarizeResultText.textContent += chunk;
          summarizeResult.classList.remove('hidden');
        }
      });
      const summary = summarizeResultText.textContent;
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'summarize',
        url: currentUrl, title: currentPageTitle,
        summary, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(summarizeStatus, err.message);
    } finally {
      hideLoading();
      summarizeBtn.disabled = false;
    }
  }

  async function doAsk() {
    const question = askQuestion.value.trim();
    if (!question) {
      showStatus(askStatus, 'Please enter a question');
      return;
    }
    askResult.classList.add('hidden');
    askResultText.textContent = '';
    askBtn.disabled = true;
    showLoading('Extracting page context...');

    let pageContent = '';
    let extractionFailed = false;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent
        });
        pageContent = results?.[0]?.result || '';
        if (!pageContent || pageContent.trim().length < 100) {
          extractionFailed = true;
        }
      } else {
        extractionFailed = true;
      }
    } catch (err) {
      extractionFailed = true;
    }

    if (extractionFailed) {
      pageContent = '';
    }

    showLoading('Thinking...');
    try {
      await loadSettings();
      let targetLang = (!settings.language || settings.language === 'auto') ? browserLang : (settings.language || browserLang);
      let lang = targetLang;
      let prompt;
      if (pageContent) {
        if (selectedText) {
          prompt = `You are a helpful assistant. Answer in ${lang}. The user selected this text from a webpage:\n\n"${selectedText}"\n\nThe full page content is provided below for additional context.\n\nPage title: ${currentPageTitle}\nPage URL: ${currentUrl}\n\nPage content (excerpt):\n${pageContent.slice(0, 6000)}\n\nUser question: ${question}`;
        } else {
          prompt = `You are a helpful assistant. Answer in ${lang}. The user is viewing this webpage. The page content is provided below.\n\nPage title: ${currentPageTitle}\nPage URL: ${currentUrl}\n\nPage content (excerpt):\n${pageContent.slice(0, 6000)}\n\nUser question: ${question}`;
        }
      } else {
        if (selectedText) {
          prompt = `You are a helpful assistant. Answer in ${lang}. The user selected this text from a webpage:\n\n"${selectedText}"\n\nPage: ${currentUrl}\n\nUser question: ${question}`;
        } else {
          prompt = `You are a helpful assistant. Answer in ${lang}. The user is viewing this page: ${currentUrl}\n\nUser question: ${question}`;
        }
      }
      await apiCall(prompt, {
        onChunk: (chunk) => {
          askResultText.textContent += chunk;
          askResult.classList.remove('hidden');
        }
      });
      const answer = askResultText.textContent;
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'ask',
        question, answer,
        context: selectedText || currentUrl,
        url: currentUrl, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(askStatus, err.message);
    } finally {
      hideLoading();
      askBtn.disabled = false;
    }
  }

  async function doCopy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    btn.innerHTML = svgIcon('check') + ' Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = svgIcon('copy') + ' Copy'; btn.classList.remove('copied'); }, 1500);
  }

  // === Page Content Extraction (injected into page) ===
  // This function runs in the context of the web page
  function extractPageContent() {
    try {
      // Clone body to avoid mutating the actual page
      const clone = document.body.cloneNode(true);

      // Remove obvious noise
      const noiseSelectors = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'button', 'input',
        'nav', 'footer', 'aside',
        '.ad', '.ads', '.advert', '.advertisement',
        '.sidebar', '#sidebar', '.nav', '.menu', '.footer',
        '.social', '.share', '.related', '.comment', '#comments',
        '.pagination', '.breadcrumb', '.nav-links'
      ];
      noiseSelectors.forEach(sel => {
        try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
      });

      // Strategy 1: try innerText (visible rendered text)
      let text = clone.innerText?.trim() || '';

      // Strategy 2: if innerText is too short, use textContent
      if (text.length < 200) {
        text = (clone.textContent || '').trim();
      }

      // Clean up: collapse whitespace, remove unicode whitespace
      text = text.replace(/[\r\n]+/g, '\n').replace(/[ \t]+/g, ' ').replace(/[\u200b-\u200f\u2028-\u202f]/g, '').trim();

      // Remove very short lines (likely UI noise)
      const lines = text.split('\n').filter(line => line.trim().length > 10);
      text = lines.join('\n');

      // Truncate to avoid token limits
      return text.slice(0, 10000).trim();
    } catch (err) {
      return '';
    }
  }

  // === Tab Switch Detection ===
  // Listen for tab changes so we can update current page URL
  async function updateCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const prevUrl = currentUrl;
        currentUrl = tab.url || '';
        currentPageTitle = tab.title || '';

        // Update URL display in summarize panel
        if (pageUrlEl) pageUrlEl.textContent = currentUrl || '—';

        // If URL changed significantly, clear old selection
        if (prevUrl && prevUrl !== currentUrl) {
          selectedText = '';
          translateInput.value = '';
        }

        // Try to get selected text from content script
        chrome.tabs.sendMessage(tab.id, { type: 'get_selection' }).catch(() => {});
      }
    } catch (err) {
      // Ignore
    }
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

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
  const SVG = {
    translate: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="min-width:18px;min-height:18px"><path d="M4 7h5M4 12h5M4 17h5"></path><path d="M13 12h6"></path><path d="M16 8l3 4-3 4"></path></svg>',
    summarize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
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

  async function renderHistory() {
    await loadI18n();
    const lang = resolveLang(settings.language, browserLang);
    const t = I18N[lang] || I18N.en || {};
    const items = await loadHistory();
    historyCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
    historyEmpty.classList.toggle('hidden', items.length > 0);
    historyList.innerHTML = '';
    clearHistoryBtn.classList.toggle('hidden', items.length === 0);

    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const itemIcon = item.type === 'translate' ? svgIcon('translate') : item.type === 'summarize' ? svgIcon('summarize') : svgIcon('ask');
      const typeLabel = item.type === 'translate' ? t.tabTranslate : item.type === 'summarize' ? t.tabSummarize : t.tabAsk;

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
      await navigator.clipboard.writeText(text || '');
      const originalText = copyBtn.textContent;
      copyBtn.innerHTML = svgIcon('check');
      setTimeout(() => { copyBtn.textContent = originalText; }, 1000);
    }
  });

  // === Messages from content script ===
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'text_selected') {
      selectedText = msg.text || '';
      currentUrl = msg.url || '';
      currentPageTitle = msg.title || '';

      // Update translate input
      if (selectedText && !translateInput.value) {
        translateInput.value = selectedText;
      }

      // Update ask context display
      if (askTitle) askTitle.textContent = currentPageTitle || '—';
      if (askContextUrlEl) askContextUrlEl.textContent = currentUrl || '—';
      if (askContentPreview) {
        if (selectedText) {
          askContentPreview.textContent = `"${truncate(selectedText, 100)}"`;
        } else {
          askContentPreview.textContent = '';
        }
      }

      // Update summarize URL
      if (pageUrlEl) pageUrlEl.textContent = currentUrl || '—';
    }
    return true;
  });

  // === Event Listeners ===
  tabTranslate.addEventListener('click', () => showTab('translate'));
  tabSummarize.addEventListener('click', () => showTab('summarize'));
  tabAsk.addEventListener('click', () => showTab('ask'));
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));

  translateBtn.addEventListener('click', doTranslate);
  summarizeBtn.addEventListener('click', doSummarize);
  askBtn.addEventListener('click', doAsk);

  // Ctrl+Enter in translate input
  translateInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doTranslate();
    }
  });

  // Ctrl+Enter in ask textarea
  askQuestion.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doAsk();
    }
  });

  // Clear translate result when input changes
  translateInput.addEventListener('input', () => {
    translateResult.classList.add('hidden');
  });

  copyTranslateResult.addEventListener('click', () => doCopy(translateResultText.textContent, copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeResultText.textContent, copySummarizeResult));
  copyAskResult.addEventListener('click', () => doCopy(askResultText.textContent, copyAskResult));

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

  settingBridgePort.addEventListener('input', () => { autoSave(); });
  settingAuthToken.addEventListener('input', () => { autoSave(); });
  settingLanguage.addEventListener('change', async () => {
    const newLang = settingLanguage.value || 'auto';
    settings.language = newLang;
    applyLanguage();
    await applyPanelLanguage();
    await chrome.storage.local.set({ clawside_settings: settings });
    console.log('[DEBUG] Language saved:', newLang, 'browserLang:', browserLang);
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

  // === Init ===
  async function init() {
    // Detect browser language
    const lang = navigator.language || navigator.userLanguage || 'en';
    const langMap = {
      'zh': 'Chinese', 'zh-CN': 'Chinese', 'zh-TW': 'Chinese', 'zh-HK': 'Chinese',
      'ja': 'Japanese', 'ko': 'Korean',
      'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian',
      'en': 'English'
    };
    browserLang = langMap[lang] || langMap[lang.split('-')[0]] || 'English';
    await loadSettings();
    const i18nData = await loadI18n();
    const resolvedLang = resolveLang(settings.language, browserLang);
    const t = i18nData[resolvedLang] || i18nData.en || {};
    if (browserLangHint) browserLangHint.textContent = `${t.browserLangHint || 'Browser language'}: ${lang} → ${browserLang}`;
    await updateCurrentTab();
    showTab('translate');
  }

  init();
})();
