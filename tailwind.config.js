/** Tailwind 本地构建配置：样式随 Vite 打包，离线启动不再依赖 CDN。 */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};