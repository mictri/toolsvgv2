/**
 * canvasSlice — Slice quản lý Canvas objects & selection.
 * Dự kiến tách từ editorStore.ts để mỗi slice phụ trách 1 domain.
 *
 * State:
 *   - layers: Layer[] — danh sách layer
 *   - selectedLayerId: string | null
 *
 * Actions:
 *   - addLayer, removeLayer, selectLayer
 */
import { Layer } from './editorStore';

export interface CanvasSlice {
    layers: Layer[];
    selectedLayerId: string | null;
    addLayer: (layer: Layer) => void;
    removeLayer: (id: string) => void;
    selectLayer: (id: string | null) => void;
}
