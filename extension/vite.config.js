import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

const __dirname = '/Users/yw/Dev/code/clawside/extension';

// Plugin to convert ESM to IIFE and remove import/export statements
function toIIFE() {
  return {
    name: 'to-iife',
    generateBundle(opts, bundle) {
      Object.values(bundle).forEach((chunk) => {
        if (chunk.type !== 'chunk') return;

        let code = chunk.code;

        // Skip if already wrapped
        if (code.trim().startsWith('(function')) {
          chunk.code = code;
          return;
        }

        // Only wrap main entry files in IIFE, not shared chunks
        // Entry files are: background, content, popup, dock, sidepanel, shared
        // Skip wrapping for utility chunks like settings.js
        const isEntry = Object.keys(opts.input || {}).some(
          input => chunk.fileName === input.replace(/\.ts$/, '.js')
        );

        // Remove import/export statements (Vite keeps them in separate chunks)
        code = code.replace(/^import\s+.*$/gm, '');
        code = code.replace(/^export\s+.*$/gm, '');

        // Wrap only entry files in IIFE
        if (isEntry) {
          code = `(function() {\n'use strict';\n${code}\n})();`;
        }

        chunk.code = code;
      });
    }
  };
}

// Plugin to copy all static files
function copyStaticPlugin() {
  return {
    name: 'copy-static',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');

      // Copy lib/*.js
      const libSrc = resolve(__dirname, 'lib');
      const libDest = resolve(dist, 'lib');
      mkdirSync(libDest, { recursive: true });
      readdirSync(libSrc).forEach(file => {
        if (file.endsWith('.js')) {
          copyFileSync(resolve(libSrc, file), resolve(libDest, file));
        }
      });

      // Copy pages/sidepanel.html with rewrite
      const pagesSrc = resolve(__dirname, 'pages/sidepanel.html');
      const pagesDest = resolve(dist, 'pages/sidepanel.html');
      let html = readFileSync(pagesSrc, 'utf-8');
      html = html
        .replace(/src="\.\.\/lib\/marked\.min\.js"/g, 'src="/lib/marked.min.js"')
        .replace(/src="\.\.\/lib\/readability\.iife\.js"/g, 'src="/lib/readability.iife.js"')
        .replace(/src="\.\.\/sidepanel\.js"/g, 'src="/shared.js"></script><script src="/settings.js"></script><script src="/sidepanel.js"');
      mkdirSync(resolve(dist, 'pages'), { recursive: true });
      writeFileSync(pagesDest, html);

      // Copy icons
      const iconsSrc = resolve(__dirname, 'assets/icons');
      const iconsDest = resolve(dist, 'assets/icons');
      mkdirSync(iconsDest, { recursive: true });
      readdirSync(iconsSrc).forEach(file => {
        copyFileSync(resolve(iconsSrc, file), resolve(iconsDest, file));
      });

      // Copy imgs
      const imgsSrc = resolve(__dirname, 'assets/imgs');
      const imgsDest = resolve(dist, 'assets/imgs');
      mkdirSync(imgsDest, { recursive: true });
      readdirSync(imgsSrc).forEach(file => {
        copyFileSync(resolve(imgsSrc, file), resolve(imgsDest, file));
      });

      // Copy styles
      const stylesSrc = resolve(__dirname, 'styles/sidepanel.css');
      const stylesDest = resolve(dist, 'styles/sidepanel.css');
      mkdirSync(resolve(dist, 'styles'), { recursive: true });
      copyFileSync(stylesSrc, stylesDest);

      // Copy locales
      const localesSrc = resolve(__dirname, '_locales');
      const localesDest = resolve(dist, '_locales');
      const locales = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh_CN', 'zh_TW'];
      locales.forEach(lang => {
        mkdirSync(resolve(localesDest, lang), { recursive: true });
        copyFileSync(
          resolve(localesSrc, lang, 'messages.json'),
          resolve(localesDest, lang, 'messages.json')
        );
      });

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(dist, 'manifest.json')
      );
    }
  };
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'background.ts'),
        content: resolve(__dirname, 'content.ts'),
        popup: resolve(__dirname, 'src/components/popup.ts'),
        dock: resolve(__dirname, 'src/components/dock.ts'),
        sidepanel: resolve(__dirname, 'src/components/sidepanel.ts'),
        shared: resolve(__dirname, 'src/shared/shared-content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    target: 'chrome120',
    minify: false,
    sourcemap: true,
  },
  plugins: [
    toIIFE(),
    copyStaticPlugin(),
  ],
});
