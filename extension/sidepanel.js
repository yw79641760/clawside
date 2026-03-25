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
  let settings = { gatewayPort: DEFAULT_PORT, authToken: '' };

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
    if (tab === 'settings') { updateTokenStatus(); checkGatewayStatus(); }
    if (tab === 'ask') askQuestion.focus();
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || { gatewayPort: DEFAULT_PORT, authToken: '' };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_PORT;
    settingAuthToken.value = settings.authToken || '';
    updateTokenStatus();
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
    try {
      const port = settingBridgePort.value?.trim() || DEFAULT_PORT;
      const token = settingAuthToken.value?.trim() || '';
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        gatewayStatusEl.textContent = '✓ Gateway reachable';
        gatewayStatusEl.style.color = 'var(--success)';
      } else {
        gatewayStatusEl.textContent = `✗ HTTP ${res.status}`;
        gatewayStatusEl.style.color = 'var(--error)';
      }
    } catch (err) {
      gatewayStatusEl.textContent = '✗ Cannot reach gateway';
      gatewayStatusEl.style.color = 'var(--error)';
    }
  }

  async function saveSettings() {
    settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_PORT;
    settings.authToken = settingAuthToken.value.trim();
    await chrome.storage.local.set({ clawside_settings: settings });
    updateTokenStatus();
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

  // === API via background script ===
  function apiCall(prompt) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const pendingKey = requestId;

      chrome.runtime.sendMessage({
        type: 'clawside-api',
        prompt,
        port: settings.gatewayPort || DEFAULT_PORT,
        token: settings.authToken || '',
        requestId
      });

      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(handler);
        reject(new Error('Request timeout'));
      }, 60000);

      const handler = (msg) => {
        if (msg.type === 'clawside-api-result' && msg.requestId === requestId) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(handler);
          resolve(msg.result);
        }
        if (msg.type === 'clawside-api-error' && msg.requestId === requestId) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(handler);
          reject(new Error(msg.error));
        }
      };
      chrome.runtime.onMessage.addListener(handler);
    });
  }

  // === Actions ===
  async function doTranslate() {
    const text = translateInput.value.trim();
    if (!text) {
      showStatus(translateStatus, 'Please enter or select text to translate');
      return;
    }
    translateResult.classList.add('hidden');
    translateBtn.disabled = true;
    showLoading('Translating...');
    try {
      const targetLang = targetLangSelect.value;
      const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`;
      const result = await apiCall(prompt);
      translateResultText.textContent = result;
      translateResult.classList.remove('hidden');
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
    summarizeBtn.disabled = true;
    showLoading('Summarizing...');
    try {
      const prompt = `You are a page summarizer. Summarize the content at the following URL in 3-5 clear sentences. Focus on the main points and key information. Only output the summary, nothing else.\n\nURL: ${currentUrl}`;
      const summary = await apiCall(prompt);
      summarizeResultText.textContent = summary;
      summarizeResult.classList.remove('hidden');
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
    askBtn.disabled = true;
    showLoading('Thinking...');
    try {
      let prompt;
      if (selectedText) {
        prompt = `You are a helpful assistant. The user selected this text from a webpage:\n\n"${selectedText}"\n\nPage: ${currentUrl}\n\nUser question: ${question}`;
      } else {
        prompt = `You are a helpful assistant. The user is viewing this page: ${currentUrl}\n\nUser question: ${question}`;
      }
      const answer = await apiCall(prompt);
      askResultText.textContent = answer;
      askResult.classList.remove('hidden');
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
  testConnBtn.addEventListener('click', checkGatewayStatus);
  saveSettingsBtn.addEventListener('click', saveSettings);

  // === Init ===
  async function init() {
    await loadSettings();
    await updateCurrentTab();
    showTab('translate');
  }

  init();
})();
