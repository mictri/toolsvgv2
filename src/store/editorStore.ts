/**
 * =============================================================================
 *  PRO SVG ANIMATOR — ZUSTAND STORE
 * =============================================================================
 *  Kiến trúc:
 *    - Dùng Zustand (lightweight state management)
 *    - State được chia làm 3 nhóm: Canvas, Animation, History
 *    - Undo/Redo dùng cơ chế "dual-stack" (undoStack + redoStack)
 *      Mỗi lần mutate dữ liệu quan trọng → snapshot toàn bộ state → push vào undoStack
 *      Khi Undo → pop undoStack, push state hiện tại vào redoStack
 *      Khi Redo → pop redoStack, push state hiện tại vào undoStack
 *    - Snapshot dùng JSON.parse(JSON.stringify(...)) để clone deep
 *      (phù hợp với quy mô hiện tại, về sau có thể chuyển sang Immer)
 * =============================================================================
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
//  ĐỊNH NGHĨA KIỂU DỮ LIỆU (Types)
// ---------------------------------------------------------------------------

/** Layer (lớp) — tương ứng 1 đối tượng trên canvas */
export interface Layer {
    id: string;
    name: string;
    /** Loại hình: rect, ellipse, polygon, star, line, path (vector tự do), svg (import) */
    type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path' | 'svg' | 'text' | 'image';
    visible: boolean;
    locked: boolean;
}

/**
 * KeyframeNode — một mốc hoạt ảnh tại thời điểm `time` (giây)
 * Chứa toàn bộ ma trận biến đổi (transform matrix) của đối tượng tại mốc đó
 * GSAP sẽ nội suy (interpolate) giữa 2 keyframe liên tiếp để tạo chuyển động mượt
 */
export interface KeyframeNode {
    id: string;
    layerId: string;
    /** Thời gian (giây) trong timeline */
    time: number;
    /** Hàm easing (tăng tốc) cho đoạn chuyển từ keyframe trước → keyframe này */
    easing: 'none' | 'power2.out' | 'bounce.out' | 'back.out';
    transform: {
        left: number;
        top: number;
        angle: number;
        scaleX: number;
        scaleY: number;
        skewX: number;
        skewY: number;
        opacity: number;
        fill: string;
        stroke: string;
    };
}

/**
 * Snapshot dùng cho Undo/Redo.
 * Chỉ lưu layers — KHÔNG lưu keyframes hay animatedLayerIds.
 * Lý do: Undo/Redo chỉ áp dụng cho thao tác Canvas (thêm/xóa shape),
 * không áp dụng cho Timeline (keyframe). Người dùng muốn tách biệt 2 vùng này.
 */
interface HistorySnapshot {
    layers: Layer[];
}

// ---------------------------------------------------------------------------
//  ĐỊNH NGHĨA INTERFACE STATE & ACTIONS
// ---------------------------------------------------------------------------

interface EditorState {
    // ===== NHÓM 1: Canvas =====
    layers: Layer[];
    selectedLayerId: string | null;

    // ===== NHÓM 2: Animation (Timeline) =====
    isPlaying: boolean;
    currentTime: number;       // Playhead position (giây)
    duration: number;          // Tổng thời gian timeline (giây), mặc định 5s
    keyframes: KeyframeNode[];
    animatedLayerIds: string[]; // Layer nào đã được kích hoạt animation
    selectedKeyframeId: string | null;

    // ===== NHÓM 3: History (Undo/Redo) =====
    undoStack: HistorySnapshot[];
    redoStack: HistorySnapshot[];

    // ===== ACTIONS =====
    // --- Canvas Actions ---
    addLayer: (layer: Layer) => void;
    removeLayer: (id: string) => void;
    selectLayer: (id: string | null) => void;
    toggleLayerVisibility: (id: string) => void;

