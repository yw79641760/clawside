// ClawSide - Full Side Panel Logic
// Shared modules loaded via <script> in sidepanel.html:
//   tools/icons.js        → window.SVG, window.svgIcon()
//   tools/i18n.js         → window.loadI18n(), window.resolveLang(), window.getBrowserLang()
//   tools/browser.js      → window.getBrowserLocale(), window.copyToClipboard()
//   comp/streaming-result.js  → window.StreamingResult

(function () {
  'use strict';

  // === Notify background when panel is closed (ESC, click outside, etc.) ===
  window.addEventListener('unload', () => {
    chrome.runtime.sendMessage({ type: 'sidepanel-closed' }).catch(() => {});
  });

  const DEFAULT_PORT = '18789';

  // === Default Tool Prompts ===
  const DEFAULT_PROMPTS = {
    translate: `You are a professional translator. Translate the following text to {lang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: {text}`,
    summarize: `Summarize the following page in {lang}. Use this structure:
- **Overview**: 1-2 sentences, what this page is about
- **Key Points**: bullet points, the most important information (let content decide the count, typically 2-6)
- **Highlights**: standout facts, data, or quotes worth noting

Output Markdown only. Be concise and let the content determine the depth of each section.\n\nPage title: {title}\nPage URL: {url}\n\nContent:\n{content}`,
    ask: `You are a helpful assistant. Answer in {lang}.\n\n{hasSelection}User selected this text from a webpage:\n\n"{selectedText}"\n\n{/hasSelection}Page title: {title}\nPage URL: {url}\n\n{hasContent}Page content (excerpt):\n{content}\n\n{/hasContent}User question: {question}`
  };

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

  // === State ===
  let currentTab = 'translate';
  let selectedText = '';
  let currentUrl = '';
  let currentPageTitle = '';
  let currentPageContent = '';
  let history = [];
  let browserLang = 'English';
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', appearance: 'system', toolPrompts: {} };

  // === Translations ===
  // loadI18n, resolveLang, getBrowserLang are provided by tools/i18n.js

  async function applyPanelLanguage() {
    const i18n = await window.loadI18n();
    const lang = window.resolveLang(settings.language, browserLang);
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

  // Summarize / Ask shared context
  const pageContext = $('pageContext');
  const ctxFavicon = $('ctxFavicon');
  const ctxTitle = $('ctxTitle');
  const ctxUrl = $('ctxUrl');
  const ctxContentPreview = $('ctxContentPreview');
  const pageUrlEl = $('pageUrl'); // kept for backward compat if any
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  // Ask
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

  // === Streaming Result Components ===
  const translateStreaming = new StreamingResult({ element: translateResultText });
  const summarizeStreaming = new StreamingResult({ element: summarizeResultText });
  const askStreaming = new StreamingResult({ element: askResultText });

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
    if (pageContext) pageContext.classList.toggle('hidden', !['summarize', 'ask'].includes(tab));
    // Show the right heading inside pageContext
    $('ctxHeadingSummarize')?.classList.toggle('hidden', tab !== 'summarize');
    $('ctxHeadingAsk')?.classList.toggle('hidden', tab !== 'ask');

    if (tab === 'history') renderHistory();
    if (tab === 'settings') {
      updateTokenStatus();
      showSettingsSubTab('basic');
      if (browserLangHint) {
        const resolvedLang = window.resolveLang(settings.language, browserLang);
        const i18n2 = await window.loadI18n();
        const t2 = i18n2[resolvedLang] || i18n2.en || {};
        browserLangHint.textContent = `${t2.browserLangHint || 'Browser language'} → ${browserLang}`;
      }
    }
    if (tab === 'ask') askQuestion.focus();
  }

  function showSettingsSubTab(subtab) {
    $('settingsBasic')?.classList.toggle('hidden', subtab !== 'basic');
    $('settingsTools')?.classList.toggle('hidden', subtab !== 'tools');
    $('settingsTabBasic')?.classList.toggle('active', subtab === 'basic');
    $('settingsTabTools')?.classList.toggle('active', subtab === 'tools');
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto', appearance: 'system', toolPrompts: {} };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_PORT;
    settingAuthToken.value = settings.authToken || '';
    settingLanguage.value = settings.language || 'auto';
    settingAppearance.value = settings.appearance || 'system';
    updateTokenStatus();
    applyLanguage();
    applyAppearance();
    await applyPanelLanguage();
    // Load tool prompts into textareas
    loadToolPrompts();
  }

  function loadToolPrompts() {
    const prompts = settings.toolPrompts || {};
    $('promptTranslate').value = prompts.translate || DEFAULT_PROMPTS.translate;
    $('promptSummarize').value = prompts.summarize || DEFAULT_PROMPTS.summarize;
    $('promptAsk').value = prompts.ask || DEFAULT_PROMPTS.ask;
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
  function apiCall(prompt, { onChunk, toolName = 'default' } = {}) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let fullText = '';
      let settled = false;
      let chunkShown = false; // true after first chunk received → hide loading

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
          // First chunk → hide loading overlay immediately
          if (!chunkShown) { chunkShown = true; hideLoading(); }
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
        toolName,  // e.g. 'translate', 'summarize', 'ask' — Gateway derives user="clawside:{toolName}" for session复用
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
    translateStreaming.reset();
    translateResult.classList.add('hidden');
    translateBtn.disabled = true;
    showLoading('Translating...');
    try {
      await loadSettings();
      let targetLang = targetLangSelect.value;
      if (targetLang === 'auto') {
        targetLang = (!settings.language || settings.language === 'auto') ? browserLang : (settings.language || browserLang);
      }
      const template = settings.toolPrompts?.translate || DEFAULT_PROMPTS.translate;
      const prompt = applyPrompt(template, { text, lang: targetLang });
      await apiCall(prompt, {
        toolName: 'translate',
        onChunk: (chunk) => {
          translateStreaming.appendChunk(chunk);
          translateResult.classList.remove('hidden');
        }
      });
      translateStreaming.flush();
      const result = translateStreaming.getRawText();
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
    summarizeStreaming.reset();
    summarizeResult.classList.add('hidden');
    summarizeBtn.disabled = true;

    // Reuse currentPageContent from shared context; re-extract only if stale/empty
    let pageContent = currentPageContent;
    let extractionFailed = false;

    if (!pageContent || pageContent.trim().length < 100) {
      showLoading('Extracting page content...');
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageContent
          });
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          pageContent = extracted.content + (extracted.jsonLd || '');
          currentPageContent = pageContent; // update shared context
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

    showLoading('Summarizing...');
    try {
      await loadSettings();
      const template = settings.toolPrompts?.summarize || DEFAULT_PROMPTS.summarize;
      const lang = window.resolveLang(settings.language, browserLang);
      const langLabel = lang === 'zh' ? 'Chinese (中文)' : lang === 'ja' ? 'Japanese (日本語)' : 'English';
      const prompt = applyPrompt(template, {
        lang: langLabel,
        title: currentPageTitle,
        url: currentUrl,
        content: pageContent ? pageContent.slice(0, 8000) : ''
      });
      await apiCall(prompt, {
        toolName: 'summarize',
        onChunk: (chunk) => {
          summarizeStreaming.appendChunk(chunk);
          summarizeResult.classList.remove('hidden');
        }
      });
      summarizeStreaming.flush();
      const summary = summarizeStreaming.getRawText();
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
    askStreaming.reset();
    askResult.classList.add('hidden');
    askBtn.disabled = true;

    // Reuse currentPageContent from shared context; re-extract only if stale/empty
    let pageContent = currentPageContent;
    let extractionFailed = false;

    if (!pageContent || pageContent.trim().length < 100) {
      showLoading('Extracting page context...');
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageContent
          });
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          pageContent = extracted.content + (extracted.jsonLd || '');
          currentPageContent = pageContent; // update shared context
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
    }

    showLoading('Thinking...');
    try {
      await loadSettings();
      const template = settings.toolPrompts?.ask || DEFAULT_PROMPTS.ask;
      const targetLang = (!settings.language || settings.language === 'auto') ? browserLang : (settings.language || browserLang);
      const prompt = applyPrompt(template, {
        lang: targetLang,
        title: currentPageTitle,
        url: currentUrl,
        content: pageContent ? pageContent.slice(0, 6000) : '',
        question,
        selectedText: selectedText || ''
      });
      await apiCall(prompt, {
        toolName: 'ask',
        onChunk: (chunk) => {
          askStreaming.appendChunk(chunk);
          askResult.classList.remove('hidden');
        }
      });
      askStreaming.flush();
      const answer = askStreaming.getRawText();
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
    if (window.copyToClipboard) await window.copyToClipboard(text);
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
      text = text.slice(0, 10000).trim();

      // Extract JSON-LD structured data (for AI context enrichment)
      let jsonLdText = '';
      try {
        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        const parts = [];
        ldScripts.forEach((script) => {
          try {
            const data = JSON.parse(script.textContent);
            // Handle @graph arrays (multiple entities in one script)
            const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
            items.forEach((item) => {
              if (!item) return;
              // Extract useful fields
              const fields = ['headline', 'name', 'articleBody', 'text', 'contentText',
                              'description', 'summary', 'author', 'creator', 'publisher',
                              'datePublished', 'dateCreated', 'dateModified'];
              const extracted = [];
              fields.forEach((f) => {
                if (item[f]) {
                  const val = typeof item[f] === 'object' ? item[f].name || item[f] : item[f];
                  extracted.push(`${f}: ${val}`);
                }
              });
              if (extracted.length > 0) {
                parts.push(extracted.join(', '));
              }
            });
          } catch {}
        });
        if (parts.length > 0) {
          jsonLdText = '\n[Structured Data]\n' + parts.join('\n');
        }
      } catch {}

      return { content: text, jsonLd: jsonLdText };
    } catch (err) {
      return { content: '', jsonLd: '' };
    }
  }

  // === Tab Switch Detection ===
  // Listen for tab changes so we can update current page URL
  async function updatePageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const prevUrl = currentUrl;
      currentUrl = tab.url || '';
      currentPageTitle = tab.title || '';
      const favicon = tab.favIconUrl || '';

      // Extract page content from the active web page tab (not the side panel itself)
      let content = '';
      const activeTabId = tab.id;
      const isExtensionPage = !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
      if (activeTabId && !isExtensionPage) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: extractPageContent
          });
          const extracted = results?.[0]?.result || { content: '', jsonLd: '' };
          content = extracted.content + (extracted.jsonLd || '');
          console.log('[ClawSide] extractPageContent result length:', content.length);
        } catch (err) {
          console.warn('[ClawSide] extractPageContent failed:', err.message || err);
        }
      } else if (isExtensionPage) {
        console.warn('[ClawSide] updatePageContext: active tab is extension page, skipping extract:', tab.url);
      } else {
        console.warn('[ClawSide] updatePageContext: no active tab id');
      }
      currentPageContent = content;

      // Update shared context box
      if (ctxFavicon) ctxFavicon.src = favicon;
      if (ctxTitle) ctxTitle.textContent = currentPageTitle || '—';
      if (ctxUrl) ctxUrl.textContent = currentUrl || '—';
      if (ctxContentPreview) ctxContentPreview.textContent = content ? truncate(content, 20) : '';

      // If URL changed significantly, clear old selection
      if (prevUrl && prevUrl !== currentUrl) {
        selectedText = '';
        translateInput.value = '';
        askQuestion.value = '';
      }

      // Try to get selected text from content script
      chrome.tabs.sendMessage(tab.id, { type: 'get_selection' }).catch(() => {});
    } catch (err) {
      console.warn('[ClawSide] updatePageContext error:', err.message || err);
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
  // All icons reference icons/icons.svg sprite via <use>.
  const SVG = {
    translate: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-translate"></use></svg>',
    summarize: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-summarize"></use></svg>',
    ask: '<svg class="tab-icon" width="16" height="16" viewBox="0 0 24 24"><use href="#cs-icon-ask"></use></svg>',
    copy: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-copy"></use></svg>',
    delete: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-delete"></use></svg>',
    check: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-check"></use></svg>',
    eye: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye"></use></svg>',
    eyeoff: '<svg class="btn-icon-svg" width="14" height="14" viewBox="0 0 24 24"><use href="#cs-icon-eye-off"></use></svg>',
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
    const i18n = await window.loadI18n();
    const lang = window.resolveLang(settings.language, browserLang);
    const t = i18n[lang] || i18n.en || {};
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
      if (window.copyToClipboard) await window.copyToClipboard(text || '');
      const originalText = copyBtn.textContent;
      copyBtn.innerHTML = svgIcon('check');
      setTimeout(() => { copyBtn.textContent = originalText; }, 1000);
    }
  });

  // === Messages from content script / background ===
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'text_selected') {
      selectedText = msg.text || '';
      currentUrl = msg.url || '';
      currentPageTitle = msg.title || '';

      // Update translate input
      if (selectedText && !translateInput.value) {
        translateInput.value = selectedText;
      }

      // Update context box
      if (ctxTitle) ctxTitle.textContent = currentPageTitle || '—';
      if (ctxUrl) ctxUrl.textContent = currentUrl || '—';
      if (ctxContentPreview) {
        if (selectedText) {
          ctxContentPreview.textContent = `"${truncate(selectedText, 100)}"`;
        } else {
          ctxContentPreview.textContent = currentPageContent ? truncate(currentPageContent, 20) : '';
        }
      }

      // Update summarize URL
      if (pageUrlEl) pageUrlEl.textContent = currentUrl || '—';
    }

    // Floating ball: jump to a specific tool tab
    if (msg.type === 'OPEN_TAB_IN_PANEL' && msg.tab) {
      console.log('[ClawSide sidepanel] OPEN_TAB_IN_PANEL received:', msg.tab, msg.url);
      const tab = msg.tab; // 'translate' | 'summarize' | 'ask'
      currentUrl = msg.url || currentUrl;
      currentPageTitle = msg.title || currentPageTitle;
      selectedText = msg.text || selectedText;
      if (tab === 'ask' && selectedText && askQuestion) askQuestion.value = selectedText;
      showTab(tab);
    }

    return true;
  });

  // === Event Listeners ===
  tabTranslate.addEventListener('click', () => showTab('translate'));
  tabSummarize.addEventListener('click', () => showTab('summarize'));
  tabAsk.addEventListener('click', () => showTab('ask'));
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));

  // Settings sub-tabs
  $('settingsTabBasic')?.addEventListener('click', () => showSettingsSubTab('basic'));
  $('settingsTabTools')?.addEventListener('click', () => showSettingsSubTab('tools'));

  // Tool prompt reset buttons
  $('resetPromptTranslate')?.addEventListener('click', () => {
    $('promptTranslate').value = DEFAULT_PROMPTS.translate;
    saveToolPrompts();
  });
  $('resetPromptSummarize')?.addEventListener('click', () => {
    $('promptSummarize').value = DEFAULT_PROMPTS.summarize;
    saveToolPrompts();
  });
  $('resetPromptAsk')?.addEventListener('click', () => {
    $('promptAsk').value = DEFAULT_PROMPTS.ask;
    saveToolPrompts();
  });

  // Auto-save tool prompts on input
  $('promptTranslate')?.addEventListener('input', saveToolPrompts);
  $('promptSummarize')?.addEventListener('input', saveToolPrompts);
  $('promptAsk')?.addEventListener('input', saveToolPrompts);

  translateBtn.addEventListener('click', doTranslate);
  summarizeBtn.addEventListener('click', doSummarize);
  askBtn.addEventListener('click', doAsk);

  // Refresh: calls the full updatePageContext to also refresh favicon / url / title / content
  $('ctxRefreshBtn')?.addEventListener('click', () => { updatePageContext(); });

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

  copyTranslateResult.addEventListener('click', () => doCopy(translateStreaming.getRawText(), copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeStreaming.getRawText(), copySummarizeResult));
  copyAskResult.addEventListener('click', () => doCopy(askStreaming.getRawText(), copyAskResult));

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
        translate: $('promptTranslate').value,
        summarize: $('promptSummarize').value,
        ask: $('promptAsk').value
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
    browserLang = window.getBrowserLocale ? window.getBrowserLocale() : 'English';
    const rawLang = navigator.language || navigator.userLanguage || 'en';
    await loadSettings();
    const i18nData = await window.loadI18n();
    const resolvedLang = window.resolveLang(settings.language, browserLang);
    const t = i18nData[resolvedLang] || i18nData.en || {};
    if (browserLangHint) browserLangHint.textContent = `${t.browserLangHint || 'Browser language'}: ${rawLang} → ${browserLang}`;
    await updatePageContext();

    // Listen for radial-menu tab-switch intents stored by the background script.
    // chrome.storage is shared across all extension contexts, so this works reliably
    // without needing to find the side panel tab ID.
    chrome.storage.onChanged.addListener((changes) => {
      if (changes._pendingTab) {
        const tab = changes._pendingTab.newValue;
        if (!tab) return;
        chrome.storage.local.get(['_pendingUrl', '_pendingTitle', '_pendingText'], (stored) => {
          currentUrl = stored._pendingUrl || currentUrl;
          currentPageTitle = stored._pendingTitle || currentPageTitle;
          selectedText = stored._pendingText || selectedText;
          showTab(tab);
          // Clear so the same tab can be requested again
          chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText']);
        });
      }
    });

    // Check for any pending tab that was set before this side panel opened
    chrome.storage.local.get(['_pendingTab'], (stored) => {
      if (stored._pendingTab) {
        chrome.storage.local.get(['_pendingUrl', '_pendingTitle', '_pendingText'], (rest) => {
          currentUrl = rest._pendingUrl || currentUrl;
          currentPageTitle = rest._pendingTitle || currentPageTitle;
          selectedText = rest._pendingText || selectedText;
          showTab(stored._pendingTab);
          chrome.storage.local.remove(['_pendingTab', '_pendingUrl', '_pendingTitle', '_pendingText']);
        });
      } else {
        showTab('translate');
      }
    });

    // Listen for Chrome tab switches to refresh context
    chrome.tabs.onActivated.addListener(async (_activeInfo) => {
      await updatePageContext();
    });

    // Listen for same-tab URL changes (including SPA client-side navigation)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
      if (!changeInfo.url && !changeInfo.title) return;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === tabId) {
        await updatePageContext();
      }
    });

    // SPA router: history.pushState/replaceState doesn't change the URL in a way tabs.onUpdated catches,
    // but webNavigation.onHistoryStateUpdated fires for these. Requires "webNavigation" permission.
    // Safe to call even if permission is not granted — it just won't fire.
    chrome.webNavigation?.onHistoryStateUpdated.addListener(async (navInfo) => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === navInfo.tabId) {
        // Give the page a moment to render the new content after pushState
        setTimeout(async () => { await updatePageContext(); }, 600);
      }
    });
  }

  init();
})();
