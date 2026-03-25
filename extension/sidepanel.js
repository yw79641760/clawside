// ClawSide - Full Side Panel Logic

(function () {
  'use strict';

  const DEFAULT_PORT = '18789';

  // === State ===
  let currentTab = 'translate';
  let selectedText = '';
  let currentUrl = '';
  let currentPageTitle = '';
  let history = [];
  let browserLang = 'English';
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto' };

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
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  // Ask
  const askContextText = $('askContextText');
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
  const clearHistoryBtn = $('clearHistoryBtn');

  // Settings
  const settingBridgePort = $('settingBridgePort');
  const settingAuthToken = $('settingAuthToken');
  const toggleTokenBtn = $('toggleTokenBtn');
  const tokenStatusEl = $('tokenStatus');
  const gatewayStatusEl = $('gatewayStatus');
  const testConnBtn = $('testConnBtn');
  const testConnStatus = $('testConnStatus');
  const saveSettingsBtn = $('saveSettingsBtn');
  const settingsStatus = $('settingsStatus');

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

    if (tab === 'history') renderHistory();
    if (tab === 'settings') { updateTokenStatus(); checkGatewayStatus(); if (browserLangHint) browserLangHint.textContent = `Browser language → ${browserLang}`; }
    if (tab === 'ask') askQuestion.focus();
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || { gatewayPort: DEFAULT_PORT, authToken: '', language: 'auto' };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_PORT;
    settingAuthToken.value = settings.authToken || '';
    settingLanguage.value = settings.language || 'auto';
    updateTokenStatus();
    applyLanguage();
  }

  function applyLanguage() {
    const lang = settings.language === 'auto' ? browserLang : settings.language;
    targetLangSelect.value = lang;
  }

  function updateTokenStatus() {
    if (!settingAuthToken) return;
    const token = settingAuthToken.value?.trim();
    if (!token) {
      tokenStatusEl.textContent = 'No token';
      tokenStatusEl.className = 'token-status empty';
    } else {
      tokenStatusEl.textContent = 'Token set ✓';
      tokenStatusEl.className = 'token-status ok';
    }
  }

  async function checkGatewayStatus() {
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
          port, token, requestId
        });
      });
      gatewayStatusEl.textContent = '✓ Gateway reachable';
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

  async function saveSettings() {
    settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_PORT;
    settings.authToken = settingAuthToken.value.trim();
    settings.language = settingLanguage.value || 'auto';
    await chrome.storage.local.set({ clawside_settings: settings });
    updateTokenStatus();
    applyLanguage();
    showStatus(settingsStatus, 'Settings saved!', 'success');
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
      let targetLang = targetLangSelect.value;
      if (targetLang === 'auto') {
        targetLang = browserLang;
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
      let prompt;
      if (pageContent) {
        prompt = `You are a page summarizer. Summarize the following webpage content in 3-5 clear sentences. Focus on the main points and key information. Only output the summary, nothing else.\n\nPage title: ${currentPageTitle}\nPage URL: ${currentUrl}\n\nContent:\n${pageContent.slice(0, 8000)}`;
      } else {
        prompt = `You are a page summarizer. Summarize the content at the following URL in 3-5 clear sentences in ${lang}. Focus on the main points and key information. Only output the summary, nothing else.\n\nURL: ${currentUrl}`;
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
      let targetLang = settings.language === 'auto' ? browserLang : settings.language;
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
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('copied'); }, 1500);
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

        // Update URL display in summarize and ask panels
        pageUrlEl.textContent = currentUrl || '—';

        if (selectedText) {
          askContextText.textContent = `"${truncate(selectedText, 100)}" from ${truncateUrl(currentUrl)}`;
          askContextText.classList.remove('empty');
        } else if (currentUrl) {
          askContextText.textContent = truncateUrl(currentUrl);
          askContextText.classList.remove('empty');
        } else {
          askContextText.textContent = 'No page context — enter a question below';
          askContextText.classList.add('empty');
        }

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

  function renderHistory() {
    loadHistory().then((items) => {
      historyCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
      historyEmpty.classList.toggle('hidden', items.length > 0);
      historyList.innerHTML = '';
      clearHistoryBtn.classList.toggle('hidden', items.length === 0);

      items.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'history-item';
        const icon = item.type === 'translate' ? '🌐' : item.type === 'summarize' ? '📄' : '💬';
        const typeLabel = item.type === 'translate' ? 'Translate' : item.type === 'summarize' ? 'Summarize' : 'Ask';

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
            <span class="history-item-icon">${icon}</span>
            <span class="history-item-type">${typeLabel}</span>
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
        el.addEventListener('click', () => el.classList.toggle('expanded'));
        historyList.appendChild(el);
      });
    });
  }

  async function doClearHistory() {
    await chrome.storage.local.set({ clawside_memory: [] });
    renderHistory();
  }

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

      // Update ask context
      if (selectedText) {
        askContextText.textContent = `"${truncate(selectedText, 100)}" from ${truncateUrl(currentUrl)}`;
        askContextText.classList.remove('empty');
      } else if (currentUrl) {
        askContextText.textContent = truncateUrl(currentUrl);
        askContextText.classList.remove('empty');
      }

      // Update summarize URL
      pageUrlEl.textContent = currentUrl || '—';
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
  settingLanguage.addEventListener('change', () => {
    settings.language = settingLanguage.value;
    applyLanguage();
  });
  toggleTokenBtn.addEventListener('click', () => {
    const isPassword = settingAuthToken.type === 'password';
    settingAuthToken.type = isPassword ? 'text' : 'password';
    toggleTokenBtn.textContent = isPassword ? '🔒' : '👁';
  });
  testConnBtn.addEventListener('click', checkGatewayStatus);
  saveSettingsBtn.addEventListener('click', saveSettings);

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
    if (browserLangHint) browserLangHint.textContent = `Browser language: ${lang} → ${browserLang}`;

    await loadSettings();
    await updateCurrentTab();
    showTab('translate');
  }

  init();
})();
