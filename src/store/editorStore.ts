import { create } from 'zustand';
import { fabric } from 'fabric';

export interface Layer {
    id: string;
    name: string;
    type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path' | 'svg' | 'text' | 'image';
    visible: boolean;
    locked: boolean;
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

export interface PropertyTrack {
    property: AnimatableProperty;
    keyframes: Keyframe[];
    enabled: boolean;
}

export interface AnimatedObject {
    id: string;
    objectName: string;
    tracks: PropertyTrack[];
    expanded: boolean;
}

// ===== PER-PROPERTY PRESET DEFINITIONS =====
export interface AnimationPreset {
    id: string;
    label: string;
    icon: string;
}

export const PROPERTY_PRESETS: Record<AnimatableProperty, AnimationPreset[]> = {
    position: [
        { id: 'slideInLeft', label: 'Slide In Left', icon: '◀' },
        { id: 'slideInRight', label: 'Slide In Right', icon: '▶' },
        { id: 'slideInUp', label: 'Slide In Up', icon: '▲' },
        { id: 'slideInDown', label: 'Slide In Down', icon: '▼' },
    ],
    scale: [
        { id: 'pulse', label: 'Pulse', icon: '💓' },
        { id: 'grow', label: 'Grow', icon: '⤢' },
        { id: 'shrink', label: 'Shrink', icon: '⤡' },
    ],
    rotate: [
        { id: 'spinCW', label: 'Spin CW', icon: '🔄' },
        { id: 'spinCCW', label: 'Spin CCW', icon: '🔄' },
        { id: 'swing', label: 'Swing', icon: '↔' },
    ],
    opacity: [
        { id: 'fadeIn', label: 'Fade In', icon: '🌅' },
        { id: 'fadeOut', label: 'Fade Out', icon: '🌇' },
        { id: 'blink', label: 'Blink', icon: '👁' },
        { id: 'pulse', label: 'Pulse', icon: '💓' },
    ],
    strokeOffset: [
        { id: 'drawOn', label: 'Draw On', icon: '✏️' },
        { id: 'drawOff', label: 'Draw Off', icon: '✂️' },
    ],
    morph: [],
    skew: [],
    fillColor: [],
    fillOpacity: [],
    strokeColor: [],
    strokeOpacity: [],
    strokeWidth: [],
    strokeDashes: [],
};

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

    // ===== NHÓM 3: History =====
    undoStack: HistorySnapshot[];
    redoStack: HistorySnapshot[];

    // ===== ACTIONS =====
    addLayer: (layer: Layer) => void;
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
    toggleTrackEnabled: (layerId: string, property: AnimatableProperty) => void;
    setAnimatedObjectExpanded: (layerId: string, expanded: boolean) => void;
    addKeyframeToTrack: (layerId: string, property: AnimatableProperty, time: number, value: any, easing?: string) => void;
    updateKeyframeInTrack: (layerId: string, property: AnimatableProperty, keyframeId: string, updates: Partial<Keyframe>) => void;
    removeKeyframeFromTrack: (layerId: string, property: AnimatableProperty, keyframeId: string) => void;
    selectKeyframe: (id: string | null) => void;
    ensureAnimatedObject: (layerId: string, objectName: string) => void;

    // Per-property presets
    applyPropertyPreset: (property: AnimatableProperty, presetId: string, layerId: string, currentTime: number, fabricCanvas: fabric.Canvas | null) => void;

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
    polygonSides: 6,
    starPoints: 5,
    starInnerRatio: 0.5,
    undoStack: [] as HistorySnapshot[],
    redoStack: [] as HistorySnapshot[],
};

function captureSnapshot(layers: Layer[]): HistorySnapshot {
    return { layers: JSON.parse(JSON.stringify(layers)) };
}

/** Get the fabric object for a given layerId from the canvas */
function getFabricObj(layerId: string, canvas: fabric.Canvas | null): fabric.Object | undefined {
    return canvas?.getObjects().find(o => o.data?.id === layerId);
}

