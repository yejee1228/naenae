import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// 관리자 주소는 /admin (GitHub Pages는 admin.html을 /admin 으로도 열어 줌).
// 개발·미리보기 서버도 같은 주소로 열리게 /admin → /admin.html 로 넘김
const adminPath = () => {
  const rewrite = (req, _res, next) => { if (/^\/admin\/?(\?|#|$)/.test(req.url)) req.url = req.url.replace(/^\/admin\/?/, '/admin.html'); next(); };
  return { name: 'admin-path', configureServer: s => { s.middlewares.use(rewrite); }, configurePreviewServer: s => { s.middlewares.use(rewrite); } };
};

// GitHub Pages는 /naenae/ 아래에서 열리므로 상대 경로로 빌드 (base './')
export default defineConfig({
  base: './',
  plugins: [adminPath()],
  build: {
    target: 'es2022', // api/index.js 의 top-level await
    outDir: 'dist',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } }
  },
  server: { port: 5173 }
});
