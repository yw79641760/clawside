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
  // user prompt 中可以用 {变量名} 占位，会在调用时通过 applyPromptVariables 替换
  // system prompt 中的 {变量名} 同理会替换

  const DEFAULT_PROMPTS = {
    translate: {
      system: 'You are ClawSide Translate, a professional AI translator.\n' +
        '- Translate web content accurately, preserving the original tone and style\n' +
        '- Keep code snippets, URLs, and technical terms in their original form\n' +
        '- Short text (<20 chars): translate directly without notes\n' +
        '- Empty or garbled text: output "—"\n' +
        '- Output only the translation, nothing else',
      user: 'Translate the following text to {lang}.\n' +
        '- Preserve tone (formal/informal) from the original\n' +
        '- Keep code snippets, URLs, and technical terms unchanged\n' +
        '- Short phrases (<20 chars): translate directly without parenthetical notes\n' +
        '- If text is empty or meaningless, output "—"\n\n' +
        'Text: {text}'
    },

    summarize: {
      system: 'You are ClawSide\'s page summarizer, a concise AI that extracts key information from web pages.\n' +
        '- Output only what is present in the content; do not invent or infer missing details\n' +
        '- If content is empty or inaccessible, say "Unable to summarize — page content not available."',
      user: 'Summarize the page in {lang} using this structure:\n' +
        '- **Overview**: 1-2 sentences (omit if page has no meaningful content)\n' +
        '- **Key Points**: 2-6 bullet points (adjust based on content richness)\n' +
        '- **Highlights**: notable facts, figures, or quotes if any exist\n\n' +
        'Keep the total summary under 300 words. Do not repeat information across sections.\n' +
        'Output Markdown only.\n\n' +
        'Page title: {title}\n' +
        'Page URL: {url}\n\n' +
        'Content:\n' +
        '{content}'
    },

    ask: {
      system: 'You are ClawSide\'s webpage Q&A assistant.\n' +
        '- Answer based ONLY on the provided context; do not fabricate information\n' +
        '- If the answer cannot be found in context, say so explicitly\n' +
        '- Respond in Markdown; keep it concise (3-6 bullet points or short paragraphs)',
      user: 'Answer the user\'s question based on the provided page context.\n\n' +
        'Page title: {title}\n' +
        'Page URL: {url}\n\n' +
        'Selected text: {selectedText}\n\n' +
        'Page content:\n' +
        '{content}\n\n' +
        'User question: {question}\n\n' +
        'Guidelines:\n' +
        '- Answer in {lang} using Markdown\n' +
        '- Keep to 3-6 bullet points or short paragraphs\n' +
        '- If the answer isn\'t in the context, say "Not found in page content" and explain what\'s missing\n' +
        '- If the question is vague, ask one clarifying question first'
    },

    globalTranslate: {
      system: 'You are ClawSide Translate, a professional AI translator.\n' +
        '- Translate web content accurately, preserving the original tone and style\n' +
        '- Keep code snippets, URLs, and technical terms in their original form',
      user: 'Translate the following paragraphs to {lang}, following these rules:\n' +
        '1. Keep proper nouns (names of people, places, organizations, brands, products) in original language\n' +
        '2. Technical terms with established translations may be translated; keep artificial terms, proper nouns, and technical codes unchanged\n' +
        '3. Short phrases or single words (<20 chars): translate directly without parenthetical notes\n' +
        '4. Choose the most appropriate meaning for polysemous words based on context\n\n' +
        '{paragraphs}\n\n' +
        'Output format: Use tag Y from X(tag:Y) as the outer tag. Example:\n' +
        '<h2 idx="0" tag="h2">translation</h2><h3 idx="1" tag="h3">translation</h3>'
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
