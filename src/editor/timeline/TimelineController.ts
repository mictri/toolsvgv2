/**
 * TimelineController — Logic điều khiển play/pause/scrub/loop.
 * Tách khỏi Timeline.tsx để giảm phức tạp cho UI component.
 */
import { fabric } from 'fabric';
import { globalGsapTimeline } from './gsapInstance';
import { useEditorStore } from '../../store/editorStore';
import { compileTimeline } from './timelineCompiler';

export class TimelineController {
    private fabricCanvas: fabric.Canvas | null = null;
    private rafId: number | null = null;

    attach(fabricCanvas: fabric.Canvas | null) {
        this.fabricCanvas = fabricCanvas;
    }

    play() {
        globalGsapTimeline.play();
        this.startRafLoop();
    }

    pause() {
        globalGsapTimeline.pause();
        this.stopRafLoop();
    }

    toggle() {
        const { isPlaying, currentTime, duration } = useEditorStore.getState();
        if (currentTime >= duration) {
            this.scrub(0);
        }
        if (isPlaying) {
            this.pause();
            useEditorStore.getState().setIsPlaying(false);
        } else {
            this.play();
            useEditorStore.getState().setIsPlaying(true);
        }
    }

    scrub(time: number) {
        const { duration, setCurrentTime } = useEditorStore.getState();
        const clamped = Math.min(duration, Math.max(0, time));
        const rounded = Math.round(clamped * 100) / 100;
        setCurrentTime(rounded);
        globalGsapTimeline.time(rounded);
        this.fabricCanvas?.renderAll();
        window.dispatchEvent(new CustomEvent('timeline-scrub', { detail: { time: rounded } }));
    }

    seekToStart() {
        this.scrub(0);
    }

    seekToEnd() {
        this.scrub(useEditorStore.getState().duration);
    }

    recompile() {
        const { keyframes } = useEditorStore.getState();
        compileTimeline(keyframes, this.fabricCanvas);
    }

    private startRafLoop = () => {
        const update = () => {
            const { currentTime, duration, setIsPlaying } = useEditorStore.getState();
            const timeNow = globalGsapTimeline.time();
            if (timeNow !== currentTime) {
                useEditorStore.getState().setCurrentTime(timeNow);
            }
            if (timeNow >= duration) {
                setIsPlaying(false);
                this.stopRafLoop();
                return;
            }
            if (globalGsapTimeline.isActive()) {
                this.rafId = requestAnimationFrame(update);
            }
        };
        this.rafId = requestAnimationFrame(update);
    };

    private stopRafLoop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    destroy() {
        this.stopRafLoop();
        this.fabricCanvas = null;
    }
}

/** Singleton instance */
export const timelineController = new TimelineController();
