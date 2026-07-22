/**
 * types/index.ts — Định nghĩa kiểu dữ liệu dùng chung cho toàn bộ app.
 *
 * Layer, KeyframeNode, và các interface khác.
 * Hiện tại re-export từ editorStore để giữ tương thích.
 * Sau này chuyển dần định nghĩa type về đây.
 */
export type { Layer, KeyframeNode } from '../store/editorStore';
