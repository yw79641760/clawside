import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Custom plugin to rewrite script src paths in HTML
function rewriteHtmlScripts() {
  return {
    name: 'rewrite-html-scripts',
    transformIndexHtml(html) {
      return html
        .replace(/src="\.\.\/lib\/marked\.min\.js"/g, 'src="lib/marked.min.js"')
        .replace(/src="\.\.\/lib\/readability\.iife\.js"/g, 'src="lib/readability.iife.js"')
        .replace(/src="\.\.\/sidepanel\.js"/g, 'src="sidepanel.js"');
    }
  };
}

export default defineConfig({
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
    rewriteHtmlScripts(),
    viteStaticCopy({
      targets: [
        { src: 'lib', dest: '.' },
        { src: 'pages', dest: '.' },
        { src: 'assets/icons', dest: 'assets/icons' },
        { src: 'assets/imgs', dest: 'assets/imgs' },
        { src: 'styles', dest: 'styles' },
        { src: '_locales', dest: '_locales' },
        { src: 'manifest.json', dest: '.' },
      ],
    }),
  ],
});