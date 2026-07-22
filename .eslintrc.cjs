module.exports = {
  root: true,
  env: { 
    browser: true, 
    es2020: true,
    node: true 
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['react-refresh'],
  rules: {
    // Ép buộc kiến trúc mã nguồn sạch
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // TypeScript & Clean Code Rules
    '@typescript-eslint/no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_' 
    }], // Không cho phép biến thừa (ngoại trừ biến có dấu _ đứng trước)
    '@typescript-eslint/explicit-function-return-type': 'off', // Tùy chọn, tắt để linh hoạt với React Component
    '@typescript-eslint/no-explicit-any': 'error', // Cấm tuyệt đối việc sử dụng `any` bừa bãi trong Canvas Core
    '@typescript-eslint/no-unsafe-assignment': 'warn', // Cảnh báo khi gán dữ liệu không rõ kiểu (rất hay gặp khi parse SVG)
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    
    // Console & Debugging
    'no-console': ['warn', { allow: ['warn', 'error'] }], // Chỉ cho phép console.warn/error khi lên production
    'no-debugger': 'error', // Cấm debugger
    
    // Code Style chuẩn hóa
    'semi': ['error', 'always'], // Bắt buộc dấu chấm phẩy
    'quotes': ['error', 'single', { 'avoidEscape': true }] // Bắt buộc nháy đơn
  },
};