import { create } from 'zustand';

export interface Layer {
    id: string;
    name: string;
    type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path' | 'svg' | 'text' | 'image' | 'group';
    visible: boolean;
    locked: boolean;
    parentId: string | null;
    originalId: string;
    childrenIds: string[];
}

export type LayerInput = Pick<Layer, 'id' | 'name' | 'type'> & Partial<Pick<Layer, 'visible' | 'locked' | 'parentId' | 'originalId' | 'childrenIds'>>;

export function createLayer(input: LayerInput): Layer {
    return {
        id: input.id,
        name: input.name,
        type: input.type,
        visible: input.visible ?? true,
        locked: input.locked ?? false,
        parentId: input.parentId ?? null,
        originalId: input.originalId ?? '',
        childrenIds: input.childrenIds ?? [],
    };
}

export type LoopMode = 'none' | 'loop' | 'pingpong';

export const EASING_OPTIONS = [
    { group: 'Linear', items: [
        { id: 'none', label: 'Linear', curve: 'M0,100 L100,0' },
    ]},
    { group: 'Power', items: [
        { id: 'power1.out', label: 'Power1 Out', curve: 'M0,100 C25,100 70,50 100,0' },
        { id: 'power1.in', label: 'Power1 In', curve: 'M0,100 C30,50 75,0 100,0' },
        { id: 'power1.inOut', label: 'Power1 InOut', curve: 'M0,100 C50,100 50,0 100,0' },
        { id: 'power2.out', label: 'Power2 Out', curve: 'M0,100 C10,100 60,20 100,0' },
        { id: 'power2.in', label: 'Power2 In', curve: 'M0,100 C40,80 90,0 100,0' },
        { id: 'power2.inOut', label: 'Power2 InOut', curve: 'M0,100 C40,100 60,0 100,0' },
        { id: 'power3.out', label: 'Power3 Out', curve: 'M0,100 C5,100 55,5 100,0' },
        { id: 'power3.in', label: 'Power3 In', curve: 'M0,100 C45,90 95,0 100,0' },
        { id: 'power3.inOut', label: 'Power3 InOut', curve: 'M0,100 C30,100 70,0 100,0' },
        { id: 'power4.out', label: 'Power4 Out', curve: 'M0,100 C2,100 50,0 100,0' },
    ]},
    { group: 'Bounce & Elastic', items: [
        { id: 'back.out', label: 'Back Out', curve: 'M0,100 C10,130 80,20 100,0' },
        { id: 'back.in', label: 'Back In', curve: 'M0,100 C20,80 90,-30 100,0' },
        { id: 'back.inOut', label: 'Back InOut', curve: 'M0,100 C30,140 70,-40 100,0' },
        { id: 'bounce.out', label: 'Bounce Out', curve: 'M0,100 C20,100 40,90 50,60 C60,30 80,10 100,0' },
        { id: 'bounce.in', label: 'Bounce In', curve: 'M0,100 C20,70 40,40 50,10 C60,40 80,0 100,0' },
        { id: 'elastic.out', label: 'Elastic Out', curve: 'M0,100 C30,120 50,10 70,20 C80,30 95,-10 100,0' },
    ]},
    { group: 'Smooth', items: [
        { id: 'sine.out', label: 'Sine Out', curve: 'M0,100 C30,100 80,30 100,0' },
        { id: 'sine.in', label: 'Sine In', curve: 'M0,100 C20,70 70,0 100,0' },
        { id: 'sine.inOut', label: 'Sine InOut', curve: 'M0,100 C50,100 50,0 100,0' },
        { id: 'circ.out', label: 'Circ Out', curve: 'M0,100 C10,100 80,10 100,0' },
        { id: 'circ.in', label: 'Circ In', curve: 'M0,100 C20,90 90,0 100,0' },
        { id: 'expo.out', label: 'Expo Out', curve: 'M0,100 C5,100 75,0 100,0' },
    ]},
];

// ===== Property-Based Animation Types =====
export type AnimatableProperty = 'position' | 'scale' | 'rotate' | 'morph' | 'opacity' | 'skew' | 'fillColor' | 'fillOpacity' | 'strokeColor' | 'strokeOpacity' | 'strokeWidth' | 'strokeOffset' | 'strokeDashes';

export const PROPERTY_TYPES: AnimatableProperty[] = ['position', 'scale', 'rotate', 'opacity', 'skew', 'morph', 'fillColor', 'fillOpacity', 'strokeColor', 'strokeOpacity', 'strokeWidth', 'strokeOffset', 'strokeDashes'];

