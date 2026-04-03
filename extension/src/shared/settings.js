// ClawSide - Settings Module
// Shared settings configuration and helper functions.
// Used by sidepanel.js, dock.js, and other components.

(function() {
  'use strict';

  // === Constants ===
  const DEFAULT_PORT = '18789';
  const DEFAULT_LANGUAGE = 'auto';
  const DEFAULT_APPEARANCE = 'system';
  const DEFAULT_MAX_TAB_CONTEXTS = 50;
  const DEFAULT_MAX_LRU_SIZE = 10;

  // === Default Tool Prompts ===
  const DEFAULT_PROMPTS = {
    translate: {
      system: 'You are a professional translator.',
      user: 'Translate the following text to {lang}. Only output the translated text, nothing else. Be accurate and natural.\n\nText: {text}'
    },
    summarize: {
      system: 'You are a helpful assistant that summarizes web page content.',
      user: 'Summarize the following page in {lang}. Use this structure:\n- **Overview**: 1-2 sentences, what this page is about\n- **Key Points**: bullet points, the most important information (let content decide the count, typically 2-6)\n- **Highlights**: standout facts, data, or quotes worth noting\n\nOutput Markdown only. Be concise and let the content determine the depth of each section.\n\nPage title: {title}\nPage URL: {url}\n\nContent:\n{content}'
    },
    ask: {
      system: 'You are ClawSide\'s Ask assistant, helping the user with questions about the current webpage.',
      user: 'Use the provided context to answer.\n\nPrefer {hasSelection}the user-selected text{/hasSelection}{hasContent}the page content excerpt{/hasContent}.\n\nIf the answer is not present in the provided context, say so and explain what is missing.\n\nRespond in {lang} and use Markdown.\n\nKeep it concise: 3-8 bullet points or short paragraphs.\n\nIf the user\'s question is ambiguous, ask 1 clarifying question before answering.\n\n\nPage title: {title}\nPage URL: {url}\n{hasSelection}SelectedText:\n"{selectedText}"\n\n{/hasSelection}{hasContent}PageContent:\n{content}\n\n{/hasContent}User question:\n{question}'
    },
    globalTranslate: {
      system: 'You are a professional translator.',
      user: 'Translate the following paragraphs to {lang}, following these rules:\n1. Keep proper nouns (names of people, places, organizations, brands, products) in original language;\n2. Technical terms with established translations in the target language may be translated; keep artificial terms, proper nouns, and technical codes unchanged;\n3. Choose the most appropriate meaning for polysemous words based on context, add parenthetical notes if needed.\n\n{paragraphs}\n\nOutput format: Use tag Y from X(tag:Y) as the outer tag. Example: <h2 idx="0" tag="h2">translation</h2><h3 idx="1" tag="h3">translation</h3>'
    }
  };

  // === Default Settings ===
  function getDefaultSettings() {
    return {
      gatewayPort: DEFAULT_PORT,
      authToken: '',
      language: DEFAULT_LANGUAGE,
      translateLanguage: DEFAULT_LANGUAGE,
      appearance: DEFAULT_APPEARANCE,
      toolPrompts: {}
    };
  }

  // === Validate Settings ===
  function validateSettings(settings) {
    if (!settings) return getDefaultSettings();

    return {
      gatewayPort: settings.gatewayPort || DEFAULT_PORT,
      authToken: settings.authToken || '',
      language: settings.language || DEFAULT_LANGUAGE,
      translateLanguage: settings.translateLanguage || DEFAULT_LANGUAGE,
      appearance: settings.appearance || DEFAULT_APPEARANCE,
      toolPrompts: settings.toolPrompts || {}
    };
  }

  // === Get Prompt Template ===
  function getPromptTemplate(settings, promptType) {
    var prompts = settings.toolPrompts || {};
    return prompts[promptType] || DEFAULT_PROMPTS[promptType] || null;
  }

  // === Get Prompt Templates (system + user) ===
  function getPromptTemplates(settings, promptType) {
    var prompts = settings.toolPrompts || {};
    var template = prompts[promptType] || DEFAULT_PROMPTS[promptType];
    if (!template) return null;
    // Support both old string format and new object format
    if (typeof template === 'string') {
      return { system: '', user: template };
    }
    return { system: template.system || '', user: template.user || '' };
  }

  // === Get Global Translate Prompt ===
  function getGlobalTranslatePrompt(settings) {
    var prompts = settings.toolPrompts || {};
    var template = prompts.globalTranslate || DEFAULT_PROMPTS.globalTranslate;
    // Support both old string format and new object format
    if (typeof template === 'string') {
      return template;
    }
    return template ? template.user : '';
  }

  // === Apply Prompt Variables ===
  function applyPromptVariables(template, variables) {
    if (!template) return null;
    var result = template;
    Object.keys(variables).forEach(function(key) {
      result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), variables[key]);
    });
    return result;
  }

  // === Public API ===
  window.csSettings = {
    DEFAULT_PORT: DEFAULT_PORT,
    DEFAULT_PROMPTS: DEFAULT_PROMPTS,
    getDefaultSettings: getDefaultSettings,
    validateSettings: validateSettings,
    getPromptTemplate: getPromptTemplate,
    getPromptTemplates: getPromptTemplates,
    getGlobalTranslatePrompt: getGlobalTranslatePrompt,
    applyPromptVariables: applyPromptVariables
  };

})();