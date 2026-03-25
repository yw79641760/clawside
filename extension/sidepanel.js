// ClawSide - Side Panel UI Logic

(function () {
  'use strict';

  // === Config ===
  // Gateway runs on same port (OpenClaw Gateway + this extension can coexist)
  // Extension calls Gateway directly at its port
  // Gateway must have chatCompletions endpoint enabled
  const DEFAULT_GATEWAY_PORT = '18789';
  const AUTH_TOKEN = ''; // Empty = read from settings, or set to gateway token directly

  // === State ===
  let currentTab = 'translate';
  let selectedText = '';
  let currentUrl = '';
  let currentPageTitle = '';
  let history = [];
  let settings = { gatewayPort: DEFAULT_GATEWAY_PORT };

  // === DOM refs ===
  const $ = (id) => document.getElementById(id);

  const tabTranslate = $('tabTranslate');
  const tabSummarize = $('tabSummarize');
  const tabHistory = $('tabHistory');
  const settingsBtn = $('settingsBtn');

  const panelTranslate = $('panelTranslate');
  const panelSummarize = $('panelSummarize');
  const panelHistory = $('panelHistory');
  const panelSettings = $('panelSettings');

  const selectedTextEl = $('selectedText');
  const translateBtn = $('translateBtn');
  const targetLangSelect = $('targetLang');
  const translateResult = $('translateResult');
  const translateResultText = $('translateResultText');
  const copyTranslateResult = $('copyTranslateResult');
  const translateStatus = $('translateStatus');

  const pageUrlEl = $('pageUrl');
  const summarizeBtn = $('summarizeBtn');
  const summarizeResult = $('summarizeResult');
  const summarizeResultText = $('summarizeResultText');
  const copySummarizeResult = $('copySummarizeResult');
  const summarizeStatus = $('summarizeStatus');

  const historyList = $('historyList');
  const historyCount = $('historyCount');
  const historyEmpty = $('historyEmpty');
  const clearHistoryBtn = $('clearHistoryBtn');

  const loadingOverlay = $('loadingOverlay');
  const loadingText = $('loadingText');

  const settingBridgePort = $('settingBridgePort');
  const settingAuthToken = $('settingAuthToken');
  const saveSettingsBtn = $('saveSettingsBtn');
  const settingsStatus = $('settingsStatus');

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
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function showTab(tab) {
    currentTab = tab;
    tabTranslate.classList.toggle('active', tab === 'translate');
    tabSummarize.classList.toggle('active', tab === 'summarize');
    tabHistory.classList.toggle('active', tab === 'history');

    panelTranslate.classList.toggle('hidden', tab !== 'translate');
    panelSummarize.classList.toggle('hidden', tab !== 'summarize');
    panelHistory.classList.toggle('hidden', tab !== 'history');
    panelSettings.classList.toggle('hidden', tab !== 'settings');

    if (tab === 'history') renderHistory();
  }

  // === Settings ===
  async function loadSettings() {
    const result = await chrome.storage.local.get(['clawside_settings']);
    settings = result.clawside_settings || { gatewayPort: DEFAULT_GATEWAY_PORT, authToken: '' };
    settingBridgePort.value = settings.gatewayPort || DEFAULT_GATEWAY_PORT;
    settingAuthToken && (settingAuthToken.value = settings.authToken || '');
  }

  async function saveSettings() {
    settings.gatewayPort = settingBridgePort.value.trim() || DEFAULT_GATEWAY_PORT;
    settings.authToken = settingAuthToken ? settingAuthToken.value.trim() : '';
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

  // === API calls - direct to Gateway HTTP endpoint ===
  async function apiTranslate(text, targetLang) {
    const base = getApiBase();
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (settings.authToken || '')
      },
      body: JSON.stringify({
        model: 'main',
        messages: [{
          role: 'user',
          content: `You are a professional translator. Translate the following text to ${targetLang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: ${text}`
        }],
        max_tokens: 1024
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const result = data.choices?.[0]?.message?.content?.trim();
    return { result };
  }

  async function apiSummarize(url) {
    const base = getApiBase();
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (settings.authToken || '')
      },
      body: JSON.stringify({
        model: 'main',
        messages: [{
          role: 'user',
          content: `You are a page summarizer. Summarize the content at the following URL in 3-5 clear sentences. Focus on the main points and key information. Only output the summary, nothing else.\n\nURL: ${url}`
        }],
        max_tokens: 1024
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim();
    return { summary };
  }

  // === Actions ===
  async function doTranslate() {
    if (!selectedText.trim()) {
      showStatus(translateStatus, 'Please select some text first');
      return;
    }
    const targetLang = targetLangSelect.value;
    translateResult.classList.add('hidden');
    translateBtn.disabled = true;
    showLoading('Translating...');
    try {
      const data = await apiTranslate(selectedText, targetLang);
      translateResultText.textContent = data.result;
      translateResult.classList.remove('hidden');
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'translate',
        original: selectedText, result: data.result, lang: targetLang,
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
      showStatus(summarizeStatus, 'Cannot detect current page URL');
      return;
    }
    summarizeResult.classList.add('hidden');
    summarizeBtn.disabled = true;
    showLoading('Summarizing...');
    try {
      const data = await apiSummarize(currentUrl);
      summarizeResultText.textContent = data.summary;
      summarizeResult.classList.remove('hidden');
      await addHistoryItem({
        id: crypto.randomUUID(), type: 'summarize',
        url: currentUrl, title: currentPageTitle,
        summary: data.summary, timestamp: Date.now()
      });
    } catch (err) {
      showStatus(summarizeStatus, err.message);
    } finally {
      hideLoading();
      summarizeBtn.disabled = false;
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

  function renderHistory() {
    loadHistory().then((items) => {
      historyCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
      historyEmpty.classList.toggle('hidden', items.length > 0);
      historyList.innerHTML = '';
      clearHistoryBtn.classList.toggle('hidden', items.length === 0);

      items.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'history-item';
        const icon = item.type === 'translate' ? '🌐' : '📄';
        const typeLabel = item.type === 'translate' ? 'Translate' : 'Summarize';

        el.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-icon">${icon}</span>
            <span class="history-item-type">${typeLabel}</span>
            <span class="history-item-time">${formatTime(item.timestamp)}</span>
          </div>
          <div class="history-item-preview">
            ${item.type === 'translate'
              ? `<em>"${truncate(item.original, 60)}"</em> → ${item.result}`
              : truncate(item.summary || item.url, 80)}
          </div>
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
              ${item.lang ? `<div class="history-item-detail-row"><span class="history-item-detail-label">Lang:</span><span class="history-item-detail-value">${item.lang}</span></div>` : ''}
            ` : `
              <div class="history-item-detail-row">
                <span class="history-item-detail-label">Summary:</span>
                <span class="history-item-detail-value">${escapeHtml(item.summary)}</span>
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

  // === Helpers ===
  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/\n/g,'<br>');
  }

  // === Message from content script ===
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'text_selected') {
      selectedText = msg.text || '';
      currentUrl = msg.url || '';
      currentPageTitle = msg.title || '';
      if (selectedText) {
        selectedTextEl.textContent = selectedText;
        selectedTextEl.classList.remove('empty');
        translateBtn.disabled = false;
      } else {
        selectedTextEl.textContent = 'Select text on any page and click Translate';
        selectedTextEl.classList.add('empty');
        translateBtn.disabled = true;
      }
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
  tabHistory.addEventListener('click', () => showTab('history'));
  settingsBtn.addEventListener('click', () => showTab('settings'));
  translateBtn.addEventListener('click', doTranslate);
  summarizeBtn.addEventListener('click', doSummarize);
  copyTranslateResult.addEventListener('click', () => doCopy(translateResultText.textContent, copyTranslateResult));
  copySummarizeResult.addEventListener('click', () => doCopy(summarizeResultText.textContent, copySummarizeResult));
  clearHistoryBtn.addEventListener('click', doClearHistory);
  saveSettingsBtn.addEventListener('click', saveSettings);

  // === Init ===
  async function init() {
    await loadSettings();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentUrl = tab.url || '';
        currentPageTitle = tab.title || '';
        pageUrlEl.textContent = currentUrl || 'Unknown page';
        chrome.tabs.sendMessage(tab.id, { type: 'get_selection' }).catch(() => {});
      }
    } catch (err) {}
    showTab('translate');
  }

  init();
})();
