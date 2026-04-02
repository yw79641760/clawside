// ClawSide - Page Parser & Translation Injector
// Handles DOM parsing, paragraph extraction, and translation injection.

(function() {
  'use strict';

  // Cache for parsed paragraphs (for lookups during translation)
  var cachedParagraphs = [];

  // Target tags for translation
  const TARGET_PARAGRAPH_TAG = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';

  // Parse page paragraphs from DOM
  // Returns array of {idx, tag, text, element}
  function parseParagraph() {
    // Step 1: 在原文档上打标（在克隆之前！）
    var originalEls = document.querySelectorAll(TARGET_PARAGRAPH_TAG);

    var candidateEls = {};
    var result = [];
    originalEls.forEach(function(el, idx) {
      var text = el.textContent.trim();
      if (text.length > 0) {
        el.setAttribute('data-cs-idx', idx); // ← 先打标，原文档和克隆都会有
        candidateEls[idx] = {
          idx: idx,
          tag: el.tagName.toLowerCase(),
          text: text,
          element: el
        };
      }
    });

    // Step 2: 克隆并解析（不影响原文档）
    var docClone = document.cloneNode(true);
    var reader = new Readability(docClone, { serializer: function(el) { return el; } });
    var article = reader.parse();

    if (!article || !article.content) {
      // candidateEls values for backup
      return Object.values(candidateEls);
    }

    // Step 3: 克隆上读取 data-cs-idx，与 result 合并
    var clonedEls = article.content.querySelectorAll(TARGET_PARAGRAPH_TAG);

    clonedEls.forEach(function(el) {
      var idx = el.getAttribute('data-cs-idx');
      idx = parseInt(idx);
      var candidate = candidateEls[idx];
      if (idx !== null && candidate) {
        result.push(candidate);
      }
    });

    cachedParagraphs = result;
    console.log('[Page] parseParagraph result:', result);
    return result;
  }

  // Check if page has been translated (either showing or hidden)
  function isPageTranslated() {
    return document.body.classList.contains('cs-page-translated')
        || document.body.classList.contains('cs-page-hidden');
  }

  // Insert translation elements into page
  // translations: {idx: {text, tag}, ...}
  function showTranslation(translations) {
    // 先清空之前 hidden 的翻译元素
    document.querySelectorAll('.cs-translation.hidden').forEach(function(el) {
      el.remove();
    });
    // 移除 hidden class
    document.body.classList.remove('cs-page-hidden');
    document.body.classList.add('cs-page-translated');

    Object.keys(translations).forEach(function(idx) {
      idx = parseInt(idx);
      var para = cachedParagraphs[idx];
      if (!para) {
        console.log('[Page] showTranslation SKIPPED: idx=', idx, 'no paragraph data');
        return;
      }

      var transData = translations[idx];
      if (!transData) {
        console.log('[Page] showTranslation SKIPPED: idx=', idx, 'no translation');
        return;
      }

      var originalEl = para.element;
      if (!originalEl) {
        console.log('[Page] showTranslation SKIPPED: idx=', idx, 'element not found');
        return;
      }

      console.log('[Page] showTranslation: idx=', idx, 'tag=', transData.tag, 'text=', transData.text);
      var text = transData.text;
      var transTag = transData.tag || 'p';
      var transEl;

      if (transTag === 'li') {
        // List item: inline display via span
        transEl = document.createElement('span');
        transEl.className = 'cs-translation';
        transEl.textContent = ' → ' + text;
        originalEl.appendChild(transEl);
      } else {
        // Block elements: insert after original
        transEl = document.createElement(transTag);
        transEl.className = 'cs-translation';
        transEl.textContent = text;
        var nextSibling = originalEl.nextSibling;
        if (nextSibling) {
          originalEl.parentNode.insertBefore(transEl, nextSibling);
        } else {
          originalEl.parentNode.appendChild(transEl);
        }
      }
    });
  }

  // Remove all translation elements from page
  function hideTranslation() {
    // 用 hidden class 替代 remove，提高再次显示时的性能
    document.querySelectorAll('.cs-translation').forEach(function(el) {
      el.classList.add('hidden');
    });
    // data-cs-idx 不需要清理，parseParagraph 会重新设置
    // cs-page-translated 改为 cs-page-hidden
    document.body.classList.remove('cs-page-translated');
    document.body.classList.add('cs-page-hidden');
  }

  // Parse LLM response and extract translations
  // Returns {idx: {text, tag}, ...}
  function parseTranslationResponse(fullText) {
    var translations = {};
    // 使用更宽松的正则，匹配任意 idx 属性标签，支持 h2/h3/p 等标签
    var matches = fullText.match(/<([a-z0-9]+)[^>]*idx="(\d+)"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/gi);
    if (matches) {
      // 记录所有匹配到的标签索引
      var matchedIndices = [];
      matches.forEach(function(match) {
        var idxMatch = match.match(/idx="(\d+)"/);
        if (idxMatch) matchedIndices.push(idxMatch[1]);
      });
      console.log('[Page] matched indices:', matchedIndices.join(','));

      matches.forEach(function(match) {
        var idxMatch = match.match(/idx="(\d+)"/);
        var tagMatch = match.match(/tag="([a-z0-9]+)"/i);
        // 获取标签名 - 优先用 tag 属性，否则用外层标签
        var tagName = tagMatch ? tagMatch[1] : (idxMatch ? 'p' : null);
        if (!tagName) return;

        // 提取标签内的文本内容：使用更精确的方式
        var openTagStart = match.indexOf('<');
        var openTagEnd = match.indexOf('>');
        var closeTagStart = match.lastIndexOf('<');

        if (openTagStart >= 0 && openTagEnd > 0 && closeTagStart > openTagEnd) {
          var textMatch = match.substring(openTagEnd + 1, closeTagStart);
          // 清理可能残留的 HTML 标签（如 LLM 输出格式错误时的 </p> 等）
          textMatch = textMatch.replace(/<\/?[a-z][^>]*>/gi, '').trim();
          // 解码 HTML 实体
          textMatch = textMatch.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

          if (idxMatch && textMatch) {
            translations[idxMatch[1]] = {
              text: textMatch,
              tag: tagName
            };
          }
        }
      });
    }
    console.log('[Page] parseTranslationResponse result keys:', Object.keys(translations));
    return translations;
  }

  // Build translation prompt
  function buildTranslationPrompt(paragraphs, targetLang, settings) {
    var contentText = paragraphs.map(function(p) {
      return '[paragraph ' + p.idx + ' (tag:' + p.tag + ')] ' + p.text;
    }).join('\n\n');

    // Get default/globalTranslate prompt from settings
    var promptTemplate = settings?.toolPrompts?.globalTranslate
      || window.csSettings.DEFAULT_PROMPTS.globalTranslate;

    var template = promptTemplate || 'Translate the following paragraphs to {lang}:\n\n{paragraphs}\n\nOutput format: <p idx="0" tag="p">translation</p>';
    return template
      .replace(/{lang}/g, targetLang)
      .replace(/{paragraphs}/g, contentText);
  }

  // Public API
  window.csPageParser = {
    parseParagraph: parseParagraph,
    isPageTranslated: isPageTranslated,
    showTranslation: showTranslation,
    hideTranslation: hideTranslation,
    parseTranslationResponse: parseTranslationResponse,
    buildTranslationPrompt: buildTranslationPrompt
  };

})();