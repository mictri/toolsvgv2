import React, { useEffect, useRef, useCallback } from 'react';
import { globalGsapTimeline } from './gsapInstance';
import { useEditorStore } from '../../store/editorStore';
import { compileTimeline } from './timelineCompiler';
import { fabric } from 'fabric';

interface TimelineProps {
    fabricCanvas: fabric.Canvas | null;
}

export default function Timeline({ fabricCanvas }: TimelineProps) {
    const {
        isPlaying, currentTime, duration, keyframes, layers, selectedLayerId, animatedLayerIds, selectedKeyframeId,
        setIsPlaying, setCurrentTime, enableAnimation, addMasterKeyframe, updateKeyframeTime, selectKeyframe, selectLayer
    } = useEditorStore();

    const requestRef = useRef<number | null>(null);
    const trackRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const isDraggingScrub = useRef(false);

    const clampTime = useCallback((time: number) => {
        return Math.min(duration, Math.max(0, time));
    }, [duration]);

    const updatePlayhead = () => {
        if (globalGsapTimeline) {
            const timeNow = globalGsapTimeline.time();
            setCurrentTime(clampTime(timeNow));

            if (timeNow >= duration) {
                setIsPlaying(false);
            }
        }
        if (globalGsapTimeline.isActive()) {
            requestRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    useEffect(() => {
        if (isPlaying) {
            globalGsapTimeline.play();
            requestRef.current = requestAnimationFrame(updatePlayhead);
        } else {
            globalGsapTimeline.pause();
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying]);

    const togglePlayMode = () => {
        if (currentTime >= duration) {
            handleScrub(0);
        }
        setIsPlaying(!isPlaying);
    };

    const handleScrub = (time: number) => {
        const clamped = clampTime(time);
        const roundedTime = Math.round(clamped * 100) / 100;
        setCurrentTime(roundedTime);

        if (globalGsapTimeline) {
            globalGsapTimeline.time(roundedTime);
        }

        if (fabricCanvas) {
            fabricCanvas.renderAll();
        }

        window.dispatchEvent(new CustomEvent('timeline-scrub', { detail: { time: roundedTime } }));
    };

    /**
     * Scrub trên track — dùng getBoundingClientRect của chính track (flex-1)
     * để đồng bộ với vị trí playhead line và keyframe diamonds (cũng trong flex-1).
     */
    const handleTrackMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const track = e.currentTarget as HTMLDivElement;
        const rect = track.getBoundingClientRect();

        const calcTime = (clientX: number) => {
            const ratio = (clientX - rect.left) / rect.width;
            return clampTime(ratio * duration);
        };

        handleScrub(calcTime(e.clientX));
        selectKeyframe(null);
        isDraggingScrub.current = true;

        const onMouseMove = (moveEvent: MouseEvent) => {
            handleScrub(calcTime(moveEvent.clientX));
        };

        const onMouseUp = () => {
            isDraggingScrub.current = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleKeyframeDrag = (e: React.MouseEvent, kfId: string, layerId: string) => {
        e.stopPropagation();
        e.preventDefault();
        selectKeyframe(kfId);
        selectLayer(layerId);

        const trackElement = trackRefs.current[layerId];
        if (!trackElement) return;

        const trackBounds = trackElement.getBoundingClientRect();

        const onMouseMove = (moveEvent: MouseEvent) => {
            const relativeX = moveEvent.clientX - trackBounds.left;
            const percentage = Math.max(0, Math.min(1, relativeX / trackBounds.width));
            const newTime = Math.round(percentage * duration * 100) / 100;

            updateKeyframeTime(kfId, newTime);
            compileTimeline(useEditorStore.getState().keyframes, fabricCanvas);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /** % playhead, luôn trong [0%, 100%] */
    const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    return (
        <div className="border-t border-slate-800 bg-slate-950 p-4 flex flex-col gap-4 select-none w-full text-slate-200">

            {/* Top Header Controls */}
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={togglePlayMode}
                        className={`h-8 px-4 rounded font-bold text-xs transition-all ${isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                    >
                        {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
                    </button>
                    <div className="text-xs text-slate-400 font-mono">
                        Playhead: <span className="text-indigo-400 font-bold">{currentTime.toFixed(2)}s</span> / {duration}s
                    </div>
                </div>

                <div className="flex gap-2">
                    {layers.map(layer => !animatedLayerIds.includes(layer.id) && (
                        <button
                            key={layer.id}
                            onClick={() => enableAnimation(layer.id)}
                            className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-[11px] font-semibold"
                        >
                            🎬 Add {layer.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* === MULTI-TRACK TIMELINE === */}
            <div className="flex flex-col w-full bg-slate-900/20 rounded border border-slate-900 overflow-hidden">
                {/* Header — time ruler + playhead line bên trong flex-1 (ko bao gồm cột title) */}
                <div className="flex w-full border-b border-slate-900 bg-slate-950/40 text-[10px] text-slate-500 font-mono h-6 items-center">
                    <div className="w-56 px-3 font-semibold border-r border-slate-900">Layers Effect Track</div>
                    <div className="flex-1 relative h-full flex justify-between px-4 items-center pointer-events-none">
                        <span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span><span>5s</span>
                        {/* Playhead line trong header — position theo flex-1 (ko bao gồm w-56) */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-30 pointer-events-none shadow-lg shadow-rose-500/50"
                            style={{ left: `${playheadPercent}%` }}
                        />
                    </div>
                </div>

                {animatedLayerIds.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-600 italic">No animated tracks yet. Click "Add to Timeline" above or select layer and move properties.</div>
                ) : (
                    <div className="flex flex-col divide-y divide-slate-900/60">
                        {animatedLayerIds.map((layerId) => {
                            const currentLayer = layers.find(l => l.id === layerId);
                            if (!currentLayer) return null;

                            const layerKfs = keyframes.filter(k => k.layerId === layerId);
                            const isSelectedLayer = selectedLayerId === layerId;

                            return (
                                <div
                                    key={layerId}
                                    className={`flex w-full h-10 items-center transition-colors ${isSelectedLayer ? 'bg-indigo-950/20' : 'hover:bg-slate-900/10'}`}
                                    onClick={() => {
                                        selectLayer(layerId);
                                        selectKeyframe(null);
                                        const obj = fabricCanvas?.getObjects().find(o => o.data?.id === layerId);
                                        if (obj) fabricCanvas?.setActiveObject(obj).renderAll();
                                    }}
                                >
                                    <div className="w-56 px-3 border-r border-slate-900 flex items-center justify-between bg-slate-950/20 h-full">
                                        <span className={`text-xs font-medium truncate max-w-[110px] ${isSelectedLayer ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
                                            {currentLayer.name}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                addMasterKeyframe(layerId, currentTime, fabricCanvas);
                                                compileTimeline(useEditorStore.getState().keyframes, fabricCanvas);
                                            }}
                                            className="bg-purple-600/90 hover:bg-purple-500 text-white font-bold text-[10px] px-2 py-0.5 rounded"
                                        >
                                            ◆ Keyframe
                                        </button>
                                    </div>

                                    {/* Track row — flex-1, chứa keyframe diamonds + playhead line */}
                                    <div
                                        ref={(el) => { trackRefs.current[layerId] = el; }}
                                        className="flex-1 h-full relative bg-slate-900/10 cursor-pointer"
                                        onMouseDown={handleTrackMouseDown}
                                    >
                                        {layerKfs.map((kf) => {
                                            const kfPercent = Math.min(100, Math.max(0, (kf.time / duration) * 100));
                                            const isSelectedKf = selectedKeyframeId === kf.id;

                                            return (
                                                <div
                                                    key={kf.id}
                                                    onMouseDown={(e) => handleKeyframeDrag(e, kf.id, layerId)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleScrub(kf.time);
                                                        selectKeyframe(kf.id);
                                                    }}
                                                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 border transition-all cursor-grab active:cursor-grabbing z-30 shadow-md ${isSelectedKf
                                                        ? 'bg-rose-400 border-white scale-125 shadow-rose-500/60 ring-2 ring-rose-500/30'
                                                        : 'bg-purple-400 border-slate-950 hover:bg-purple-300'
                                                        }`}
                                                    style={{ left: `${kfPercent}%` }}
                                                />
                                            );
                                        })}

                                        {/* Playhead line dọc trong track row — position theo flex-1 (giống keyframe diamonds) */}
                                        <div
                                            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-20 pointer-events-none shadow-lg shadow-rose-500/50"
                                            style={{ left: `${playheadPercent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Hướng dẫn */}
            {selectedKeyframeId ? (
                <div className="text-[11px] text-rose-400 text-center font-mono">
                    🔴 Đang chọn Keyframe. Nhấn <span className="underline font-bold">[Delete]</span> để xóa.
                </div>
            ) : selectedLayerId ? ("") : null}

        </div>
    );
}
