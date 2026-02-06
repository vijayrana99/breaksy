import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html',
        background: 'src/background/service_worker.ts',
      },
      output: {
        entryFileNames: 'src/[name]/[name].js',
        chunkFileNames: 'src/[name]/[name]-[hash].js',
        assetFileNames: 'src/[name]/[name]-[hash].[ext]',
      },
    },
  },
});
