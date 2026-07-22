/**
 * animationSlice — Slice quản lý Timeline & Keyframe.
 * Dự kiến tách từ editorStore.ts.
 *
 * State:
 *   - isPlaying, currentTime, duration
 *   - keyframes: KeyframeNode[]
 *   - animatedLayerIds: string[]
 *   - selectedKeyframeId: string | null
 *
 * Actions:
 *   - setIsPlaying, setCurrentTime, enableAnimation
 *   - addMasterKeyframe, updateKeyframeTime
 *   - selectKeyframe, removeKeyframe
 */
import { KeyframeNode } from './editorStore';

export interface AnimationSlice {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    keyframes: KeyframeNode[];
    animatedLayerIds: string[];
    selectedKeyframeId: string | null;
    setIsPlaying: (isPlaying: boolean) => void;
    setCurrentTime: (time: number) => void;
    enableAnimation: (id: string) => void;
    addMasterKeyframe: (layerId: string, time: number, fabricCanvas: fabric.Canvas | null) => void;
    updateKeyframeTime: (id: string, newTime: number) => void;
    selectKeyframe: (id: string | null) => void;
    removeKeyframe: (id: string) => void;
}
