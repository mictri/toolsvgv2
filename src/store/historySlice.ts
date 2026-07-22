/**
 * historySlice — Slice quản lý Undo/Redo (Command Pattern).
 * Dự kiến tách từ editorStore.ts.
 *
 * Cơ chế:
 *   - undoStack: HistorySnapshot[] — lưu các snapshot layers
 *   - redoStack: HistorySnapshot[] — phục hồi sau undo
 *   - Chỉ lưu layers (ko lưu keyframes), vì undo/redo chỉ áp dụng cho Canvas.
 */
import { Layer } from './editorStore';

/** Snapshot chỉ chứa layers (keyframe undo là tính năng riêng) */
export interface HistorySnapshot {
    layers: Layer[];
}

export interface HistorySlice {
    undoStack: HistorySnapshot[];
    redoStack: HistorySnapshot[];
    undo: () => void;
    redo: () => void;
}
