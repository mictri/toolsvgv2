import { fabric } from 'fabric';
import { useEditorStore } from '../../store/editorStore';
import { compileTimeline, getActiveTimeline } from './timelineCompiler';

export class TimelineController {
    private fabricCanvas: fabric.Canvas | null = null;
    private rafId: number | null = null;
    private onPlayheadUpdate: ((time: number) => void) | null = null;
    private lastStoreSync = 0;

    attach(fabricCanvas: fabric.Canvas | null) {
        this.fabricCanvas = fabricCanvas;
    }

    onPlayhead(cb: ((time: number) => void) | null) {
        this.onPlayheadUpdate = cb;
    }

    play() {
        let tl = getActiveTimeline();
        if (!tl) {
            const { animatedObjects } = useEditorStore.getState();
            compileTimeline(animatedObjects, this.fabricCanvas);
            tl = getActiveTimeline();
        }
        if (tl) tl.play();
        this.lastStoreSync = performance.now();
        this.startRafLoop();
    }

    pause() {
        const tl = getActiveTimeline();
        if (tl) tl.pause();
        this.stopRafLoop();
        const tl2 = getActiveTimeline();
        const timeNow = tl2 ? tl2.time() : 0;
        useEditorStore.getState().setCurrentTime(timeNow);
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
        const tl = getActiveTimeline();
        if (tl) tl.time(rounded);
        if (this.onPlayheadUpdate) this.onPlayheadUpdate(rounded);
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
        const { animatedObjects } = useEditorStore.getState();
        compileTimeline(animatedObjects, this.fabricCanvas);
    }

    private startRafLoop = () => {
        const update = () => {
            const { duration, setIsPlaying } = useEditorStore.getState();
            const tl = getActiveTimeline();
            const timeNow = tl ? tl.time() : 0;

            if (this.onPlayheadUpdate) {
                this.onPlayheadUpdate(timeNow);
            }

            const now = performance.now();
            if (now - this.lastStoreSync > 100) {
                const { currentTime } = useEditorStore.getState();
                if (timeNow !== currentTime) {
                    useEditorStore.getState().setCurrentTime(timeNow);
                }
                this.lastStoreSync = now;
            }

            if (timeNow >= duration) {
                setIsPlaying(false);
                this.stopRafLoop();
                if (this.onPlayheadUpdate) this.onPlayheadUpdate(duration);
                useEditorStore.getState().setCurrentTime(duration);
                return;
            }
            if (tl && tl.isActive()) {
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
        this.onPlayheadUpdate = null;
    }
}

export const timelineController = new TimelineController();
