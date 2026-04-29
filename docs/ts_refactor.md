# Chrome Extension TypeScript 重构参考

本文档记录将 Chrome Extension 从 JavaScript 迁移到 TypeScript 的主流技术方案和最佳实践。

## 技术方案

### 1. 构建工具选择

| 工具 | 特点 | 适用场景 |
|------|------|---------|
| **Vite** | 快速、插件丰富、HMR支持好 | 现代项目（推荐） |
| **Rollup** | 细粒度控制、Tree-shaking | 需要极致优化 |
| **Webpack** | 生态成熟、配置灵活 | 大型复杂项目 |
| **esbuild** | 极快速度 | 需要快速构建 |

### 2. 模块格式

Chrome Extension MV3 推荐使用 **IIFE** (Immediately Invoked Function Expression) 格式：

```javascript
// 构建输出格式
(function() {
  'use strict';
  // 代码
})();
```

原因：
- content script 在页面上下文运行，需要传统脚本格式
- service worker 无 DOM 访问，IIFE 避免全局污染
- popup/side panel 同样需要非 ESM 格式

### 3. 入口点配置

```typescript
// vite.config.ts
export default defineConfig({
  root: __dirname,  // 或绝对路径
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        popup: resolve(__dirname, 'src/popup.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      }
    }
  }
});
```

### 4. 模块组织策略

#### 方案A：单文件打包（推荐）
所有依赖打包到单个 JS 文件：

```typescript
// sidepanel.ts
import '../shared/settings';
import '../shared/chat-session';
import '../tools/browser';
// ... 其他依赖
```

优点：
- 减少网络请求
- 避免加载顺序问题
- 易于部署

#### 方案B：共享入口
提取公共模块到 shared 入口：

```typescript
// shared.ts - content script 共享代码
import '../tools/lru-cache';
import '../shared/settings';
```

在 manifest.json 中：
```json
{
  "content_scripts": [{
    "js": ["shared.js", "content.js"]
  }]
}
```

### 5. Chrome API 类型定义

安装 `@types/chrome` 提供完整类型：

```bash
npm install -D @types/chrome
```

```typescript
// src/global.d.ts
/// <reference types="chrome" />

interface Window {
  // App modules
  csSettings: any;
  panelContext: any;
  tabContextManager: any;
  chatSessionManager: any;
}
```

### 6. HTML 脚本路径处理

HTML 中的脚本路径在构建后需要重写为绝对路径：

```typescript
// 自定义 Vite 插件
function rewriteHtmlPlugin() {
  return {
    name: 'rewrite-html',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist/pages/sidepanel.html');
      let html = readFileSync(htmlPath, 'utf-8');
      html = html
        .replace(/src="\.\.\/lib\/marked\.js"/g, 'src="/lib/marked.js"')
        .replace(/src="\.\.\/sidepanel\.js"/g, 'src="/sidepanel.js"');
      writeFileSync(htmlPath, html);
    }
  };
}
```

### 7. 静态资源复制

使用 `vite-plugin-static-copy`：

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'lib', dest: '.' },
        { src: 'pages', dest: '.' },
        { src: 'assets/icons', dest: 'assets/icons' },
        { src: 'styles', dest: 'styles' },
        { src: '_locales', dest: '_locales' },
        { src: 'manifest.json', dest: '.' },
      ]
    })
  ]
});
```

### 8. Tree-shaking 优化

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});
```

## 最佳实践

### 1. 类型安全

- 为所有 Chrome API 调用添加类型注解
- 使用类型守卫处理 nullable 值
- 为消息传递定义明确接口：

```typescript
interface ChromeMessage {
  type: string;
  payload?: unknown;
}

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, sender, sendResponse) => {
    // 类型安全
  }
);
```

### 2. 环境区分

```typescript
// 检测运行环境
const isBackground = !('document' in self);
const isContentScript = self.location?.protocol === 'http:';
const isSidePanel = self.location?.protocol === 'chrome-extension:';
```

### 3. ES Module vs IIFE 转换

Vite 构建后需要将 ESM 转换为 IIFE：

```typescript
// vite.config.ts
function toIIFE() {
  return {
    name: 'to-iife',
    generateBundle(opts, bundle) {
      Object.values(bundle).forEach((chunk) => {
        if (chunk.type !== 'chunk') return;
        let code = chunk.code;
        // 移除 import/export
        code = code.replace(/^import\s+.*$/gm, '');
        code = code.replace(/^export\s+.*$/gm, '');
        // 包装为 IIFE
        code = `(function() {\n${code}\n})();`;
        chunk.code = code;
      });
    }
  };
}
```

### 4. 共享代码模式

将需要共享的代码打包为独立 chunk，在 manifest.json 中按顺序引用：

```json
{
  "content_scripts": [
    {
      "js": [
        "shared.js",  // 先加载
        "content.js"
      ]
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### 5. 热更新开发

```bash
# 使用 --watch 模式
npm run dev
```

### 6. 调试配置

```typescript
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false
  }
});
```

## 项目结构示例

```
extension/
├── src/
│   ├── background.ts      # Service Worker
│   ├── content.ts        # Content Script
│   ├── popup.ts         # Popup 入口
│   ├── sidepanel.ts    # Side Panel 入口
│   ├── components/     # UI 组件
│   ├── shared/         # 共享模块
│   └── tools/          # 工具函数
├── lib/                 # 第三方库
├── pages/               # HTML 页面
├── styles/              # 样式
├── _locales/           # 国际化
├── manifest.json
└── vite.config.js
```

## 构建命令

```bash
# 开发构建（监听模式）
npm run dev

# 生产构建
npm run build

# 清理构建
rm -rf dist
```

## 当前项目实践 (ClawSide)

基于上述最佳实践的实现：

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// IIFE 转换插件
function toIIFE() { ... }

// HTML 路径重写插件
function rewriteHtmlPlugin() { ... }

export default defineConfig({
  root: __dirname,
  plugins: [
    toIIFE(),           // ESM → IIFE
    rewriteHtmlPlugin(), // HTML 路径重写
    viteStaticCopy({...}) // 静态资源复制
  ],
  build: {
    target: 'chrome120',
    sourcemap: true,
    minify: false,
  }
});
```

**已安装依赖**：
- `vite` - 构建工具
- `vite-plugin-static-copy` - 静态文件复制
- `@types/chrome` - Chrome API 类型

## 常见问题

### 1. Cannot use import statement outside a module
- 构建输出为 ESM，需要使用 IIFE 包装器

### 2. window is not defined
- Service Worker 中无 window，使用 self 或 globalThis

### 3. chrome.runtime.sendMessage undefined
- 确保 @types/chrome 已安装

### 4. HTML 脚本路径 404
- 使用 closeBundle 钩子重写 HTML 中的脚本路径

## 参考资源

- [Chrome Extension MV3 Architecture Overview](https://developer.chrome.com/docs/extensions/mv3/architecture-overview/)
- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Vite Build Options](https://vite.dev/config/build-options.html)