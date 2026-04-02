// ClawSide - Page Parser & Translation Injector
// Handles DOM parsing, paragraph extraction, and translation injection.

(function() {
  'use strict';

  // Cache for parsed paragraphs (for lookups during translation)
  var cachedParagraphs = new Map();

  // Target tags for translation
  const TARGET_PARAGRAPH_TAG = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, [data-as="p"], [data-as="h1"], [data-as="h2"], [data-as="h3"], [data-as="h4"], [data-as="h5"], [data-as="h6"], [data-as="li"], [data-as="blockquote"]';

  // Parse page paragraphs from DOM
  // Returns array of {idx, tag, text, element}
  function parseParagraph() {
    // Step 1: 在原文档上打标（在克隆之前！）
    var originalEls = document.querySelectorAll(TARGET_PARAGRAPH_TAG);

    var candidateEls = new Map();
    var result = [];
    originalEls.forEach(function(el, idx) {
      var text = el.textContent.trim();
      if (text.length > 0) {
        el.setAttribute('data-cs-idx', idx); // ← 先打标，原文档和克隆都会有
        // 获取语义标签类型：优先使用 data-as 属性，否则使用原始标签名
        var semanticTag = el.getAttribute('data-as') || el.tagName.toLowerCase();
        candidateEls.set(idx, {
          idx: idx,
          tag: semanticTag,
          text: text,
          element: el,
          isSemantic: !!el.getAttribute('data-as') // 标记是否为语义等价标签
        });
      }
    });

    // Step 2: 克隆并解析（不影响原文档）
    var docClone = document.cloneNode(true);
    var reader = new Readability(docClone, { serializer: function(el) { return el; } });
    var article = reader.parse();

    if (!article || !article.content) {
      // candidateEls for backup
      cachedParagraphs = candidateEls;
      return [...cachedParagraphs.values()];
    }

    // Step 3: 克隆上读取 data-cs-idx，与 result 合并
    var clonedEls = article.content.querySelectorAll(TARGET_PARAGRAPH_TAG);

    clonedEls.forEach(function(el) {
      var idx = el.getAttribute('data-cs-idx');
      idx = parseInt(idx);
      var candidate = candidateEls.get(idx);
      if (idx !== null && candidate) {
        result.push(candidate);
      }
    });

    cachedParagraphs = new Map(result.map((el) => [el.idx, el]))
    return result;
  }

  // Check if page has been translated (either showing or hidden)
  function isPageTranslated() {
    return document.body.classList.contains('cs-page-translated')
        || document.body.classList.contains('cs-page-hidden');
  }

  // Show loading placeholder after a paragraph
  function showLoadingPlaceholder(idx) {
    var para = cachedParagraphs.get(idx);
    if (!para || !para.element) return;

    // Clear any existing placeholder first
    clearPlaceholder(para.element, idx);

    var placeholder = document.createElement('span');
    placeholder.className = 'cs-translation cs-loading';
    placeholder.dataset.idx = idx;
    var iconHtml = window.svgIcon('loading');
    placeholder.innerHTML = iconHtml || '...';
    insertPlaceholder(para.element, placeholder);
  }

  // Show error placeholder after a paragraph (for timeout)
  function showErrorPlaceholder(idx) {
    var para = cachedParagraphs.get(idx);
    if (!para || !para.element) return;

    // Clear any existing placeholder first
    clearPlaceholder(para.element, idx);

    var placeholder = document.createElement('span');
    placeholder.className = 'cs-translation cs-error';
    placeholder.dataset.idx = idx;
    placeholder.innerHTML = window.svgIcon('error') || '!';
    placeholder.title = 'Translation timeout';
    insertPlaceholder(para.element, placeholder);
  }

  // Clear placeholder elements for a paragraph
  function clearPlaceholder(element, idx) {
    var selectors = [
      '.cs-translation.cs-loading[data-idx="' + idx + '"]',
      '.cs-translation.cs-error[data-idx="' + idx + '"]'
    ];
    selectors.forEach(function(sel) {
      element.parentNode.querySelectorAll(sel).forEach(function(el) { el.remove(); });
    });
  }

  // Insert placeholder after element (handle semantic vs block elements)
  function insertPlaceholder(originalEl, placeholder) {
    var parent = originalEl.parentNode;
    if (!parent) return;

    // For semantic elements (data-as), append inside
    var para = [...cachedParagraphs.values()].find(function(p) { return p.element === originalEl; });
    if (para && para.isSemantic) {
      originalEl.appendChild(placeholder);
      return;
    }

    // For block elements, insert after
    var nextSibling = originalEl.nextSibling;
    if (nextSibling) {
      parent.insertBefore(placeholder, nextSibling);
    } else {
      parent.appendChild(placeholder);
    }
  }

  // Inject page theme CSS variables for translation text color
  function injectPageTheme() {
    if (!window.PAGE_THEMES) return;
    var pageTheme = window.detectPageTheme ? window.detectPageTheme() : 'light';
    var vars = window.PAGE_THEMES[pageTheme] || window.PAGE_THEMES.light;
    var existing = document.getElementById('cs-page-theme');
    if (existing) existing.remove();
    var s = document.createElement('style');
    s.id = 'cs-page-theme';
    var css = '.cs-translation {';
    for (var k in vars) {
      css += k + ':' + vars[k] + ' !important;';
    }
    css += '}';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Insert translation elements into page
  // translations: {idx: {text, tag}, ...}
  function showTranslation(translations) {
    // 清空之前 hidden 的翻译元素，但保留 loading placeholder（用于复用）
    document.querySelectorAll('.cs-translation.hidden').forEach(function(el) {
      if (!el.classList.contains('cs-loading')) {
        el.remove();
      }
    });

    // 移除 hidden class
    document.body.classList.remove('cs-page-hidden');
    document.body.classList.add('cs-page-translated');

    // 注入页面theme，确保翻译文字颜色适配页面
    injectPageTheme();

    Object.keys(translations).forEach(function(idx) {
      idx = parseInt(idx);
      var para = cachedParagraphs.get(idx);
      if (!para) return;

      var transData = translations[idx];
      if (!transData) return;

      var originalEl = para.element;
      if (!originalEl) return;

      var text = transData.text;
      var transTag = transData.tag || 'p';
      var transEl;

      // 优先查找已有的 loading placeholder，修改其内容而不是创建新元素
      var existingPlaceholder = document.querySelector('.cs-translation.cs-loading[data-idx="' + idx + '"]');
      if (existingPlaceholder) {
        // 复用 placeholder，将其转换为翻译内容
        existingPlaceholder.classList.remove('cs-loading');
        existingPlaceholder.innerHTML = ''; // 清除 loading icon
        existingPlaceholder.textContent = text;
        return;
      }

      // 检查是否已有翻译元素存在（避免重复插入）
      var existingTranslation = originalEl.querySelector('.cs-translation');
      if (existingTranslation) {
        // 已存在翻译，跳过
        return;
      }

      // 检查同级的下一个兄弟节点是否是翻译元素
      var nextEl = originalEl.nextSibling;
      if (nextEl && nextEl.classList && nextEl.classList.contains('cs-translation')) {
        // 已存在翻译（作为下一个兄弟节点），跳过
        return;
      }

      // 如果没有 placeholder 和翻译，则创建新的翻译元素
      // 如果原始元素有 data-as 属性（语义等价标签），将翻译插入到元素内部
      if (para.isSemantic) {
        transEl = document.createElement('span');
        transEl.className = 'cs-translation';
        transEl.textContent = text;
        originalEl.appendChild(transEl);
      } else if (transTag === 'li') {
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
    return translations;
  }

  // Build translation prompt
  function buildTranslationPrompt(paragraphs, targetLang, settings) {
    var contentText = paragraphs.map(function(p) {
      return '[' + p.idx + '(tag:' + p.tag + ')] ' + p.text;
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
    buildTranslationPrompt: buildTranslationPrompt,
    showLoadingPlaceholder: showLoadingPlaceholder,
    showErrorPlaceholder: showErrorPlaceholder
  };

})();