export const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
    position: 'Position',
    scale: 'Scale',
    rotate: 'Rotate',
    opacity: 'Opacity',
    skew: 'Skew',
    morph: 'Morph',
    fillColor: 'Fill Color',
    fillOpacity: 'Fill Opacity',
    strokeColor: 'Stroke Color',
    strokeOpacity: 'Stroke Opacity',
    strokeWidth: 'Stroke Width',
    strokeOffset: 'Stroke Offset',
    strokeDashes: 'Stroke Dashes',
};

export const PROPERTY_ICONS: Record<AnimatableProperty, string> = {
    position: '↕',
    scale: '⤡',
    rotate: '↻',
    opacity: '◐',
    skew: '⚡',
    morph: '◇',
    fillColor: '🎨',
    fillOpacity: '🔆',
    strokeColor: '✏️',
    strokeOpacity: '💧',
    strokeWidth: '➖',
    strokeOffset: '╌',
    strokeDashes: '┅',
};

export interface Keyframe {
    id: string;
    time: number;
    value: any;
    easing: string;
}

export const SUBTRACK_EASING_OPTIONS = [
    { id: 'none', label: 'Linear' },
    { id: 'power1.in', label: 'Power1 In' },
    { id: 'power1.out', label: 'Power1 Out' },
    { id: 'power1.inOut', label: 'Power1 InOut' },
    { id: 'power2.in', label: 'Power2 In' },
    { id: 'power2.out', label: 'Power2 Out' },
    { id: 'power2.inOut', label: 'Power2 InOut' },
    { id: 'back.out', label: 'Back Out' },
    { id: 'bounce.out', label: 'Bounce Out' },
    { id: 'elastic.out', label: 'Elastic Out' },
];

export interface PropertyTrack {
    property: AnimatableProperty;
    keyframes: Keyframe[];
    enabled: boolean;
    defaultEasing: string;
}

export interface AnimatedObject {
    id: string;
    objectName: string;
    tracks: PropertyTrack[];
    expanded: boolean;
}



interface HistorySnapshot {
    layers: Layer[];
}

export interface ActiveObjectProperties {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
}

interface EditorState {
    // ===== NHÓM 1: Canvas =====
    layers: Layer[];
    selectedLayerId: string | null;
    activeTool: string;
    selectedObjectIds: string[];
    activeObjectProperties: ActiveObjectProperties | null;

    // ===== NHÓM 2: Animation (Timeline) =====
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    loopMode: LoopMode;
    timelineZoom: number;

    // ===== NEW: Property-Based Animation =====
    animatedObjects: AnimatedObject[];
    selectedKeyframeId: string | null;

    // ===== Tool Settings =====
    polygonSides: number;
    starPoints: number;
    starInnerRatio: number;
    selectedNodeIndex: number | null;

    // ===== NHÓM 3: History =====
    undoStack: HistorySnapshot[];
    redoStack: HistorySnapshot[];

    // ===== ACTIONS =====
    addLayer: (layer: LayerInput) => void;
    removeLayer: (id: string) => void;
    selectLayer: (id: string | null) => void;
    toggleLayerVisibility: (id: string) => void;

    setTool: (toolId: string) => void;
    setSelectedObjectIds: (ids: string[]) => void;
    setActiveObjectProperties: (props: ActiveObjectProperties | null) => void;

