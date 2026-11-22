import { defineConfig } from 'vite';
import { resolve } from 'node:path';
// GitHub Pages는 /naenae/ 아래에서 열리므로 상대 경로로 빌드 (base './')
export default defineConfig({
  base: './',
  build: {
    target: 'es2022', // api/index.js 의 top-level await
    outDir: 'dist',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } }
  },
  server: { port: 5173 }
});