export const useEditorStore = create<EditorState>((set, get) => ({
    ...initialState,

    // ===== CANVAS ACTIONS =====
    addLayer: (layer) => set((s) => ({ layers: [...s.layers, layer] })),

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
        if (!existing) {
            const layer = s.layers.find(l => l.id === layerId);
            return {
                animatedObjects: [...s.animatedObjects, {
                    id: layerId,
                    objectName: layer?.name || layerId,
                    tracks: [{ property, keyframes: [], enabled: true }],
                    expanded: true,
                }],
            };
        }
        if (existing.tracks.find(t => t.property === property)) return {};
        const snapshot = captureSnapshot(s.layers);
        return {
            animatedObjects: s.animatedObjects.map(ao =>
                ao.id === layerId
                    ? { ...ao, tracks: [...ao.tracks, { property, keyframes: [], enabled: true }] }
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
    applyPropertyPreset: (property, presetId, layerId, currentTime, fabricCanvas) => {
        const state = get();
        if (!fabricCanvas) return;
        const obj = getFabricObj(layerId, fabricCanvas);
        if (!obj) return;
        const snapshot = captureSnapshot(state.layers);
        const existingAo = state.animatedObjects.find(ao => ao.id === layerId);
        if (!existingAo) return;
        const track = existingAo.tracks.find(t => t.property === property);
        if (!track) return;

        let newKeyframes: { time: number; value: any; easing: string }[] = [];
        const segment = Math.max(0.5, state.duration * 0.3);

        switch (presetId) {
            case 'slideInLeft':
            case 'slideInRight':
            case 'slideInUp':
            case 'slideInDown': {
                if (property !== 'position') return;
                const dx = presetId === 'slideInLeft' ? -200 : presetId === 'slideInRight' ? 200 : 0;
                const dy = presetId === 'slideInUp' ? -150 : presetId === 'slideInDown' ? 150 : 0;
                newKeyframes = [
                    { time: currentTime, value: { left: Math.round((obj.left || 0) + dx), top: Math.round((obj.top || 0) + dy) }, easing: 'power3.out' },
                    { time: currentTime + segment, value: { left: Math.round(obj.left || 0), top: Math.round(obj.top || 0) }, easing: 'power3.out' },
                ];
                break;
            }
            case 'pulse': {
                if (property === 'scale') {
                    newKeyframes = [
                        { time: currentTime, value: { scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1 }, easing: 'sine.out' },
                        { time: currentTime + segment * 0.3, value: { scaleX: (obj.scaleX ?? 1) * 1.15, scaleY: (obj.scaleY ?? 1) * 1.15 }, easing: 'sine.out' },
                        { time: currentTime + segment * 0.6, value: { scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1 }, easing: 'sine.out' },
                    ];
                } else if (property === 'opacity') {
                    newKeyframes = [
                        { time: currentTime, value: obj.opacity ?? 1, easing: 'sine.out' },
                        { time: currentTime + segment * 0.2, value: 0.3, easing: 'sine.out' },
                        { time: currentTime + segment * 0.4, value: obj.opacity ?? 1, easing: 'sine.out' },
                        { time: currentTime + segment * 0.6, value: 0.3, easing: 'sine.out' },
                        { time: currentTime + segment, value: obj.opacity ?? 1, easing: 'sine.out' },
                    ];
                } else return;
                break;
            }
            case 'grow': {
                if (property !== 'scale') return;
                newKeyframes = [
                    { time: currentTime, value: { scaleX: 0, scaleY: 0 }, easing: 'back.out' },
                    { time: currentTime + segment, value: { scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1 }, easing: 'back.out' },
                ];
                break;
            }
            case 'shrink': {
                if (property !== 'scale') return;
                newKeyframes = [
                    { time: currentTime, value: { scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1 }, easing: 'back.in' },
                    { time: currentTime + segment, value: { scaleX: 0, scaleY: 0 }, easing: 'back.in' },
                ];
                break;
            }
            case 'spinCW': {
                if (property !== 'rotate') return;
                newKeyframes = [
                    { time: currentTime, value: obj.angle || 0, easing: 'none' },
                    { time: currentTime + segment, value: (obj.angle || 0) + 360, easing: 'power2.out' },
                ];
                break;
            }
            case 'spinCCW': {
                if (property !== 'rotate') return;
                newKeyframes = [
                    { time: currentTime, value: obj.angle || 0, easing: 'none' },
                    { time: currentTime + segment, value: (obj.angle || 0) - 360, easing: 'power2.out' },
                ];
                break;
            }
            case 'swing': {
                if (property !== 'rotate') return;
                newKeyframes = [
                    { time: currentTime, value: obj.angle || 0, easing: 'sine.out' },
                    { time: currentTime + segment * 0.25, value: (obj.angle || 0) + 30, easing: 'sine.out' },
                    { time: currentTime + segment * 0.5, value: (obj.angle || 0) - 20, easing: 'sine.out' },
                    { time: currentTime + segment * 0.75, value: (obj.angle || 0) + 10, easing: 'sine.out' },
                    { time: currentTime + segment, value: obj.angle || 0, easing: 'sine.out' },
                ];
                break;
            }
            case 'fadeIn': {
                if (property !== 'opacity') return;
                newKeyframes = [
                    { time: currentTime, value: 0, easing: 'power2.out' },
                    { time: currentTime + segment, value: obj.opacity ?? 1, easing: 'power2.out' },
                ];
                break;
            }
            case 'fadeOut': {
                if (property !== 'opacity') return;
                newKeyframes = [
                    { time: currentTime, value: obj.opacity ?? 1, easing: 'power2.out' },
                    { time: currentTime + segment, value: 0, easing: 'power2.out' },
                ];
                break;
            }
            case 'blink': {
                if (property !== 'opacity') return;
                newKeyframes = [
                    { time: currentTime, value: obj.opacity ?? 1, easing: 'none' },
                    { time: currentTime + segment * 0.15, value: 0, easing: 'none' },
                    { time: currentTime + segment * 0.3, value: obj.opacity ?? 1, easing: 'none' },
                    { time: currentTime + segment * 0.45, value: 0, easing: 'none' },
                    { time: currentTime + segment * 0.6, value: obj.opacity ?? 1, easing: 'none' },
                    { time: currentTime + segment * 0.75, value: 0, easing: 'none' },
                    { time: currentTime + segment, value: obj.opacity ?? 1, easing: 'none' },
                ];
                break;
            }
            case 'drawOn': {
                if (property !== 'strokeOffset') return;
                const dashOffset = (obj as any).strokeDashOffset ?? 0;
                newKeyframes = [
                    { time: currentTime, value: 1000, easing: 'none' },
                    { time: currentTime + segment, value: dashOffset, easing: 'none' },
                ];
                break;
            }
            case 'drawOff': {
                if (property !== 'strokeOffset') return;
                const curOff = (obj as any).strokeDashOffset ?? 0;
                newKeyframes = [
                    { time: currentTime, value: curOff, easing: 'none' },
                    { time: currentTime + segment, value: 1000, easing: 'none' },
                ];
                break;
            }
            default: return;
        }

        // Merge new keyframes into the track
        const updatedTracks = existingAo.tracks.map(t => {
            if (t.property !== property) return t;
            return {
                ...t,
                keyframes: [...t.keyframes, ...newKeyframes.map(kf => ({
                    id: crypto.randomUUID(),
                    ...kf,
                }))],
            };
        });

        const maxTime = updatedTracks.flatMap(t => t.keyframes).reduce((max, k) => Math.max(max, k.time), state.duration);
        set({
            animatedObjects: state.animatedObjects.map(ao =>
                ao.id === layerId ? { ...ao, tracks: updatedTracks } : ao
            ),
            duration: Math.max(state.duration, Math.ceil(maxTime + 1)),
            undoStack: [...state.undoStack, snapshot],
            redoStack: [],
        });
    },

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
            set({ ...data, undoStack: [], redoStack: [], isPlaying: false, currentTime: 0 });
        } catch { /* corrupt data */ }
    },
}));
