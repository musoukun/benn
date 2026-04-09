import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';

export default defineConfig(({ mode }) => {
  // クライアント (React) ビルド: ルートの index.html を入力に dist/client へ出力
  if (mode === 'client') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist/client',
        emptyOutDir: true,
      },
    };
  }

  // dev サーバー & サーバー (Hono) ビルド
  return {
    plugins: [
      react(),
      devServer({
        entry: 'src/server/index.ts',
        exclude: [
          /^\/@.+$/,                            // /@vite/client, /@react-refresh
          /.*\.(ts|tsx|jsx|vue)($|\?)/,         // ソースモジュール
          /.*\.(s?css|less)($|\?)/,
          /.*\.(svg|png|jpg|jpeg|gif|webp|woff2?)($|\?)/,
          /^\/(public|assets|static)\/.+/,
          /^\/node_modules\/.*/,
        ],
        injectClientScript: false,
      }),
    ],
    // @resvg/resvg-js の native .node bindings は esbuild が読めないので external 化
    ssr: {
      external: ['@resvg/resvg-js'],
    },
    optimizeDeps: {
      exclude: ['@resvg/resvg-js'],
    },
    build: {
      outDir: 'dist/server',
      emptyOutDir: true,
      ssr: true,
      target: 'node20',
      rollupOptions: {
        input: './src/server/index.ts',
        output: {
          entryFileNames: 'index.js',
          format: 'esm',
        },
      },
    },
  };
});