    // --- Animation Actions ---
    setIsPlaying: (isPlaying: boolean) => void;
    setCurrentTime: (time: number) => void;
    enableAnimation: (id: string) => void;
    addMasterKeyframe: (layerId: string, time: number, fabricCanvas: fabric.Canvas | null) => void;
    updateKeyframeTime: (id: string, newTime: number) => void;
    selectKeyframe: (id: string | null) => void;
    removeKeyframe: (id: string) => void;

    // --- History Actions ---
    undo: () => void;
    redo: () => void;
}

// ---------------------------------------------------------------------------
//  INITIAL STATE
// ---------------------------------------------------------------------------

const initialState = {
    layers: [],
    selectedLayerId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 5,
    keyframes: [],
    animatedLayerIds: [],
    selectedKeyframeId: null,
    undoStack: [],
    redoStack: [],
};

// ---------------------------------------------------------------------------
//  HELPER: tạo snapshot để lưu vào history
// ---------------------------------------------------------------------------

function captureSnapshot(layers: Layer[]): HistorySnapshot {
    return {
        layers: JSON.parse(JSON.stringify(layers)),
    };
}

// ---------------------------------------------------------------------------
//  TẠO STORE
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorState>((set, get) => ({
    // ---- Khởi tạo state ----
    ...initialState,

    // ======================================================================
    //  NHÓM 1: CANVAS ACTIONS
    // ======================================================================

    /**
     * addLayer: Thêm layer mới khi người dùng tạo shape trên canvas.
     * Không cần saveToHistory vì đây là hành động khởi tạo.
     */
    addLayer: (layer) => {
        set((state) => ({ layers: [...state.layers, layer] }));
    },

    /**
     * removeLayer: Xóa layer và toàn bộ keyframe/animation liên quan.
     * Lưu snapshot trước khi xóa để Undo khôi phục được.
     */
    removeLayer: (id) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);

        set((state) => ({
            layers: state.layers.filter((l) => l.id !== id),
            animatedLayerIds: state.animatedLayerIds.filter((layerId) => layerId !== id),
            keyframes: state.keyframes.filter((kf) => kf.layerId !== id),
            selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
            undoStack: [...state.undoStack, snapshot],
            redoStack: [], // CLEAR redoStack khi có action mới
        }));
    },

    /** selectLayer: Chọn layer để hiển thị properties (không undo được) */
    selectLayer: (id) => set({ selectedLayerId: id }),

    /** toggleLayerVisibility: Bật/tắt visible của layer (ẩn/hiện tạm thời, ko undo) */
    toggleLayerVisibility: (id) => set((state) => ({
        layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    })),

    // ======================================================================
    //  NHÓM 2: ANIMATION ACTIONS
    // ======================================================================

    setIsPlaying: (isPlaying) => set({ isPlaying }),

    setCurrentTime: (currentTime) => set({ currentTime }),

    /**
     * enableAnimation: Kích hoạt layer có thể tạo keyframe animation.
     * Nếu layer đã được kích hoạt rồi thì bỏ qua.
     */
    enableAnimation: (id) => set((state) => {
        if (state.animatedLayerIds.includes(id)) return {};
        return { animatedLayerIds: [...state.animatedLayerIds, id] };
    }),

    /**
     * addMasterKeyframe:
     *   - Tạo keyframe tại thời điểm hiện tại (time)
     *   - Lấy toàn bộ thuộc tính transform từ Fabric object thực tế
     *   - Nếu đã tồn tại keyframe tại (layerId + time) thì ghi đè (replace)
     *   - Tự động enableAnimation nếu layer chưa được kích hoạt
     */
    addMasterKeyframe: (layerId, time, fabricCanvas) => {
        if (!fabricCanvas) return;

        const targetObj = fabricCanvas.getObjects().find(obj => obj.data?.id === layerId);
        if (!targetObj) return;

        const state = get();
        const snapshot = captureSnapshot(state.layers);

        set((state) => {
            // Tự động kích hoạt animation nếu layer chưa có
            const updatedAnimatedIds = state.animatedLayerIds.includes(layerId)
                ? state.animatedLayerIds
                : [...state.animatedLayerIds, layerId];

            // Nếu đã có keyframe tại đúng (layerId + time) thì replace, không thì thêm mới
            const filtered = state.keyframes.filter(k => !(k.layerId === layerId && k.time === time));

            const newNode: KeyframeNode = {
                id: crypto.randomUUID(),
                layerId,
                time,
                easing: 'power2.out',
                transform: {
                    left: Math.round(targetObj.left || 0),
                    top: Math.round(targetObj.top || 0),
                    angle: Math.round(targetObj.angle || 0),
                    scaleX: targetObj.scaleX !== undefined ? Number(targetObj.scaleX.toFixed(2)) : 1,
                    scaleY: targetObj.scaleY !== undefined ? Number(targetObj.scaleY.toFixed(2)) : 1,
                    skewX: targetObj.skewX !== undefined ? Math.round(targetObj.skewX) : 0,
                    skewY: targetObj.skewY !== undefined ? Math.round(targetObj.skewY) : 0,
                    opacity: targetObj.opacity !== undefined ? Number(targetObj.opacity.toFixed(2)) : 1,
                    fill: (targetObj.fill as string) || '#6366f1',
                    stroke: targetObj.stroke || '#4f46e5',
                }
            };

            return {
                animatedLayerIds: updatedAnimatedIds,
                keyframes: [...filtered, newNode],
                undoStack: [...state.undoStack, snapshot],
                redoStack: [],
            };
        });
    },

    /**
     * updateKeyframeTime: Kéo keyframe sang vị trí mới trên timeline.
     * Giới hạn trong [0, duration].
     */
    updateKeyframeTime: (id, newTime) => set((state) => ({
        keyframes: state.keyframes.map(k =>
            k.id === id ? { ...k, time: Math.max(0, Math.min(state.duration, newTime)) } : k
        ),
    })),

    selectKeyframe: (id) => set({ selectedKeyframeId: id }),

    /**
     * removeKeyframe: Xóa một keyframe cụ thể.
     * Lưu snapshot trước khi xóa.
     */
    removeKeyframe: (id) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);

        set((state) => ({
            keyframes: state.keyframes.filter((k) => k.id !== id),
            selectedKeyframeId: state.selectedKeyframeId === id ? null : state.selectedKeyframeId,
            undoStack: [...state.undoStack, snapshot],
            redoStack: [],
        }));
    },

    // ======================================================================
    //  NHÓM 3: HISTORY ACTIONS (UNDO / REDO)
    // ======================================================================

    /**
     * undo: Hoàn tác thao tác cuối cùng.
     *   - Pop snapshot từ undoStack
     *   - Push state hiện tại vào redoStack (để redo sau)
     *   - Restore layers + keyframes + animatedLayerIds
     *   - Reset selectedLayerId + selectedKeyframeId
     *   - Nếu undoStack rỗng → không làm gì
     */
    undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;

        const previousState = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);

        // Snapshot layers hiện tại để đẩy vào redoStack
        const currentSnapshot = captureSnapshot(state.layers);

        set({
            layers: previousState.layers,
            // KHÔNG khôi phục keyframes/animatedLayerIds — undo chỉ áp dụng cho Canvas
            undoStack: newUndoStack,
            redoStack: [...state.redoStack, currentSnapshot],
            selectedLayerId: null,
            // selectedKeyframeId giữ nguyên
        });
    },

    /**
     * redo: Phục hồi thao tác vừa undo.
     */
    redo: () => {
        const state = get();
        if (state.redoStack.length === 0) return;

        const nextState = state.redoStack[state.redoStack.length - 1];
        const newRedoStack = state.redoStack.slice(0, -1);

        const currentSnapshot = captureSnapshot(state.layers);

        set({
            layers: nextState.layers,
            undoStack: [...state.undoStack, currentSnapshot],
            redoStack: newRedoStack,
            selectedLayerId: null,
        });
    },
}));

