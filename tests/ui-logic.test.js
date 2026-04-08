// ClawSide UI and Logic Tests with Puppeteer
// Tests for side panel interactions and functionality

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../extension');

// Find Chrome
function findChrome() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    process.env.CHROME_PATH,
  ];
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('🚀 Starting ClawSide UI & Logic Tests...\n');

  const chromePath = findChrome();
  let browser;
  let passed = 0;
  let failed = 0;

  try {
    if (!chromePath) {
      console.log('⚠️  Chrome not found. Skipping browser tests.\n');
    } else {
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'shell',
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
        ],
      });
      console.log(`📦 Extension loaded\n`);
    }

    for (const { name, fn } of tests) {
      try {
        console.log(`  ▶ ${name}`);
        await fn(browser);
        console.log(`  ✅ PASSED\n`);
        passed++;
      } catch (err) {
        console.log(`  ❌ FAILED: ${err.message}\n`);
        failed++;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  console.log('─'.repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================
// UI Tests - Tab Navigation
// ============================================

test('UI: Tab buttons exist in action bar', async (browser) => {
  if (!browser) { console.log('   (skipped)'); return; }

  const page = await browser.newPage();
  await page.goto('data:text/html,<html></html>');  // Local page instead of external

  // Check if action bar exists by evaluating in page context
  // Note: Extension runs in its own context, so we check the HTML file directly
  const sidepanelPath = path.join(EXTENSION_PATH, 'pages', 'sidepanel.html');
  const content = fs.readFileSync(sidepanelPath, 'utf-8');

  const tabs = ['tabTranslate', 'tabSummarize', 'tabAsk', 'tabHistory', 'settingsBtn'];
  for (const tab of tabs) {
    if (!content.includes(`id="${tab}"`)) {
      throw new Error(`Missing tab: ${tab}`);
    }
  }
  console.log('   All tab buttons found in HTML');
});

test('UI: Panel sections exist', async () => {
  const sidepanelPath = path.join(EXTENSION_PATH, 'pages', 'sidepanel.html');
  const content = fs.readFileSync(sidepanelPath, 'utf-8');

  const panels = ['panelTranslate', 'panelSummarize', 'panelAsk', 'panelHistory', 'panelSettings'];
  for (const panel of panels) {
    if (!content.includes(`id="${panel}"`)) {
      throw new Error(`Missing panel: ${panel}`);
    }
  }
  console.log('   All panels exist');
});

test('UI: Language select has all options', async () => {
  const sidepanelPath = path.join(EXTENSION_PATH, 'pages', 'sidepanel.html');
  const content = fs.readFileSync(sidepanelPath, 'utf-8');

  const languages = ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Portuguese', 'Spanish', 'Russian'];
  for (const lang of languages) {
    if (!content.includes(`value="${lang}"`)) {
      throw new Error(`Missing language option: ${lang}`);
    }
  }
  console.log('   All language options found');
});

test('UI: Settings form has required fields', async () => {
  const sidepanelPath = path.join(EXTENSION_PATH, 'pages', 'sidepanel.html');
  const content = fs.readFileSync(sidepanelPath, 'utf-8');

  const fields = ['settingLanguage', 'settingAppearance', 'settingBridgePort', 'settingAuthToken'];
  for (const field of fields) {
    if (!content.includes(`id="${field}"`)) {
      throw new Error(`Missing setting field: ${field}`);
    }
  }
  console.log('   All settings fields found');
});

// ============================================
// Logic Tests - Extension Features
// ============================================

test('Logic: manifest.json has required configuration', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf-8'));

  // Check sidePanel config
  if (!manifest.side_panel?.default_path) {
    throw new Error('Missing side_panel config');
  }

  // Check permissions
  const required = ['sidePanel', 'storage'];
  for (const p of required) {
    if (!manifest.permissions.includes(p)) {
      throw new Error(`Missing permission: ${p}`);
    }
  }

  // Check host permissions for local gateway
  if (!manifest.host_permissions?.includes('http://127.0.0.1:18789/*')) {
    throw new Error('Missing localhost host permission');
  }

  console.log('   Manifest configuration valid');
});

test('Logic: background.js exists and has message handlers', async () => {
  const bgPath = path.join(EXTENSION_PATH, 'background.js');
  const content = fs.readFileSync(bgPath, 'utf-8');

  // Check for key message handlers
  const handlers = ['onMessage', 'sendMessage', 'openclaw'];
  for (const h of handlers) {
    if (!content.includes(h)) {
      throw new Error(`Missing handler: ${h}`);
    }
  }
  console.log('   Background script has required handlers');
});

test('Logic: openclaw.js API client exists', async () => {
  const apiPath = path.join(EXTENSION_PATH, 'src/tools/openclaw.js');
  if (!fs.existsSync(apiPath)) {
    throw new Error('openclaw.js not found');
  }

  const content = fs.readFileSync(apiPath, 'utf-8');
  const methods = ['apiCall', 'apiStream', 'buildUrl', 'buildHeaders'];
  for (const m of methods) {
    if (!content.includes(m)) {
      throw new Error(`Missing method: ${m}`);
    }
  }
  console.log('   OpenClaw API client complete');
});

test('Logic: settings.js exists and exports required functions', async () => {
  const settingsPath = path.join(EXTENSION_PATH, 'src/shared/settings.js');
  if (!fs.existsSync(settingsPath)) {
    throw new Error('settings.js not found');
  }

  const content = fs.readFileSync(settingsPath, 'utf-8');
  const methods = ['getDefaultSettings', 'validateSettings', 'getPromptTemplate', 'getPromptTemplates'];
  for (const m of methods) {
    if (!content.includes(m)) {
      throw new Error(`Missing method: ${m}`);
    }
  }
  console.log('   Settings module complete');
});

test('Logic: chat-session.js has required methods', async () => {
  const chatPath = path.join(EXTENSION_PATH, 'src/shared/chat-session.js');
  const content = fs.readFileSync(chatPath, 'utf-8');

  const methods = ['addUserMessage', 'addAssistantMessage', 'getMessages', 'save', 'load', 'clear'];
  for (const m of methods) {
    if (!content.includes(m)) {
      throw new Error(`Missing method: ${m}`);
    }
  }
  console.log('   Chat session complete');
});

test('Logic: LRU cache implementation exists', async () => {
  const cachePath = path.join(EXTENSION_PATH, 'src/tools/lru-cache.js');
  const content = fs.readFileSync(cachePath, 'utf-8');

  const features = ['LRU', 'set', 'get', 'delete', 'clear'];
  for (const f of features) {
    if (!content.toLowerCase().includes(f.toLowerCase())) {
      throw new Error(`Missing LRU feature: ${f}`);
    }
  }
  console.log('   LRU cache implementation found');
});

test('Logic: tab-context-manager.js has content extraction', async () => {
  const tcmPath = path.join(EXTENSION_PATH, 'src/shared/tab-context-manager.js');
  const content = fs.readFileSync(tcmPath, 'utf-8');

  const features = ['extractPageContext', 'getCurrent', 'setSelectedText'];
  for (const f of features) {
    if (!content.includes(f)) {
      throw new Error(`Missing feature: ${f}`);
    }
  }
  console.log('   Tab context manager complete');
});

// ============================================
// Integration Tests
// ============================================

test('Integration: All source JS files exist', async () => {
  const srcDir = path.join(EXTENSION_PATH, 'src');
  const required = [
    'components/sidepanel.js',
    'components/popup.js',
    'components/dock.js',
    'shared/chat-session.js',
    'shared/panel-context.js',
    'shared/tab-context-manager.js',
    'shared/settings.js',
    'tools/openclaw.js',
    'tools/lang-utils.js',
    'tools/lru-cache.js',
  ];

  for (const file of required) {
    const filePath = path.join(srcDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing file: ${file}`);
    }
  }
  console.log('   All source files exist');
});

test('Integration: CSS styles exist', async () => {
  const stylesDir = path.join(EXTENSION_PATH, 'styles');
  const files = fs.readdirSync(stylesDir);

  if (!files.some(f => f.endsWith('.css'))) {
    throw new Error('No CSS files found');
  }
  console.log(`   CSS files: ${files.join(', ')}`);
});

// Run tests
runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});