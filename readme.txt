Cách triển khai (với Vite / React):
Cài đặt package gh-pages:

Bash
npm install gh-pages --save-dev
Cập nhật vite.config.ts: Thêm thuộc tính base:

TypeScript
export default defineConfig({
  plugins: [react()],
  base: '/ten-repository-cua-ban/', // Thay tên repo GitHub của bạn vào đây
})
Thêm script vào package.json:

JSON
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}
Chạy lệnh deploy:

Bash
npm run deploy
👉 Kết quả: Trang web của bạn sẽ chạy tại địa chỉ: https://<user-name>.github.io/<ten-repo>/