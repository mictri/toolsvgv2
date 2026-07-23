import { useEffect, useRef, useCallback, useState } from 'react';
import { globalGsapTimeline } from './gsapInstance';
import {
    useEditorStore, EASING_OPTIONS, PROPERTY_TYPES, PROPERTY_LABELS,
    PROPERTY_ICONS, PROPERTY_PRESETS, AnimatableProperty,
} from '../../store/editorStore';
import { compileTimeline } from './timelineCompiler';
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
        selectKeyframe, selectLayer, saveToStorage, applyPropertyPreset,
    } = useEditorStore();

    const requestRef = useRef<number | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const isDraggingScrub = useRef(false);
    const [showEasingPicker, setShowEasingPicker] = useState(false);
    const [showAddProperty, setShowAddProperty] = useState(false);
    const [activeTrackPreset, setActiveTrackPreset] = useState<string | null>(null);
    const easingRef = useRef<HTMLDivElement>(null);
    const addPropertyRef = useRef<HTMLDivElement>(null);
    const trackPresetRef = useRef<HTMLDivElement>(null);

    const clampTime = useCallback((time: number) => Math.min(duration, Math.max(0, time)), [duration]);

    useEffect(() => { saveToStorage(); }, [layers, animatedObjects, duration, loopMode]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (easingRef.current && !easingRef.current.contains(e.target as Node)) setShowEasingPicker(false);
            if (addPropertyRef.current && !addPropertyRef.current.contains(e.target as Node)) setShowAddProperty(false);
            if (trackPresetRef.current && !trackPresetRef.current.contains(e.target as Node)) setActiveTrackPreset(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const updatePlayhead = () => {
        if (globalGsapTimeline) {
            const timeNow = globalGsapTimeline.time();
            setCurrentTime(clampTime(timeNow));
            if (timeNow >= duration) {
                if (loopMode === 'loop') {
                    globalGsapTimeline.time(0);
                    globalGsapTimeline.play();
                } else if (loopMode === 'pingpong') {
                    globalGsapTimeline.reverse();
                } else {
                    setIsPlaying(false);
                }
            }
            if (loopMode === 'pingpong' && timeNow <= 0) {
                globalGsapTimeline.play();
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
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [isPlaying, loopMode]);

    const togglePlayMode = () => {
        if (currentTime >= duration) handleScrub(0);
        setIsPlaying(!isPlaying);
    };

    const handleScrub = (time: number) => {
        const clamped = clampTime(time);
        const roundedTime = Math.round(clamped * 100) / 100;
        setCurrentTime(roundedTime);
        if (globalGsapTimeline) globalGsapTimeline.time(roundedTime);
        if (fabricCanvas) fabricCanvas.renderAll();
        window.dispatchEvent(new CustomEvent('timeline-scrub', { detail: { time: roundedTime } }));
    };

    const handleTrackMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const calcTime = (clientX: number) => clampTime(((clientX - rect.left) / rect.width) * duration);
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
        const onMouseMove = (me: MouseEvent) => {
            const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
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
            for (const ao of useEditorStore.getState().animatedObjects) {
                for (const track of ao.tracks) {
                    if (track.keyframes.find(k => k.id === selectedKeyframeId)) {
                        removeKeyframeFromTrack(ao.id, track.property, selectedKeyframeId);
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
        addPropertyTrack(layerId, property);
        const obj = fabricCanvas?.getObjects().find(o => o.data?.id === layerId);
        if (obj) {
            let value: any;
            switch (property) {
                case 'position': value = { left: Math.round(obj.left || 0), top: Math.round(obj.top || 0) }; break;
                case 'scale': value = { scaleX: Number((obj.scaleX ?? 1).toFixed(3)), scaleY: Number((obj.scaleY ?? 1).toFixed(3)) }; break;
                case 'rotate': value = Math.round(obj.angle || 0); break;
                case 'opacity': value = Number((obj.opacity ?? 1).toFixed(2)); break;
                case 'skew': value = { skewX: obj.skewX ?? 0, skewY: obj.skewY ?? 0 }; break;
                case 'morph': value = (obj as any).path ?? ''; break;
                case 'fillColor': value = (obj.fill as string) ?? '#6366f1'; break;
                case 'fillOpacity': value = (obj as any).fillOpacity ?? 1; break;
                case 'strokeColor': value = obj.stroke ?? '#4f46e5'; break;
                case 'strokeOpacity': value = (obj as any).strokeOpacity ?? 1; break;
                case 'strokeWidth': value = obj.strokeWidth ?? 0; break;
                case 'strokeOffset': value = (obj as any).strokeDashOffset ?? 0; break;
                case 'strokeDashes': value = (obj as any).strokeDashArray ?? [0]; break;
                default: value = 0;
            }
            addKeyframeToTrack(layerId, property, 0, value, 'none');
            addKeyframeToTrack(layerId, property, duration, value, 'none');
        }
        setShowAddProperty(false);
        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
    };

    const handleApplyTrackPreset = (property: AnimatableProperty, presetId: string) => {
        if (!selectedLayerId || !fabricCanvas) return;
        applyPropertyPreset(property, presetId, selectedLayerId, currentTime, fabricCanvas);
        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
        setActiveTrackPreset(null);
    };

    const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    const selectedKf = (() => {
        if (!selectedKeyframeId) return null;
        for (const ao of animatedObjects) {
            for (const track of ao.tracks) {
                const kf = track.keyframes.find(k => k.id === selectedKeyframeId);
                if (kf) return { kf, layerId: ao.id, property: track.property };
            }
        }
        return null;
    })();

    const timeMarkers: number[] = [];
    const markerCount = Math.max(5, Math.round(duration));
    for (let i = 0; i <= markerCount; i++) {
        timeMarkers.push(i * (duration / markerCount));
    }

    const animatedLayerIds = animatedObjects.map(ao => ao.id);

    return (
        <div className="border-t border-slate-800 bg-slate-950 px-4 py-3 flex flex-col gap-3 select-none w-full text-slate-200"
            tabIndex={0} onKeyDown={handleKeyframeDelete}>
            {/* Controls Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={togglePlayMode}
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
                    <div className="text-xs text-slate-400 font-mono">
                        <span className="text-indigo-400 font-bold">{currentTime.toFixed(2)}s</span> / {duration.toFixed(1)}s
                    </div>
                </div>

                <div className="flex items-center gap-2">
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
                    {/* Global +Animate button (dropup) */}
                    <div className="relative" ref={addPropertyRef}>
                        <button onClick={() => setShowAddProperty(!showAddProperty)}
                            disabled={!selectedLayerId}
                            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${!selectedLayerId ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                            <span className="text-xs font-bold">+</span>Animate<span className="text-[9px] opacity-70">▲</span>
                        </button>
                        {showAddProperty && selectedLayerId && (
                            <div className="absolute bottom-full right-0 mb-2 w-44 max-h-72 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 shadow-2xl z-[999] p-1.5">
                                {PROPERTY_TYPES.map((prop) => (
                                    <button key={prop} onClick={() => handleAddProperty(prop)}
                                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded-md transition-colors">
                                        <span>{PROPERTY_ICONS[prop]}</span>
                                        <span>{PROPERTY_LABELS[prop]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* === TIMELINE TRACKS === */}
            <div className="flex flex-col w-full bg-slate-900/20 rounded border border-slate-900 overflow-hidden">
                {/* Ruler Header */}
                <div className="flex w-full border-b border-slate-900 bg-slate-950/40 text-[10px] text-slate-500 font-mono h-6 items-center">
                    <div className="w-56 px-3 font-semibold border-r border-slate-900 text-[11px] shrink-0">Animation</div>
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
                            style={{ left: `${playheadPercent}%` }} />
                        <div className="absolute top-0 w-3 h-3 -ml-1.5 -mt-1 z-40 cursor-pointer"
                            style={{ left: `${playheadPercent}%` }} />

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
                                        <div className="w-56 px-2 border-r border-slate-900 flex items-center gap-1 bg-slate-950/20 h-full shrink-0">
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
                                        const trackKey = `${ao.id}:${track.property}`;
                                        const presets = PROPERTY_PRESETS[track.property] || [];
                                        return (
                                        <div key={track.property}
                                            className={`flex w-full h-7 items-center transition-colors border-t border-slate-900/30 ${!track.enabled ? 'opacity-40' : ''}`}>
                                            <div className="w-56 px-2 border-r border-slate-900 flex items-center gap-1 bg-slate-950/10 h-full shrink-0 pl-8">
                                                <button onClick={(e) => { e.stopPropagation(); useEditorStore.getState().toggleTrackEnabled(ao.id, track.property); }}
                                                    className="text-[9px] text-slate-600 hover:text-white">
                                                    {track.enabled ? '👁' : '◡'}
                                                </button>
                                                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                    <span>{PROPERTY_ICONS[track.property]}</span>
                                                    <span>{PROPERTY_LABELS[track.property]}</span>
                                                </span>
                                                {/* Per-track Presets button */}
                                                {presets.length > 0 && (
                                                    <div className="relative ml-1" ref={trackPresetRef}>
                                                        <button onClick={(e) => { e.stopPropagation(); setActiveTrackPreset(activeTrackPreset === trackKey ? null : trackKey); }}
                                                            className="text-[9px] text-amber-400 hover:text-amber-300 bg-slate-800/60 hover:bg-slate-700/60 px-1 py-0.5 rounded flex items-center gap-0.5">
                                                            ✨<span className="text-[7px] opacity-70">▼</span>
                                                        </button>
                                                        {activeTrackPreset === trackKey && (
                                                            <div className="absolute bottom-full left-0 mb-2 w-36 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl z-[999] p-1">
                                                                {presets.map((p) => (
                                                                    <button key={p.id} onClick={(e) => { e.stopPropagation(); handleApplyTrackPreset(track.property, p.id); }}
                                                                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 rounded-md transition-colors">
                                                                        <span>{p.icon}</span><span>{p.label}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <span className="text-[9px] text-slate-600 ml-auto">{track.keyframes.length}k</span>
                                            </div>
                                            <div className="flex-1 h-full relative cursor-pointer overflow-hidden"
                                                style={{ zoom: timelineZoom / 100 }}
                                                onMouseDown={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                                    handleScrub(pct * duration);
                                                }}>
                                                {track.keyframes.map((kf) => {
                                                    const kfPct = Math.min(100, Math.max(0, (kf.time / duration) * 100));
                                                    const isSelectedKf = selectedKeyframeId === kf.id;
                                                    return (
                                                        <div key={kf.id}
                                                            onMouseDown={(e) => handleKeyframeDrag(e, kf.id)}
                                                            onClick={(e) => { e.stopPropagation(); handleScrub(kf.time); selectKeyframe(kf.id); }}
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

            {/* Easing Editor Footer */}
            {selectedKf && (
                <div className="flex items-center justify-between bg-slate-900/40 rounded border border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase">Easing</span>
                        <div className="relative" ref={easingRef}>
                            <button onClick={() => setShowEasingPicker(!showEasingPicker)}
                                className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded text-xs font-mono text-slate-200 flex items-center gap-2 border border-slate-700">
                                <svg width="28" height="14" viewBox="0 0 100 50" className="shrink-0">
                                    <rect width="100" height="50" rx="4" fill="#1e293b" />
                                    {(() => {
                                        const opt = EASING_OPTIONS.flatMap(g => g.items).find(i => i.id === selectedKf.kf.easing);
                                        return opt ? <path d={opt.curve} fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" /> : null;
                                    })()}
                                </svg>
                                <span>{selectedKf.kf.easing}</span>
                            </button>
                            {showEasingPicker && (
                                <div className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-[999] p-2">
                                    {EASING_OPTIONS.map((group) => (
                                        <div key={group.group} className="mb-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase px-2 py-1">{group.group}</div>
                                            {group.items.map((item) => (
                                                <button key={item.id}
                                                    onClick={() => {
                                                        updateKeyframeInTrack(selectedKf.layerId, selectedKf.property, selectedKf.kf.id, { easing: item.id });
                                                        compileTimeline(useEditorStore.getState().animatedObjects, fabricCanvas);
                                                        setShowEasingPicker(false);
                                                    }}
                                                    className={`flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${selectedKf.kf.easing === item.id ? 'bg-indigo-950/40 text-indigo-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                                                    <svg width="24" height="14" viewBox="0 0 100 50" className="shrink-0">
                                                        <rect width="100" height="50" rx="3" fill="#1e293b" />
                                                        <path d={item.curve} fill="none" stroke={selectedKf.kf.easing === item.id ? '#818cf8' : '#64748b'} strokeWidth="3" strokeLinecap="round" />
                                                    </svg>
                                                    <span>{item.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                        <span className="text-indigo-400">{PROPERTY_LABELS[selectedKf.property]}</span>
                        <span className="mx-1">|</span>
                        <span className="text-rose-400">{selectedKf.kf.time.toFixed(2)}s</span>
                        <span className="mx-1">|</span>
                        <button onClick={() => { selectKeyframe(null); }} className="text-slate-500 hover:text-white">✕</button>
                    </div>
                </div>
            )}

            {selectedKeyframeId && (
                <div className="text-[11px] text-rose-400 text-center font-mono">
                    🔴 Keyframe selected. <span className="underline font-bold">[Delete]</span> to remove.
                </div>
            )}
        </div>
    );
}
