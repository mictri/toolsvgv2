import { useEffect, useRef, useCallback, useState } from 'react';
import {
    useEditorStore, PROPERTY_LABELS,
    PROPERTY_ICONS, SUBTRACK_EASING_OPTIONS, AnimatableProperty, LoopMode,
} from '../../store/editorStore';
import { compileTimeline, getActiveTimeline } from './timelineCompiler';
import { fabric } from 'fabric';

interface TimelineProps {
    fabricCanvas: fabric.Canvas | null;
}

export default function Timeline({ fabricCanvas }: TimelineProps) {
    const {
        isPlaying, currentTime, duration, layers,
        selectedLayerId, selectedKeyframeId, loopMode, timelineZoom,
        animatedObjects,
        setIsPlaying, setCurrentTime, setDuration, setLoopMode, setTimelineZoom,
        addPropertyTrack, addKeyframeToTrack, updateKeyframeInTrack,
        removeKeyframeFromTrack, setAnimatedObjectExpanded,
        selectKeyframe, selectLayer, saveToStorage,
    } = useEditorStore();

    const LABEL_WIDTH = 256; // w-64 = 16rem = 256px
    const trackRef = useRef<HTMLDivElement | null>(null);
    const isDraggingScrub = useRef(false);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const [showAddProperty, setShowAddProperty] = useState(false);
    const addPropertyRef = useRef<HTMLDivElement>(null);

    const clampTime = useCallback((time: number) => Math.min(duration, Math.max(0, time)), [duration]);

    useEffect(() => { saveToStorage(); }, [layers, animatedObjects, duration, loopMode]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (addPropertyRef.current && !addPropertyRef.current.contains(e.target as Node)) setShowAddProperty(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto re-compile khi loopMode, animatedObjects, hoặc fabricCanvas thay đổi
    useEffect(() => {
        const tl = compileTimeline(animatedObjects, fabricCanvas, loopMode as LoopMode);
        if (isPlaying && tl) {
            tl.play();
        }
    }, [loopMode, animatedObjects, fabricCanvas]);

    const handleTogglePlay = () => {
        const nextPlaying = !isPlaying;
        setIsPlaying(nextPlaying);
        let tl = getActiveTimeline();
        if (!tl) {
            tl = compileTimeline(animatedObjects, fabricCanvas, loopMode as LoopMode);
        }
        if (tl) {
            if (nextPlaying) {
                if (loopMode === 'none' && currentTime >= duration) {
                    setCurrentTime(0);
                    tl.time(0);
                }
                tl.play();
            } else {
                tl.pause();
            }
        }
    };

    const handleScrub = (time: number) => {
        const clamped = clampTime(time);
        const roundedTime = Math.round(clamped * 100) / 100;
        setCurrentTime(roundedTime);
        const tl = getActiveTimeline();
        if (tl) tl.time(roundedTime);
        if (fabricCanvas) fabricCanvas.renderAll();
        window.dispatchEvent(new CustomEvent('timeline-scrub', { detail: { time: roundedTime } }));
    };

    const getCurrentPropertyValue = useCallback((layerId: string, property: AnimatableProperty): any => {
        const obj = fabricCanvas?.getObjects().find(o => o.data?.id === layerId);
        if (!obj) return undefined;
        switch (property) {
            case 'position': return { left: Math.round(obj.left || 0), top: Math.round(obj.top || 0) };
            case 'scale': return { scaleX: Number((obj.scaleX ?? 1).toFixed(3)), scaleY: Number((obj.scaleY ?? 1).toFixed(3)) };
            case 'rotate': return Math.round(obj.angle || 0);
            case 'opacity': return Number((obj.opacity ?? 1).toFixed(2));
            case 'skew': return { skewX: obj.skewX ?? 0, skewY: obj.skewY ?? 0 };
            case 'morph': return (obj as any).path ?? '';
            case 'fillColor': return (obj.fill as string) ?? '#6366f1';
            case 'fillOpacity': return (obj as any).fillOpacity ?? 1;
            case 'strokeColor': return obj.stroke ?? '#4f46e5';
            case 'strokeOpacity': return (obj as any).strokeOpacity ?? 1;
            case 'strokeWidth': return obj.strokeWidth ?? 0;
            case 'strokeOffset': return (obj as any).strokeDashOffset ?? 0;
            case 'strokeDashes': return (obj as any).strokeDashArray ?? [0];
            default: return 0;
        }
    }, [fabricCanvas]);

    const handleTrackMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const trackLeft = rect.left + LABEL_WIDTH;
        const trackWidth = rect.width - LABEL_WIDTH;
        const calcTime = (clientX: number) => clampTime(((clientX - trackLeft) / trackWidth) * duration);
        handleScrub(calcTime(e.clientX));
        selectKeyframe(null);
        isDraggingScrub.current = true;
        const onMouseMove = (me: MouseEvent) => handleScrub(calcTime(me.clientX));
        const onMouseUp = () => { isDraggingScrub.current = false; window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleKeyframeDrag = (e: React.MouseEvent, kfId: string) => {
        e.stopPropagation(); e.preventDefault();
        selectKeyframe(kfId);
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const trackLeft = rect.left + LABEL_WIDTH;
        const trackWidth = rect.width - LABEL_WIDTH;
        const onMouseMove = (me: MouseEvent) => {
            const pct = Math.max(0, Math.min(1, (me.clientX - trackLeft) / trackWidth));
            const newTime = Math.round(pct * duration * 100) / 100;
            for (const ao of useEditorStore.getState().animatedObjects) {
                for (const track of ao.tracks) {
                    const kf = track.keyframes.find(k => k.id === kfId);
                    if (kf) {
                        updateKeyframeInTrack(ao.id, track.property, kfId, { time: newTime });
                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                        return;
                    }
                }
            }
        };
        const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleKeyframeDelete = (e: React.KeyboardEvent) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKeyframeId) {
            e.preventDefault();
            e.stopPropagation();
            const store = useEditorStore.getState();
            for (const ao of store.animatedObjects) {
                for (const track of ao.tracks) {
                    const targetKf = track.keyframes.find(k => k.id === selectedKeyframeId);
                    if (targetKf) {
                        removeKeyframeFromTrack(ao.id, track.property, selectedKeyframeId);
                        selectKeyframe(null);
                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                        return;
                    }
                }
            }
        }
    };

    const handleAddProperty = (property: AnimatableProperty) => {
        const layerId = selectedLayerId;
        if (!layerId) return;
        const obj = fabricCanvas?.getObjects().find(o => ((o as any).id === layerId || o.data?.id === layerId));
        const baseState = obj ? {
            left: obj.left || 0,
            top: obj.top || 0,
            scaleX: obj.scaleX || 1,
            scaleY: obj.scaleY || 1,
            angle: obj.angle || 0,
            opacity: obj.opacity ?? 1,
            fill: (obj.fill as string) || '#000000',
            stroke: (obj.stroke as string) || '',
        } : undefined;
        addPropertyTrack(layerId, property, baseState);
        setShowAddProperty(false);
    };

    const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    const timeMarkers: number[] = [];
    const markerCount = Math.max(5, Math.round(duration));
    for (let i = 0; i <= markerCount; i++) {
        timeMarkers.push(i * (duration / markerCount));
    }

    const animatedLayerIds = animatedObjects.map(ao => ao.id);

    return (
        <div ref={timelineRef} className="border-t border-slate-800 bg-slate-950 px-4 py-3 flex flex-col gap-3 select-none w-full text-slate-200 max-h-[220px]"
            tabIndex={0} onKeyDown={handleKeyframeDelete}>
            {/* Controls Bar */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={handleTogglePlay}
                        className={`h-7 px-3 rounded font-bold text-xs transition-all ${isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-800 text-[11px]">
                        <button onClick={() => setLoopMode('none')}
                            className={`px-2 py-1 rounded-l ${loopMode === 'none' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            title="Play Once">▶1</button>
                        <button onClick={() => setLoopMode('loop')}
                            className={`px-2 py-1 ${loopMode === 'loop' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            title="Loop">🔁</button>
                        <button onClick={() => setLoopMode('pingpong')}
                            className={`px-2 py-1 rounded-r ${loopMode === 'pingpong' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            title="Ping Pong">🔃</button>
                    </div>

                    {/* Global +Animate button (dropup) */}
                    <div className="relative" ref={addPropertyRef}>
                        <button onClick={() => {
                            setCurrentTime(0);
                            const tl = getActiveTimeline();
                            if (tl) tl.seek(0);
                            if (fabricCanvas) fabricCanvas.renderAll();
                            setShowAddProperty(!showAddProperty);
                        }}
                            disabled={!selectedLayerId}
                            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${!selectedLayerId ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                            <span className="text-xs font-bold">+</span>Animate<span className="text-[9px] opacity-70">▲</span>
                        </button>
                        {showAddProperty && selectedLayerId && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 max-h-80 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 shadow-2xl z-[999] p-1.5">
                                {[
                                    { label: 'TRANSFORMS', props: ['position', 'scale', 'rotate', 'skew'] as AnimatableProperty[] },
                                    { label: 'APPEARANCE', props: ['opacity', 'fillColor'] as AnimatableProperty[] },
                                    { label: 'STROKE', props: ['strokeColor', 'strokeOpacity', 'strokeWidth', 'strokeOffset', 'strokeDashes'] as AnimatableProperty[] },
                                    { label: 'ADVANCED', props: ['morph'] as AnimatableProperty[] },
                                ].map((group, gi) => (
                                    <div key={group.label}>
                                        {gi > 0 && <div className="h-px bg-slate-800 mx-1 my-1.5" />}
                                        <div className="text-[8px] font-bold text-slate-600 uppercase tracking-wider px-2 py-1">{group.label}</div>
                                        {group.props.map((prop) => {
                                            const isMorph = prop === 'morph';
                                            const obj = fabricCanvas?.getObjects().find(o => o.data?.id === selectedLayerId);
                                            const canMorph = isMorph ? obj?.type === 'path' : true;
                                            return (
                                                <button key={prop}
                                                    onClick={() => canMorph && handleAddProperty(prop)}
                                                    disabled={isMorph && !canMorph}
                                                    title={isMorph && !canMorph ? 'Convert to Path to enable Morph' : PROPERTY_LABELS[prop]}
                                                    className={`flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${!canMorph ? 'text-slate-700 cursor-not-allowed' : 'text-slate-300 hover:bg-slate-800'}`}>
                                                    <span className={!canMorph ? 'opacity-30' : ''}>{PROPERTY_ICONS[prop]}</span>
                                                    <span className={!canMorph ? 'opacity-30' : ''}>{PROPERTY_LABELS[prop]}</span>
                                                    {isMorph && !canMorph && <span className="ml-auto text-[8px] text-slate-700 italic">(required)</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>


                    <div className="text-xs text-slate-400 font-mono">
                        <span className="text-indigo-400 font-bold">{currentTime.toFixed(2)}s</span> / {duration.toFixed(1)}s
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <span>Dur:</span>
                        <input type="number" min={1} max={60} step={0.5} value={duration}
                            onChange={(e) => setDuration(Math.max(1, Math.min(60, parseFloat(e.target.value) || 5)))}
                            className="w-12 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                        <span>s</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => setTimelineZoom(timelineZoom - 20)}
                            className="px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 rounded">−</button>
                        <span className="text-[10px] font-mono text-slate-500 min-w-[32px] text-center">{timelineZoom}%</span>
                        <button onClick={() => setTimelineZoom(timelineZoom + 20)}
                            className="px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 rounded">+</button>
                    </div>

                </div>
            </div>

            {/* === TIMELINE TRACKS === */}
            <div className="flex flex-col w-full bg-slate-900/20 rounded border border-slate-900 overflow-y-auto min-h-0">
                {/* Ruler Header */}
                <div className="flex w-full border-b border-slate-900 bg-slate-950/40 text-[10px] text-slate-500 font-mono h-6 items-center">
                    <div className="w-64 px-3 font-semibold border-r border-slate-900 text-[11px] shrink-0">Animation</div>
                    <div className="flex-1 relative h-full overflow-hidden" style={{ zoom: timelineZoom / 100 }}>
                        {timeMarkers.map((t, i) => (
                            <span key={i}
                                className="absolute text-[9px] text-slate-600 top-0"
                                style={{ left: `${(t / duration) * 100}%`, transform: 'translateX(-50%)' }}>{t.toFixed(1)}s</span>
                        ))}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-40 pointer-events-none shadow-lg shadow-rose-500/50"
                            style={{ left: `${playheadPercent}%` }} />
                    </div>
                </div>

                {animatedLayerIds.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-600 italic">
                        {selectedLayerId
                            ? <>Select a property from <span className="text-purple-400 font-bold">[+ Animate]</span> to start.</>
                            : <>Select an object on canvas then click <span className="text-purple-400 font-bold">[+ Animate]</span>.</>}
                    </div>
                ) : (
                    <div ref={trackRef} className="flex flex-col divide-y divide-slate-900/60 relative"
                        onMouseDown={handleTrackMouseDown}>
                        {/* Playhead line spanning all tracks */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-30 pointer-events-none shadow-lg shadow-rose-500/50"
                            style={{ left: `calc(${LABEL_WIDTH}px + (100% - ${LABEL_WIDTH}px) * ${playheadPercent / 100})` }} />
                        <div className="absolute top-0 w-3 h-3 -ml-1.5 -mt-1 z-40 cursor-pointer"
                            style={{ left: `calc(${LABEL_WIDTH}px + (100% - ${LABEL_WIDTH}px) * ${playheadPercent / 100})` }} />

                        {animatedObjects.map((ao) => {
                            const layer = layers.find(l => l.id === ao.id);
                            if (!layer) return null;
                            const isExpanded = ao.expanded;

                            return (
                                <div key={ao.id}>
                                    {/* Parent Layer Row */}
                                    <div className={`flex w-full h-8 items-center transition-colors ${selectedLayerId === ao.id ? 'bg-indigo-950/20' : 'hover:bg-slate-900/10'}`}
                                        onClick={() => {
                                            selectLayer(ao.id);
                                            selectKeyframe(null);
                                            const obj = fabricCanvas?.getObjects().find(o => o.data?.id === ao.id);
                                            if (obj) fabricCanvas?.setActiveObject(obj).renderAll();
                                        }}>
                                        <div className="w-64 px-2 border-r border-slate-900 flex items-center gap-1 bg-slate-950/20 h-full shrink-0">
                                            <button onClick={(e) => { e.stopPropagation(); setAnimatedObjectExpanded(ao.id, !isExpanded); }}
                                                className="text-[10px] text-slate-500 hover:text-white w-3">
                                                {isExpanded ? '▼' : '▶'}
                                            </button>
                                            <span className={`text-xs truncate max-w-[120px] ${selectedLayerId === ao.id ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
                                                {layer.name}
                                            </span>
                                        </div>
                                        <div className="flex-1 h-full" />
                                    </div>

                                    {/* Child Property Track Rows */}
                                    {isExpanded && ao.tracks.map((track) => {
                                        return (
                                        <div key={track.property}
                                            className={`flex w-full h-7 items-center transition-colors border-t border-slate-900/30 ${!track.enabled ? 'opacity-40' : ''}`}>
                                            <div className="w-64 px-2 border-r border-slate-900 flex items-center gap-0.5 bg-slate-950/10 h-full shrink-0 pl-8">
                                                <button
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => { e.stopPropagation(); useEditorStore.getState().toggleTrackEnabled(ao.id, track.property); }}
                                                    className="text-[9px] text-slate-600 hover:text-white">
                                                    {track.enabled ? '👁' : '◡'}
                                                </button>
                                                <span className="text-[10px] font-medium text-slate-300 shrink-0">
                                                    {PROPERTY_LABELS[track.property]}
                                                </span>
                                                {/* Per-track Easing Select */}
                                                <select
                                                    value={selectedKeyframeId && track.keyframes.some(k => k.id === selectedKeyframeId) ? track.keyframes.find(k => k.id === selectedKeyframeId)!.easing : track.defaultEasing}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        const kfOnTrack = selectedKeyframeId && track.keyframes.find(k => k.id === selectedKeyframeId);
                                                        if (kfOnTrack) {
                                                            updateKeyframeInTrack(ao.id, track.property, kfOnTrack.id, { easing: e.target.value });
                                                        } else {
                                                            useEditorStore.getState().updateSubTrackEasing(ao.id, track.property, e.target.value);
                                                        }
                                                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="text-[10px] py-0.5 px-1 bg-slate-800 border border-slate-700 rounded text-slate-300 min-w-[60px] cursor-pointer focus:outline-none focus:border-indigo-500 ml-1 z-30">
                                                    {SUBTRACK_EASING_OPTIONS.map(opt => (
                                                        <option key={opt.id} value={opt.id} className="text-slate-300">{opt.label}</option>
                                                    ))}
                                                </select>
                                                {/* Per-track Add Keyframe */}
                                                <button
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const store = useEditorStore.getState();
                                                        const value = getCurrentPropertyValue(ao.id, track.property);
                                                        if (value !== undefined) {
                                                            const savedTime = store.currentTime;
                                                            addKeyframeToTrack(ao.id, track.property, savedTime, value, track.defaultEasing);
                                                            const updated = useEditorStore.getState();
                                                            compileTimeline(updated.animatedObjects, fabricCanvas);
                                                            setCurrentTime(savedTime);
                                                            const tlRestore = getActiveTimeline();
                                                            if (tlRestore) tlRestore.time(savedTime);
                                                        }
                                                    }}
                                                    className="text-[10px] font-semibold text-emerald-400 hover:text-white bg-emerald-950/50 hover:bg-emerald-600 border border-emerald-500/50 px-1.5 py-0.5 h-5 flex items-center rounded ml-1 transition-colors shrink-0"
                                                    title="Add keyframe at current playhead">
                                                    + Add
                                                </button>
                                                {/* Remove entire animation track for this object */}
                                                <button
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        const obj = fabricCanvas?.getObjects().find(o => ((o as any).id === ao.id || o.data?.id === ao.id));
                                                        if (obj && ao.baseState) {
                                                            obj.set({
                                                                left: ao.baseState.left,
                                                                top: ao.baseState.top,
                                                                scaleX: ao.baseState.scaleX,
                                                                scaleY: ao.baseState.scaleY,
                                                                angle: ao.baseState.angle,
                                                                opacity: ao.baseState.opacity,
                                                                fill: ao.baseState.fill,
                                                                stroke: ao.baseState.stroke,
                                                            });
                                                            obj.setCoords();
                                                            fabricCanvas?.renderAll();
                                                        }
                                                        useEditorStore.getState().removeAnimatedObject(ao.id);
                                                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                                                    }}
                                                    className="text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 rounded p-1 transition-colors ml-0.5"
                                                    title="Remove all animation for this layer">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                </button>
                                                <span className="text-[9px] text-slate-600 ml-auto">{track.keyframes.length}k</span>
                                            </div>
                                            <div className="flex-1 h-full relative cursor-pointer overflow-hidden"
                                                style={{ zoom: timelineZoom / 100 }}
                                                onMouseDown={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                                    handleScrub(pct * duration);
                                                }}
                                                onDoubleClick={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                                    const time = Math.round(pct * duration * 100) / 100;
                                                    const value = getCurrentPropertyValue(ao.id, track.property);
                                                    if (value !== undefined) {
                                                        addKeyframeToTrack(ao.id, track.property, time, value, 'power2.out');
                                                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                                                    }
                                                }}>
                                                {track.keyframes.map((kf) => {
                                                    const kfPct = Math.min(100, Math.max(0, (kf.time / duration) * 100));
                                                    const isSelectedKf = selectedKeyframeId === kf.id;
                                                    return (
                                                        <div key={kf.id}
                                                            onMouseDown={(e) => handleKeyframeDrag(e, kf.id)}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                timelineRef.current?.focus();
                                                                handleScrub(kf.time);
                                                                selectKeyframe(kf.id);
                                                            }}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                selectKeyframe(kf.id);
                                                                removeKeyframeFromTrack(ao.id, track.property, kf.id);
                                                                selectKeyframe(null);
                                                                compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                                                            }}
                                                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border transition-all cursor-grab active:cursor-grabbing z-20 shadow-md ${isSelectedKf ? 'bg-rose-400 border-white scale-125 shadow-rose-500/60 ring-2 ring-rose-500/30' : 'bg-indigo-400 border-slate-950 hover:bg-indigo-300'}`}
                                                            style={{ left: `${kfPct}%` }}
                                                            title={`${kf.time.toFixed(2)}s [${track.property}]`} />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
}
