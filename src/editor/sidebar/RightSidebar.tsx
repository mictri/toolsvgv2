import { useEffect, useState, useMemo, useCallback } from 'react';
import { useEditorStore, AnimatableProperty, ROOT_LAYER_ID } from '../../store/editorStore';
import { compileTimeline } from '../timeline/timelineCompiler';
import { fabric } from 'fabric';
import { parsePathAnchors, updatePathAnchor } from '../canvas/pathNodeEditor';
import { ChevronRight, ChevronDown, Link as LinkIcon, Unlink, ArrowUpDown, Ban, Copy } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';

interface RightSidebarProps {
    fabricCanvas: fabric.Canvas | React.MutableRefObject<fabric.Canvas | null> | null;
}

const NODE_TYPES = [
    { id: 'corner', label: 'Corner Node' },
    { id: 'smooth', label: 'Smooth Node' },
    { id: 'symmetric', label: 'Symmetric Node' },
];

const calculatePathLength = (obj: any): number => {
    if (!obj) return 0;
    if (obj.type === 'path' && obj.path) {
        try {
            const pathStr = obj.path.map((s: any) => s.join(' ')).join(' ');
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', pathStr);
            return p.getTotalLength();
        } catch (e) {
            return 0;
        }
    }
    return 0;
};

function CanvasPropertiesGroup({ fabricCanvas }: RightSidebarProps) {
    const { canvasConfig, updateCanvasConfig } = useEditorStore();
    const [aspectLocked, setAspectLocked] = useState(false);
    const [wStr, setWStr] = useState(String(canvasConfig.width));
    const [hStr, setHStr] = useState(String(canvasConfig.height));

    useEffect(() => {
        setWStr(String(canvasConfig.width));
        setHStr(String(canvasConfig.height));
    }, [canvasConfig.width, canvasConfig.height]);

    const applySize = useCallback((w: number, h: number) => {
        updateCanvasConfig({ width: w, height: h });
        const canvas = fabricCanvas && 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
        if (canvas) {
            try {
                canvas.setWidth(w);
                canvas.setHeight(h);
                canvas.renderAll();
            } catch { /* ignore */ }
        }
        window.dispatchEvent(new CustomEvent('fit-canvas-viewport'));
    }, [fabricCanvas, updateCanvasConfig]);

    const handleWidthChange = (raw: string) => {
        setWStr(raw);
        const v = parseFloat(raw);
        if (isNaN(v) || v < 1) return;
        let newH = canvasConfig.height;
        if (aspectLocked) {
            newH = v * (canvasConfig.height / canvasConfig.width);
            setHStr(String(newH));
        }
        applySize(v, newH);
    };

    const handleHeightChange = (raw: string) => {
        setHStr(raw);
        const v = parseFloat(raw);
        if (isNaN(v) || v < 1) return;
        applySize(canvasConfig.width, v);
    };

    const handleFitToContent = () => {
        const canvas = fabricCanvas && 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
        if (!canvas) return;
        const objects = canvas.getObjects();
        if (objects.length === 0) return;
        const bound = objects.reduce((b, obj) => {
            const rect = obj.getBoundingRect();
            return {
                left: Math.min(b.left, rect.left),
                top: Math.min(b.top, rect.top),
                right: Math.max(b.right, rect.left + rect.width),
                bottom: Math.max(b.bottom, rect.top + rect.height),
            };
        }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const pad = 40;
        const w = Math.round(bound.right - bound.left + pad * 2);
        const h = Math.round(bound.bottom - bound.top + pad * 2);
        applySize(w, h);
    };

    return (
        <div className="w-80 border-l border-slate-800 bg-slate-950 p-2.5 flex flex-col gap-2 text-slate-200 h-full select-none overflow-x-hidden overflow-y-auto">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-1.5">
                Canvas Properties
            </h3>

            {/* Dimensions */}
            <div>
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Dimensions</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                        <label className="text-[10px] text-slate-500">Width (px)</label>
                        <input type="number" min={1} step="any" value={wStr}
                            onChange={(e) => handleWidthChange(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Height (px)</label>
                        <input type="number" min={1} step="any" value={hStr}
                            onChange={(e) => handleHeightChange(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" />
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <button
                        onClick={() => setAspectLocked(!aspectLocked)}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${aspectLocked ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        title="Lock aspect ratio"
                    >
                        {aspectLocked ? <LinkIcon size={12} className="inline mr-1" /> : <Unlink size={12} className="inline mr-1" />}
                        Ratio
                    </button>
                    <button
                        onClick={handleFitToContent}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Fit canvas to content"
                    >
                        Fit to Content
                    </button>
                </div>
            </div>

            {/* Background */}
            <div>
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Background</span>
                <div className="flex items-center gap-2 mt-1">
                    <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        <input type="checkbox" checked={!canvasConfig.isTransparent}
                            onChange={() => {
                                updateCanvasConfig({ isTransparent: !canvasConfig.isTransparent });
                                const c = fabricCanvas && 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
                                if (c) {
                                    if (!canvasConfig.isTransparent) {
                                        c.setBackgroundColor(null as any, () => c.renderAll());
                                    } else {
                                        c.setBackgroundColor(canvasConfig.backgroundColor, () => c.renderAll());
                                    }
                                }
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500" />
                        Solid Background
                    </label>
                </div>
                {!canvasConfig.isTransparent && (
                    <div className="flex items-center gap-2 mt-1">
                        <input type="color" value={canvasConfig.backgroundColor}
                            onChange={(e) => {
                                const color = e.target.value;
                                updateCanvasConfig({ backgroundColor: color });
                                const c = fabricCanvas && 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
                                if (c) {
                                    c.setBackgroundColor(color, () => c.renderAll());
                                }
                            }}
                            className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0" />
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{canvasConfig.backgroundColor}</span>
                    </div>
                )}
            </div>

            {/* SVG Export */}
            <div>
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">SVG Export</span>
                <div className="mt-1">
                    <label className="text-[10px] text-slate-500">preserveAspectRatio</label>
                    <select value={canvasConfig.preserveAspectRatio}
                        onChange={(e) => updateCanvasConfig({ preserveAspectRatio: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500 mt-1">
                        <option value="xMidYMid meet">xMidYMid meet</option>
                        <option value="xMinYMin meet">xMinYMin meet</option>
                        <option value="xMaxYMax meet">xMaxYMax meet</option>
                        <option value="none">none</option>
                    </select>
                </div>
            </div>
        </div>
    );
}

export default function RightSidebar({ fabricCanvas }: RightSidebarProps) {
    const {
        selectedLayerId, currentTime, animatedObjects, addKeyframeToTrack, addPropertyTrack,
        activeTool, selectedNodeIndex, setSelectedNodeIndex,
    } = useEditorStore();

    const [left, setLeft] = useState<string>('0');
    const [top, setTop] = useState<string>('0');
    const [width, setWidth] = useState<string>('0');
    const [height, setHeight] = useState<string>('0');
    const [aspectLocked, setAspectLocked] = useState<boolean>(false);
    
    const [angle, setAngle] = useState<string>('0');
    const [scaleX, setScaleX] = useState<string>('1');
    const [scaleY, setScaleY] = useState<string>('1');
    const [skewX, setSkewX] = useState<string>('0');
    const [skewY, setSkewY] = useState<string>('0');
    
    const [fill, setFill] = useState('#6366f1');
    const [stroke, setStroke] = useState('');
    const [strokeWidth, setStrokeWidth] = useState<string>('1');
    const [strokeDashArray, setStrokeDashArray] = useState<string>('0');
    const [strokeDashOffset, setStrokeDashOffset] = useState<string>('0');
    const [pathLength, setPathLength] = useState<string>('0');
    const [opacity, setOpacity] = useState<string>('1');

    const [nodeX, setNodeX] = useState<string>('0');
    const [nodeY, setNodeY] = useState<string>('0');
    const [cornerRadius, setCornerRadius] = useState<string>('0');
    const [nodeType, setNodeType] = useState('corner');

    const [popover, setPopover] = useState<'fill' | 'stroke' | 'copy' | null>(null);

    const [sections, setSections] = useState({
        position: true,
        transform: true,
        appearance: true,
        path: true
    });

    const toggleSection = (sec: keyof typeof sections) => setSections(s => ({ ...s, [sec]: !s[sec] }));

    const getActiveCanvas = (): fabric.Canvas | null => {
        if (!fabricCanvas) return null;
        return 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
    };

    const autoKeyframe = (property: string, value: any) => {
        if (!selectedLayerId) return;
        const activeCanvas = getActiveCanvas();
        if (!activeCanvas) return;
        const ao = animatedObjects.find(a => a.id === selectedLayerId);
        let propTrack: AnimatableProperty | null = null;
        if (property === 'left' || property === 'top') propTrack = 'position';
        else if (property === 'angle') propTrack = 'rotate';
        else if (property === 'scaleX' || property === 'scaleY') propTrack = 'scale';
        else if (property === 'opacity') propTrack = 'opacity';
        else if (property === 'skewX' || property === 'skewY') propTrack = 'skew';
        else if (property === 'fill') propTrack = 'fillColor';
        else if (property === 'stroke') propTrack = 'strokeColor';
        else if (property === 'strokeWidth') propTrack = 'strokeWidth';
        else if (property === 'strokeDashArray') propTrack = 'strokeDashes';
        else if (property === 'strokeDashOffset') propTrack = 'strokeOffset';
        
        if (!propTrack) return;

        if (!ao) {
            const obj = activeCanvas.getObjects().find(o => ((o as any).id === selectedLayerId || o.data?.id === selectedLayerId));
            const baseState = obj ? {
                left: obj.left || 0, top: obj.top || 0, scaleX: obj.scaleX || 1, scaleY: obj.scaleY || 1,
                angle: obj.angle || 0, opacity: obj.opacity ?? 1, fill: (obj.fill as string) || '#000000', stroke: (obj.stroke as string) || ''
            } : undefined;
            addPropertyTrack(selectedLayerId, propTrack, baseState);
        } else if (!ao.tracks.find(t => t.property === propTrack)) {
            addPropertyTrack(selectedLayerId, propTrack);
        }
        addKeyframeToTrack(selectedLayerId, propTrack, currentTime, value, 'power2.out');
        compileTimeline(useEditorStore.getState().animatedObjects, activeCanvas);
    };

    const activeCanvas = getActiveCanvas();
    const selectedObj = useMemo(() => {
        if (!activeCanvas || !selectedLayerId) return null;
        return activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId || (obj as any).id === selectedLayerId) ?? null;
    }, [selectedLayerId, activeCanvas]);

    const isNodeTool = activeTool === 'node';
    const isPathObj = selectedObj instanceof fabric.Path;
    const isPolygonObj = selectedObj instanceof fabric.Polygon;

    const pathAnchors = useMemo(() => {
        if (!isNodeTool || !isPathObj || !selectedObj) return [];
        return parsePathAnchors(selectedObj as fabric.Path);
    }, [isNodeTool, isPathObj, selectedObj]);

    const polygonPoints = useMemo(() => {
        if (!isNodeTool || !isPolygonObj || !selectedObj) return [] as fabric.Point[];
        return (selectedObj as fabric.Polygon).points || [];
    }, [isNodeTool, isPolygonObj, selectedObj]);

    const selectedAnchor = useMemo(() => {
        if (!isPathObj || selectedNodeIndex === null || selectedNodeIndex >= pathAnchors.length) return null;
        return pathAnchors[selectedNodeIndex];
    }, [isPathObj, selectedNodeIndex, pathAnchors]);

    useEffect(() => {
        if (selectedAnchor) {
            setNodeX(String(Math.round(selectedAnchor.x)));
            setNodeY(String(Math.round(selectedAnchor.y)));
            setNodeType(selectedAnchor.nodeType);
        } else if (isPolygonObj && selectedNodeIndex !== null && selectedNodeIndex < polygonPoints.length) {
            const pt = polygonPoints[selectedNodeIndex];
            setNodeX(String(Math.round(pt.x)));
            setNodeY(String(Math.round(pt.y)));
        }
        if (selectedNodeIndex === null) {
            setNodeX('0'); setNodeY('0');
        }
    }, [selectedAnchor, selectedNodeIndex, isPolygonObj, polygonPoints]);

    useEffect(() => {
        if (!activeCanvas || !selectedLayerId) return;
        const targetObj = activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId || (obj as any).id === selectedLayerId);
        if (!targetObj) return;
        const updateLocalStates = () => {
            setLeft(String(Math.round(targetObj.left || 0)));
            setTop(String(Math.round(targetObj.top || 0)));
            setWidth(String(Math.round(targetObj.getScaledWidth())));
            setHeight(String(Math.round(targetObj.getScaledHeight())));
            setAngle(String(Math.round(targetObj.angle || 0)));
            setScaleX(String(Number((targetObj.scaleX || 1).toFixed(2))));
            setScaleY(String(Number((targetObj.scaleY || 1).toFixed(2))));
            setSkewX(String(Math.round(targetObj.skewX || 0)));
            setSkewY(String(Math.round(targetObj.skewY || 0)));
            setOpacity(String(Number((targetObj.opacity !== undefined ? targetObj.opacity : 1).toFixed(2))));
            setFill((targetObj.fill as string) || '');
            setStroke(targetObj.stroke || '');
            setStrokeWidth(String(targetObj.strokeWidth || 1));
            setStrokeDashArray((targetObj.strokeDashArray && targetObj.strokeDashArray.length > 0) ? targetObj.strokeDashArray.join(', ') : '0');
            setStrokeDashOffset(String(targetObj.strokeDashOffset || 0));
            setPathLength(Number(calculatePathLength(targetObj)).toFixed(1));
        };
        updateLocalStates();
        targetObj.on('moving', updateLocalStates);
        targetObj.on('scaling', updateLocalStates);
        targetObj.on('rotating', updateLocalStates);
        targetObj.on('skewing', updateLocalStates);
        targetObj.on('modified', updateLocalStates);
        return () => {
            targetObj.off('moving', updateLocalStates);
            targetObj.off('scaling', updateLocalStates);
            targetObj.off('rotating', updateLocalStates);
            targetObj.off('skewing', updateLocalStates);
            targetObj.off('modified', updateLocalStates);
        };
    }, [selectedLayerId, currentTime, fabricCanvas]);

    const commitPropertyChange = (property: string, rawValue: string) => {
        if (!selectedObj) return;
        const numVal = parseFloat(rawValue);
        let finalValue: any = numVal;

        if (['fill', 'stroke'].includes(property)) {
            finalValue = rawValue;
        } else if (property === 'strokeDashArray') {
            const arr = rawValue.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
            finalValue = arr.length > 0 ? arr : undefined;
        } else if (isNaN(numVal)) return;

        selectedObj.set(property as any, finalValue);
        selectedObj.setCoords();
        activeCanvas?.requestRenderAll();

        let trackValue: any;
        if (property === 'left' || property === 'top') {
            trackValue = { left: selectedObj.left, top: selectedObj.top };
        } else if (property === 'scaleX' || property === 'scaleY') {
            trackValue = { scaleX: selectedObj.scaleX, scaleY: selectedObj.scaleY };
        } else if (property === 'skewX' || property === 'skewY') {
            trackValue = { skewX: selectedObj.skewX, skewY: selectedObj.skewY };
        } else {
            trackValue = finalValue;
        }
        autoKeyframe(property, trackValue);
    };

    const handleSizeCommit = (isWidth: boolean) => {
        if (!selectedObj) return;
        const numW = parseFloat(width);
        const numH = parseFloat(height);
        if (isNaN(numW) || isNaN(numH)) return;
        
        let newScaleX = selectedObj.scaleX || 1;
        let newScaleY = selectedObj.scaleY || 1;
        
        const baseW = selectedObj.width || 1;
        const baseH = selectedObj.height || 1;

        if (isWidth) {
            newScaleX = numW / baseW;
            if (aspectLocked) {
                newScaleY = newScaleX;
                setHeight(String(Math.round(baseH * newScaleY)));
            }
        } else {
            newScaleY = numH / baseH;
            if (aspectLocked) {
                newScaleX = newScaleY;
                setWidth(String(Math.round(baseW * newScaleX)));
            }
        }
        
        selectedObj.set({ scaleX: newScaleX, scaleY: newScaleY });
        setScaleX(String(Number(newScaleX.toFixed(2))));
        setScaleY(String(Number(newScaleY.toFixed(2))));
        
        selectedObj.setCoords();
        activeCanvas?.requestRenderAll();
        autoKeyframe('scaleX', { scaleX: newScaleX, scaleY: newScaleY });
    };

    if (!selectedLayerId || selectedLayerId === ROOT_LAYER_ID) {
        return <CanvasPropertiesGroup fabricCanvas={fabricCanvas} />;
    }

    const SectionHeader = ({ id, title }: { id: keyof typeof sections, title: string }) => (
        <button onClick={() => toggleSection(id)} className="flex items-center justify-between w-full p-2 bg-slate-900 border-b border-slate-800 hover:bg-slate-800 transition-colors">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{title}</span>
            {sections[id] ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </button>
    );

    return (
        <div className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col text-slate-200 h-full select-none overflow-x-hidden overflow-y-auto relative">

            
            {/* POSITION & SIZE */}
            <div className="border-b border-slate-800/60">
                <SectionHeader id="position" title="Position & Size" />
                {sections.position && (
                    <div className="p-2.5 flex flex-col gap-2 bg-slate-950/50 relative z-10">
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">X (Left)</label>
                                <input type="number" value={left} onChange={e => setLeft(e.target.value)} onBlur={() => commitPropertyChange('left', left)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('left', left)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Y (Top)</label>
                                <input type="number" value={top} onChange={e => setTop(e.target.value)} onBlur={() => commitPropertyChange('top', top)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('top', top)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                        </div>
                        <div className="flex items-end gap-1">
                            <div className="grid grid-cols-2 gap-2 flex-1">
                                <div><label className="text-[10px] text-slate-500 block mb-0.5">W (Width)</label>
                                    <input type="number" value={width} onChange={e => setWidth(e.target.value)} onBlur={() => handleSizeCommit(true)} onKeyDown={e => e.key === 'Enter' && handleSizeCommit(true)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                                <div><label className="text-[10px] text-slate-500 block mb-0.5">H (Height)</label>
                                    <input type="number" value={height} onChange={e => setHeight(e.target.value)} onBlur={() => handleSizeCommit(false)} onKeyDown={e => e.key === 'Enter' && handleSizeCommit(false)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                            </div>
                            <button onClick={() => setAspectLocked(!aspectLocked)} className={`p-1.5 rounded transition-colors mb-[1px] ${aspectLocked ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700'}`} title="Lock aspect ratio">
                                {aspectLocked ? <LinkIcon size={12} className="text-white" /> : <Unlink size={12} className="text-slate-400" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* TRANSFORMS */}
            <div className="border-b border-slate-800/60">
                <SectionHeader id="transform" title="Transforms" />
                {sections.transform && (
                    <div className="p-2.5 flex flex-col gap-2 bg-slate-950/50 relative z-10">
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Scale X</label>
                                <input type="number" step="0.1" value={scaleX} onChange={e => setScaleX(e.target.value)} onBlur={() => commitPropertyChange('scaleX', scaleX)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('scaleX', scaleX)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Scale Y</label>
                                <input type="number" step="0.1" value={scaleY} onChange={e => setScaleY(e.target.value)} onBlur={() => commitPropertyChange('scaleY', scaleY)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('scaleY', scaleY)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Skew X (°)</label>
                                <input type="number" value={skewX} onChange={e => setSkewX(e.target.value)} onBlur={() => commitPropertyChange('skewX', skewX)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('skewX', skewX)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Skew Y (°)</label>
                                <input type="number" value={skewY} onChange={e => setSkewY(e.target.value)} onBlur={() => commitPropertyChange('skewY', skewY)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('skewY', skewY)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-0.5">Angle (°)</label>
                            <input type="number" value={angle} onChange={e => setAngle(e.target.value)} onBlur={() => commitPropertyChange('angle', angle)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('angle', angle)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                )}
            </div>

            {/* APPEARANCE */}
            <div className="border-b border-slate-800/60 pb-2">
                <SectionHeader id="appearance" title="Appearance Colors" />
                {sections.appearance && (
                    <div className="p-2.5 flex flex-col gap-2.5 bg-slate-950/50">
                        {/* Hàng 1: Fill */}
                        <div className="flex items-center gap-1.5 relative z-50">
                            <span className="text-[10px] text-slate-500 w-9 text-right font-medium">Fill</span>
                            <div className="relative">
                                <button onClick={() => setPopover(p => p==='fill'?null:'fill')} className="w-5 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0 flex items-center justify-center overflow-hidden">
                                     {fill === 'transparent' || fill === 'none' ? <Ban size={12} className="text-red-500" /> : <div className="w-full h-full" style={{ backgroundColor: fill }} />}
                                </button>
                                {popover === 'fill' && (
                                    <div className="absolute z-50 mt-1 left-0 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-300">Fill Color</span>
                                        </div>
                                        <HexColorPicker color={fill === 'transparent' || fill === 'none' ? '#000000' : fill} onChange={(val) => {
                                            setFill(val);
                                            if (selectedObj) {
                                                selectedObj.set('fill', val);
                                                activeCanvas?.requestRenderAll();
                                            }
                                        }} />
                                    </div>
                                )}
                            </div>
                            <input type="text" title="Hex Color" value={fill} onChange={e => { setFill(e.target.value); commitPropertyChange('fill', e.target.value); }} onBlur={() => commitPropertyChange('fill', fill)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('fill', fill)} className="flex-1 w-0 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-indigo-500 uppercase h-[22px]" />
                            
                            <button onClick={() => {
                                const temp = fill;
                                setFill(stroke);
                                setStroke(temp);
                                commitPropertyChange('fill', stroke);
                                commitPropertyChange('stroke', temp);
                            }} className="w-[22px] h-[22px] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors" title="Swap Fill and Stroke"><ArrowUpDown size={11} /></button>
                            
                            <button onClick={() => {
                                setFill('none');
                                commitPropertyChange('fill', 'none');
                            }} className="w-[22px] h-[22px] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-red-400 rounded transition-colors" title="Transparent Fill"><Ban size={11} /></button>
                        </div>
                        
                        {/* Hàng 2: Stroke */}
                        <div className="flex items-center gap-1.5 relative z-40">
                            <span className="text-[10px] text-slate-500 w-9 text-right font-medium">Stroke</span>
                            <div className="relative">
                                <button onClick={() => setPopover(p => p==='stroke'?null:'stroke')} className="w-5 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0 flex items-center justify-center overflow-hidden">
                                     {stroke === 'transparent' || stroke === 'none' || !stroke ? <Ban size={12} className="text-red-500" /> : <div className="w-full h-full" style={{ backgroundColor: stroke }} />}
                                </button>
                                {popover === 'stroke' && (
                                    <div className="absolute z-50 mt-1 left-0 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-300">Stroke Color</span>
                                        </div>
                                        <HexColorPicker color={stroke === 'transparent' || stroke === 'none' || !stroke ? '#000000' : stroke} onChange={(val) => {
                                            setStroke(val);
                                            if (selectedObj) {
                                                selectedObj.set('stroke', val);
                                                activeCanvas?.requestRenderAll();
                                            }
                                        }} />
                                    </div>
                                )}
                            </div>
                            <input type="text" title="Hex Color" value={stroke} onChange={e => { setStroke(e.target.value); commitPropertyChange('stroke', e.target.value); }} onBlur={() => commitPropertyChange('stroke', stroke)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('stroke', stroke)} className="flex-1 w-0 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-indigo-500 uppercase h-[22px]" placeholder="none" />
                            <div className="flex items-center flex-1 w-0 gap-1 opacity-80 bg-slate-900/50 p-[1px] rounded border border-slate-800">
                                <span className="text-[9px] text-slate-500 pl-1 font-semibold uppercase">W</span>
                                <input type="number" min="0" value={strokeWidth} onChange={e => setStrokeWidth(e.target.value)} onBlur={() => commitPropertyChange('strokeWidth', strokeWidth)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('strokeWidth', strokeWidth)} className="w-full bg-transparent border-0 px-1 py-0.5 text-[11px] text-slate-100 focus:outline-none h-[18px]" />
                            </div>
                        </div>

                        {/* Hàng 4: Dashes & Offset */}
                        <div className="grid grid-cols-2 gap-2 mt-1 relative z-10">
                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 tracking-wider">Dasharray</label>
                                <input type="text" value={strokeDashArray} onChange={e => setStrokeDashArray(e.target.value)} onBlur={() => commitPropertyChange('strokeDashArray', strokeDashArray)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('strokeDashArray', strokeDashArray)} placeholder="0" className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" /></div>
                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 tracking-wider">Dashoffset</label>
                                <input type="number" value={strokeDashOffset} onChange={e => setStrokeDashOffset(e.target.value)} onBlur={() => commitPropertyChange('strokeDashOffset', strokeDashOffset)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('strokeDashOffset', strokeDashOffset)} placeholder="0" className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" /></div>
                        </div>

                        {/* Hàng 5: Path Length & Copy Tool */}
                        <div className="flex items-end gap-1.5 bg-slate-900 p-1.5 rounded border border-slate-800/80 relative z-30">
                            <div className="flex-1">
                                <label className="text-[9px] font-bold text-teal-500/80 uppercase block mb-0.5 pl-0.5">Path Length (Px)</label>
                                <input type="text" readOnly value={pathLength} className="w-full bg-slate-950 border border-slate-800/50 rounded px-2 py-1.5 text-[11px] font-mono font-bold text-teal-400 cursor-default select-all" />
                            </div>
                            <div className="relative">
                                <button onClick={() => setPopover(p => p==='copy'?null:'copy')} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-300 px-2 h-[30px] rounded transition-colors whitespace-nowrap">
                                    <Copy size={11} /> <span className="font-semibold text-slate-200">Copy to</span> <ChevronDown size={10} />
                                </button>
                                {popover === 'copy' && (
                                    <div className="absolute right-0 bottom-full mb-1 z-50 w-36 bg-slate-900 border border-slate-700 rounded shadow-xl overflow-hidden py-1">
                                        <button onClick={() => {
                                            const len = parseFloat(pathLength);
                                            setStrokeDashArray(`${len}, ${len}`);
                                            commitPropertyChange('strokeDashArray', `${len}, ${len}`);
                                            setPopover(null);
                                        }} className="w-full text-left px-3 py-2 text-[10px] text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors">Copy to Dasharray</button>
                                        
                                        <button onClick={() => {
                                            const len = parseFloat(pathLength);
                                            setStrokeDashOffset(String(len));
                                            commitPropertyChange('strokeDashOffset', String(len));
                                            setPopover(null);
                                        }} className="w-full text-left px-3 py-2 text-[10px] text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors">Copy to Dashoffset</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Hàng 6: Opacity */}
                        <div className="mt-2 flex gap-2 items-center bg-slate-900/40 p-2 rounded relative z-10 border border-slate-800/30">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Overall<br/>Opacity</label>
                            <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={e => {
                                setOpacity(e.target.value);
                                if (selectedObj) {
                                    selectedObj.set('opacity', parseFloat(e.target.value));
                                    activeCanvas?.requestRenderAll();
                                }
                            }} onMouseUp={() => commitPropertyChange('opacity', opacity)} onTouchEnd={() => commitPropertyChange('opacity', opacity)} className="flex-1 accent-indigo-500 cursor-ew-resize" />
                            <input type="number" min="0" max="1" step="0.01" value={opacity} onChange={e => setOpacity(e.target.value)} onBlur={() => commitPropertyChange('opacity', opacity)} onKeyDown={e => e.key === 'Enter' && commitPropertyChange('opacity', opacity)} className="w-[50px] bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-indigo-500 text-center" />
                        </div>
                    </div>
                )}
            </div>

            {/* PATH NODES */}
            {isNodeTool && (isPathObj || isPolygonObj) && (
                <div className="border-b border-slate-800/60 pb-2">
                    <SectionHeader id="path" title="Path Nodes" />
                    {sections.path && (
                        <div className="p-2.5 flex flex-col gap-2 mx-2 mt-2 border border-slate-800/50 rounded bg-slate-900/40">
                            {isPathObj && (
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-0.5">Node Type</label>
                                    <select value={nodeType} onChange={(e) => {
                                        setNodeType(e.target.value);
                                        if (selectedAnchor) {
                                            selectedAnchor.nodeType = e.target.value as any;
                                            const pathObj = selectedObj as fabric.Path;
                                            pathObj.set({ path: (pathObj.path || []).slice() as any });
                                            pathObj.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        }
                                    }} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-amber-500">
                                        {NODE_TYPES.map(nt => <option key={nt.id} value={nt.id}>{nt.label}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <div><label className="text-[10px] text-slate-500 block mb-0.5">X (Node)</label>
                                    <input type="number" value={nodeX} onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        if (isNaN(v)) return;
                                        setNodeX(e.target.value);
                                        if (isPathObj && selectedAnchor) {
                                            const pathObj = selectedObj as fabric.Path;
                                            updatePathAnchor(pathObj, selectedAnchor, v, parseFloat(nodeY));
                                            pathObj.set({ path: (pathObj.path || []).slice() as any });
                                            pathObj.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        } else if (isPolygonObj && selectedNodeIndex !== null) {
                                            const poly = selectedObj as fabric.Polygon;
                                            const pts = [...(poly.points || [])];
                                            pts[selectedNodeIndex] = new fabric.Point(v, parseFloat(nodeY));
                                            poly.set({ points: pts });
                                            poly.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        }
                                    }} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-amber-500" /></div>
                                <div><label className="text-[10px] text-slate-500 block mb-0.5">Y (Node)</label>
                                    <input type="number" value={nodeY} onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        if (isNaN(v)) return;
                                        setNodeY(e.target.value);
                                        if (isPathObj && selectedAnchor) {
                                            const pathObj = selectedObj as fabric.Path;
                                            updatePathAnchor(pathObj, selectedAnchor, parseFloat(nodeX), v);
                                            pathObj.set({ path: (pathObj.path || []).slice() as any });
                                            pathObj.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        } else if (isPolygonObj && selectedNodeIndex !== null) {
                                            const poly = selectedObj as fabric.Polygon;
                                            const pts = [...(poly.points || [])];
                                            pts[selectedNodeIndex] = new fabric.Point(parseFloat(nodeX), v);
                                            poly.set({ points: pts });
                                            poly.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        }
                                    }} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-amber-500" /></div>
                            </div>
                            
                            <div><label className="text-[10px] text-slate-500 block mb-0.5">Corner Radius</label>
                                <input type="number" min={0} value={cornerRadius} onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    if (isNaN(v) || !selectedObj) return;
                                    setCornerRadius(e.target.value);
                                    (selectedObj as any).set({ rx: v, ry: v });
                                    selectedObj.setCoords();
                                    getActiveCanvas()?.requestRenderAll();
                                }} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-amber-500" /></div>

                            <div className="flex items-center gap-1 flex-wrap mt-2">
                                {(isPathObj ? pathAnchors : polygonPoints).map((_, i) => (
                                    <button key={i} onClick={() => setSelectedNodeIndex(selectedNodeIndex === i ? null : i)} className={`w-5 h-5 rounded text-[9px] font-bold transition-all shadow-sm ${selectedNodeIndex === i ? 'bg-amber-500 text-white scale-110' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{i + 1}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

