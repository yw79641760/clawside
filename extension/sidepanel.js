// ClawSide - Side Panel UI Logic

(function () {
  'use strict';

  // === Config ===
  const DEFAULT_GATEWAY_PORT = '18789';

  // === State ===
  let currentTab = 'translate';
  let selectedText = '';
  let currentUrl = '';
  let currentPageTitle = '';
  let history = [];
  let settings = { gatewayPort: DEFAULT_GATEWAY_PORT, authToken: '' };

  // === DOM refs ===
  const $ = (id) => document.getElementById(id);

  const tabTranslate = $('tabTranslate');
  const tabSummarize = $('tabSummarize');
  const tabAsk = $('tabAsk');
  const tabHistory = $('tabHistory');
  const settingsBtn = $('settingsBtn');

  const panelTranslate = $('panelTranslate');
  const panelSummarize = $('panelSummarize');
  const panelAsk = $('panelAsk');
  const panelHistory = $('panelHistory');
  const panelSettings = $('panelSettings');

  // Translate panel
  const selectedTextEl = $('selectedText');
  const translateBtn = $('translateBtn');
  const targetLangSelect = $('targetLang');
  const translateResult = $('translateResult');
  const translateResultText = $('translateResultText');
  const copyTranslateResult = $('copyTranslateResult');
  const translateStatus = $('translateStatus');

  // Summarize panel
  const pageUrlEl = $('pageUrl');
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  // Ask panel
  const askSelectionCard = $('askSelectionCard');
  const askSelectedText = $('askSelectedText');
  const askQuestion = $('askQuestion');
  const askBtn = $('askBtn');
  const askResult = $('askResult');
  const askResultText = $('askResultText');
  const copyAskResult = $('copyAskResult');
  const askStatus = $('askStatus');

  // History panel
  const historyList = $('historyList');
  const historyCount = $('historyCount');
  const historyEmpty = $('historyEmpty');
  const clearHistoryBtn = $('clearHistoryBtn');

  // Settings
  const settingBridgePort = $('settingBridgePort');
  const settingAuthToken = $('settingAuthToken');
  const saveSettingsBtn = $('saveSettingsBtn');
  const settingsStatus = $('settingsStatus');

  // Loading
  const loadingOverlay = $('loadingOverlay');
  const loadingText = $('loadingText');

  // === Utility ===
  function showLoading(text = 'Processing...') {
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
    setTimeout(() => el.classList.add('hidden'), 6000);
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
    if (tab === 'ask') askQuestion.focus();
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || {
      gatewayPort: DEFAULT_GATEWAY_PORT,
      authToken: ''
    };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_GATEWAY_PORT;
    settingAuthToken.value = settings.authToken || '';
  }

  async function saveSettings() {
    settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_GATEWAY_PORT;
    settings.authToken = settingAuthToken.value.trim();
    await chrome.storage.local.set({ clawside_settings: settings });
    showStatus(settingsStatus, 'Settings saved!', 'success');
  }

  function getApiBase() {
    return `http://127.0.0.1:${settings.gatewayPort}`;
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

  // === API calls ===
  async function apiCall(prompt) {
    const base = getApiBase();
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.authToken
      },
      body: JSON.stringify({
        model: 'openclaw/main',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  // === Actions ===
  async function doTranslate(autoTrigger = false) {
    if (!selectedText.trim() && !autoTrigger) {
      showStatus(translateStatus, 'Please select some text first');
      return;
    }
    const targetLang = targetLangSelect.value;
    showLoading('Translating...');
    translateResult.classList.add('hidden');

    try {
      const prompt = `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${selectedText}`;
      const result = await apiCall(prompt);

      translateResultText.textContent = result;
      translateResult.classList.remove('hidden');

      await addHistoryItem({
        id: crypto.randomUUID(), type: 'translate',
        original: selectedText, result, lang: targetLang,
        url: currentUrl, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(translateStatus, err.message);
    } finally {
      hideLoading();
    }
  }

  async function doSummarize() {
    if (!currentUrl) {
      showStatus(summarizeStatus, 'Cannot detect current page URL');
      return;
    }
    showLoading('Summarizing...');
    summarizeResult.classList.add('hidden');

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
    }
  }

  async function doAsk(autoTrigger = false) {
    const question = askQuestion.value.trim();
    if (!question && !autoTrigger) {
      showStatus(askStatus, 'Please enter a question');
      return;
    }

    showLoading('Thinking...');
    askResult.classList.add('hidden');

    try {
      let prompt;
      if (selectedText) {
        prompt = `You are a helpful assistant. The user has selected the following text from a webpage:\n\n"${selectedText}"\n\nPage: ${currentUrl}\n\nUser question: ${question || 'Please analyze and explain the selected text.'}`;
      } else {
        prompt = `You are a helpful assistant. The user is viewing this page: ${currentUrl}\n\nUser question: ${question || 'Please provide a summary of this page.'}`;
      }

      const answer = await apiCall(prompt);

      askResultText.textContent = answer;
      askResult.classList.remove('hidden');

      await addHistoryItem({
        id: crypto.randomUUID(), type: 'ask',
        question: question || '(summary request)',
        answer, context: selectedText || currentUrl,
        url: currentUrl, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(askStatus, err.message);
    } finally {
      hideLoading();
    }
  }

  async function doCopy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copy';
      btn.classList.remove('copied');
    }, 1500);
  }

  // === History Rendering ===
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

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
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
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">Original:</span>
                <span class="history-item-detail-value">${escapeHtml(item.original)}</span>
              </div>
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">Result:</span>
                <span class="history-item-detail-value">${escapeHtml(item.result)}</span>
              </div>
            ` : item.type === 'summarize' ? `
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">Summary:</span>
                <span class="history-item-detail-value">${escapeHtml(item.summary)}</span>
              </div>
            ` : `
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">Q:</span>
                <span class="history-item-detail-value">${escapeHtml(item.question)}</span>
              </div>
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">A:</span>
                <span class="history-item-detail-value">${escapeHtml(item.answer)}</span>
              </div>
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

  // === Message from background / content script ===
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'text_selected') {
      selectedText = msg.text || '';
      currentUrl = msg.url || '';
      currentPageTitle = msg.title || '';

      if (selectedText) {
        selectedTextEl.textContent = selectedText;
        selectedTextEl.classList.remove('empty');
        askSelectedText.textContent = selectedText;
        askSelectedText.classList.remove('empty');
      } else {
        selectedTextEl.textContent = 'No text selected - use the Ask tab to query the page';
        selectedTextEl.classList.add('empty');
        askSelectedText.textContent = 'No text selected - using page context only';
        askSelectedText.classList.add('empty');
      }

      pageUrlEl.textContent = currentUrl || 'Unknown page';
    }

    if (msg.type === 'page_info') {
      currentUrl = msg.url || '';
      currentPageTitle = msg.title || '';
      pageUrlEl.textContent = currentUrl || 'Unknown page';
    }
  });

  // === Event listeners ===
  tabTranslate.addEventListener('click', () => showTab('translate'));
  tabSummarize.addEventListener('click', () => showTab('summarize'));
  tabAsk.addEventListener('click', () => showTab('ask'));
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));

  translateBtn.addEventListener('click', () => doTranslate());
  summarizeBtn.addEventListener('click', () => doSummarize());
  askBtn.addEventListener('click', () => doAsk());

  copyTranslateResult.addEventListener('click', () => doCopy(translateResultText.textContent, copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeResultText.textContent, copySummarizeResult));
  copyAskResult.addEventListener('click', () => doCopy(askResultText.textContent, copyAskResult));

  clearHistoryBtn.addEventListener('click', doClearHistory);
  saveSettingsBtn.addEventListener('click', saveSettings);

  // Ctrl+Enter to submit in Ask panel
  askQuestion.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doAsk();
    }
  });

  // === Init ===
  async function init() {
    await loadSettings();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentUrl = tab.url || '';
        currentPageTitle = tab.title || '';
        pageUrlEl.textContent = currentUrl || 'Unknown page';
        // Get selected text from content script
        chrome.tabs.sendMessage(tab.id, { type: 'get_selection' }).catch(() => {});
      }
    } catch (err) {}

    showTab('translate');
  }

  init();
})();