    setIsPlaying: (isPlaying: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setLoopMode: (mode: LoopMode) => void;
    setTimelineZoom: (zoom: number) => void;
    setPolygonSides: (n: number) => void;
    setStarPoints: (n: number) => void;
    setStarInnerRatio: (n: number) => void;

    // ===== Animation Actions =====
    addPropertyTrack: (layerId: string, property: AnimatableProperty) => void;
    removePropertyTrack: (layerId: string, property: AnimatableProperty) => void;
    removeSubTrack: (layerId: string, property: AnimatableProperty) => void;
    toggleTrackEnabled: (layerId: string, property: AnimatableProperty) => void;
    setAnimatedObjectExpanded: (layerId: string, expanded: boolean) => void;
    addKeyframeToTrack: (layerId: string, property: AnimatableProperty, time: number, value: any, easing?: string) => void;
    updateKeyframeInTrack: (layerId: string, property: AnimatableProperty, keyframeId: string, updates: Partial<Keyframe>) => void;
    removeKeyframeFromTrack: (layerId: string, property: AnimatableProperty, keyframeId: string) => void;
    selectKeyframe: (id: string | null) => void;
    setSelectedNodeIndex: (index: number | null) => void;
    setTrackDefaultEasing: (layerId: string, property: AnimatableProperty, easing: string) => void;
    ensureAnimatedObject: (layerId: string, objectName: string) => void;
    updateSubTrackEasing: (layerId: string, property: AnimatableProperty, easing: string) => void;

    // localStorage
    saveToStorage: () => void;
    loadFromStorage: () => void;

    undo: () => void;
    redo: () => void;
}

const STORAGE_KEY = 'pro-svg-animator-project';

const initialState = {
    layers: [] as Layer[],
    selectedLayerId: null as string | null,
    activeTool: 'transform',
    selectedObjectIds: [] as string[],
    activeObjectProperties: null as ActiveObjectProperties | null,
    isPlaying: false,
    currentTime: 0,
    duration: 5,
    loopMode: 'none' as LoopMode,
    timelineZoom: 100,
    animatedObjects: [] as AnimatedObject[],
    selectedKeyframeId: null as string | null,
    selectedNodeIndex: null as number | null,
    polygonSides: 6,
    starPoints: 5,
    starInnerRatio: 0.5,
    undoStack: [] as HistorySnapshot[],
    redoStack: [] as HistorySnapshot[],
};

function captureSnapshot(layers: Layer[]): HistorySnapshot {
    return { layers: JSON.parse(JSON.stringify(layers)) };
}
export const useEditorStore = create<EditorState>((set, get) => ({
    ...initialState,

    // ===== CANVAS ACTIONS =====
    addLayer: (layer: LayerInput) => set((s) => ({
        layers: [...s.layers, createLayer(layer)],
    })),

    removeLayer: (id) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);
        set((s) => ({
            layers: s.layers.filter((l) => l.id !== id),
            animatedObjects: s.animatedObjects.filter((ao) => ao.id !== id),
            selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
            selectedKeyframeId: null,
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        }));
    },

    selectLayer: (id) => set({ selectedLayerId: id }),

    toggleLayerVisibility: (id) => set((s) => ({
        layers: s.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    })),

    setTool: (toolId) => set({ activeTool: toolId }),
    setSelectedObjectIds: (ids) => set({ selectedObjectIds: ids }),
    setActiveObjectProperties: (props) => set({ activeObjectProperties: props }),

    // ===== ANIMATION ACTIONS =====
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setDuration: (duration) => set({ duration }),
    setLoopMode: (loopMode) => set({ loopMode }),
    setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.max(20, Math.min(500, timelineZoom)) }),
    setPolygonSides: (n) => set({ polygonSides: Math.max(3, Math.min(24, n)) }),
    setStarPoints: (n) => set({ starPoints: Math.max(3, Math.min(24, n)) }),
    setStarInnerRatio: (r) => set({ starInnerRatio: Math.max(0.1, Math.min(0.9, r)) }),

    // ===== NEW: PROPERTY-BASED ANIMATION ACTIONS =====

    ensureAnimatedObject: (layerId, objectName) => set((s) => {
        if (s.animatedObjects.find(ao => ao.id === layerId)) return {};
        return {
            animatedObjects: [...s.animatedObjects, {
                id: layerId,
                objectName,
                tracks: [],
                expanded: true,
            }],
        };
    }),

    addPropertyTrack: (layerId, property) => set((s) => {
        const existing = s.animatedObjects.find(ao => ao.id === layerId);
        const newTrack = (): PropertyTrack => ({ property, keyframes: [], enabled: true, defaultEasing: 'power2.out' });
        if (!existing) {
            const layer = s.layers.find(l => l.id === layerId);
            return {
                animatedObjects: [...s.animatedObjects, {
                    id: layerId,
                    objectName: layer?.name || layerId,
                    tracks: [newTrack()],
                    expanded: true,
                }],
            };
        }
        if (existing.tracks.find(t => t.property === property)) return {};
        const snapshot = captureSnapshot(s.layers);
        return {
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: [...ao.tracks, newTrack()] }
                    : ao
            ),
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        };
    }),

    removePropertyTrack: (layerId, property) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);
        set((s) => ({
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: ao.tracks.filter(t => t.property !== property) }
                    : ao
            ),
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        }));
    },

    removeSubTrack: (layerId, property) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);
        set((s) => ({
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: ao.tracks.filter(t => t.property !== property) }
                    : ao
            ),
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        }));
    },

    toggleTrackEnabled: (layerId, property) => set((s) => ({
        animatedObjects: s.animatedObjects.map(ao =>
            ao.id === layerId
                ? { ...ao, tracks: ao.tracks.map(t =>
                      t.property === property ? { ...t, enabled: !t.enabled } : t
                  ) }
                : ao
        ),
    })),

    setAnimatedObjectExpanded: (layerId, expanded) => set((s) => ({
        animatedObjects: s.animatedObjects.map(ao =>
            ao.id === layerId ? { ...ao, expanded } : ao
        ),
    })),

    addKeyframeToTrack: (layerId, property, time, value, easing = 'power2.out') => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);
        const newKf: Keyframe = { id: crypto.randomUUID(), time, value, easing };
        const ao = state.animatedObjects.find(a => a.id === layerId);
        const maxTime = ao?.tracks
            .flatMap(t => t.keyframes)
            .reduce((max, k) => Math.max(max, k.time), time);
        const newDuration = maxTime ? Math.max(state.duration, Math.ceil(maxTime + 1)) : state.duration;
        set((s) => ({
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: ao.tracks.map(t =>
                          t.property === property
                              ? { ...t, keyframes: [...t.keyframes.filter(k => Math.abs(k.time - time) > 0.01), newKf] }
                              : t
                      ) }
                    : ao
            ),
            duration: newDuration,
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        }));
    },

    updateKeyframeInTrack: (layerId, property, keyframeId, updates) => set((s) => ({
        animatedObjects: s.animatedObjects.map(ao =>
            ao.id === layerId
                ? { ...ao, tracks: ao.tracks.map(t =>
                      t.property === property
                          ? { ...t, keyframes: t.keyframes.map(k =>
                                k.id === keyframeId ? { ...k, ...updates } : k
                            ) }
                          : t
                  ) }
                : ao
        ),
    })),

    removeKeyframeFromTrack: (layerId, property, keyframeId) => {
        const state = get();
        const snapshot = captureSnapshot(state.layers);
        set((s) => ({
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: ao.tracks.map(t =>
                          t.property === property
                              ? { ...t, keyframes: t.keyframes.filter(k => k.id !== keyframeId) }
                              : t
                      ) }
                    : ao
            ),
            selectedKeyframeId: s.selectedKeyframeId === keyframeId ? null : s.selectedKeyframeId,
            undoStack: [...s.undoStack, snapshot],
            redoStack: [],
        }));
    },

    selectKeyframe: (id) => set({ selectedKeyframeId: id }),
    setSelectedNodeIndex: (index) => set({ selectedNodeIndex: index }),
    setTrackDefaultEasing: (layerId, property, easing) => set((s) => ({
        animatedObjects: s.animatedObjects.map(ao =>
            ao.id === layerId
                ? { ...ao, tracks: ao.tracks.map(t =>
                      t.property === property
                          ? { ...t, defaultEasing: easing }
                          : t
                  ) }
                : ao
        ),
    })),

    // ===== HISTORY =====
    undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;
        const previousState = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);
        const currentSnapshot = captureSnapshot(state.layers);
        set({
            layers: previousState.layers,
            undoStack: newUndoStack,
            redoStack: [...state.redoStack, currentSnapshot],
            selectedLayerId: null,
        });
    },

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

    // ===== PER-PROPERTY PRESETS =====
    updateSubTrackEasing: (layerId, property, easing) => set((s) => ({
        animatedObjects: s.animatedObjects.map(ao =>
            ao.id === layerId
                ? {
                    ...ao,
                    tracks: ao.tracks.map(t =>
                        t.property === property
                            ? { ...t, defaultEasing: easing, keyframes: t.keyframes.map(kf => ({ ...kf, easing })) }
                            : t
                    ),
                }
                : ao
        ),
    })),



    // ===== LOCAL STORAGE =====
    saveToStorage: () => {
        const { undoStack, redoStack, ...saveData } = get();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
        } catch { /* storage full */ }
    },

    loadFromStorage: () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.layers) {
                data.layers = data.layers.map((l: any) => createLayer({
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    visible: l.visible,
                    locked: l.locked,
                    parentId: l.parentId ?? null,
                    originalId: l.originalId ?? '',
                    childrenIds: l.childrenIds ?? [],
                }));
            }
            set({ ...data, undoStack: [], redoStack: [], isPlaying: false, currentTime: 0 });
        } catch { /* corrupt data */ }
    },
}));
