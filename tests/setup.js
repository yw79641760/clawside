// ClawSide Test Setup
// Launches a Chrome browser with the extension loaded

const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../extension');

/**
 * Launch Chrome with the extension loaded
 * @param {Object} options - Puppeteer launch options
 * @returns {Promise<Browser>}
 */
async function launchBrowser(options = {}) {
  const defaultOptions = {
    headless: false,
    devtools: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  };

  const launchOptions = { ...defaultOptions, ...options };
  return puppeteer.launch(launchOptions);
}

/**
 * Get extension ID from background page
 * @param {Browser} browser
 * @returns {Promise<string>}
 */
async function getExtensionId(browser) {
  const targets = await browser.targets();
  const extensionTarget = targets.find(
    (target) => target.type() === 'background_page' && target.url().includes('background.js')
  );

  if (!extensionTarget) {
    throw new Error('Extension background page not found');
  }

  const backgroundPage = await extensionTarget.page();
  if (!backgroundPage) {
    throw new Error('Failed to get background page');
  }

  // Extract extension ID from the URL
  const url = backgroundPage.url();
  const match = url.match(/chrome-extension:\/\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Open side panel for testing
 * @param {Browser} browser
 * @param {string} extensionId
 * @returns {Promise<Page>}
 */
async function openSidePanel(browser, extensionId) {
  // Create a new page to open the side panel
  const page = await browser.newPage();

  // Navigate to a test page
  await page.goto('https://example.com');

  // Open side panel using Chrome API
  await page.evaluate((extId) => {
    chrome.sidePanel.setOptions({ tabId: chrome.tabs.TAB_ID_NONE, path: 'pages/sidepanel.html' }).then(() => {
      chrome.sidePanel.open({ tabId: chrome.tabs.TAB_ID_NONE });
    });
  }, extensionId);

  return page;
}

module.exports = {
  launchBrowser,
  getExtensionId,
  openSidePanel,
  EXTENSION_PATH,
};