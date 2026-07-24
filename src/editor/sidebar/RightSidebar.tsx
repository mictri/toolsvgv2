import { useEffect, useState, useMemo } from 'react';
import { useEditorStore, AnimatableProperty } from '../../store/editorStore';
import { compileTimeline } from '../timeline/timelineCompiler';
import { fabric } from 'fabric';
import { parsePathAnchors, updatePathAnchor } from '../canvas/pathNodeEditor';

interface RightSidebarProps {
    fabricCanvas: fabric.Canvas | React.MutableRefObject<fabric.Canvas | null> | null;
}

const NODE_TYPES = [
    { id: 'corner', label: 'Corner Node' },
    { id: 'smooth', label: 'Smooth Node' },
    { id: 'symmetric', label: 'Symmetric Node' },
];

export default function RightSidebar({ fabricCanvas }: RightSidebarProps) {
    const {
        selectedLayerId, currentTime, animatedObjects, addKeyframeToTrack, addPropertyTrack,
        activeTool, selectedNodeIndex, setSelectedNodeIndex,
    } = useEditorStore();

    const [left, setLeft] = useState<string | number>(0);
    const [top, setTop] = useState<string | number>(0);
    const [width, setWidth] = useState<string | number>(0);
    const [height, setHeight] = useState<string | number>(0);
    const [angle, setAngle] = useState<string | number>(0);
    const [scaleX, setScaleX] = useState<string | number>(1);
    const [scaleY, setScaleY] = useState<string | number>(1);
    const [skewX, setSkewX] = useState<string | number>(0);
    const [skewY, setSkewY] = useState<string | number>(0);
    const [opacity, setOpacity] = useState<string | number>(1);
    const [fill, setFill] = useState('#6366f1');
    const [stroke, setStroke] = useState('#4f46e5');
    const [nodeX, setNodeX] = useState<string | number>(0);
    const [nodeY, setNodeY] = useState<string | number>(0);
    const [cornerRadius, setCornerRadius] = useState<string | number>(0);
    const [nodeType, setNodeType] = useState('corner');

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
        if (!propTrack) return;

        if (!ao) {
            const layer = useEditorStore.getState().layers.find(l => l.id === selectedLayerId);
            if (!layer) return;
            addPropertyTrack(selectedLayerId, propTrack);
        } else if (!ao.tracks.find(t => t.property === propTrack)) {
            addPropertyTrack(selectedLayerId, propTrack);
        }

        addKeyframeToTrack(selectedLayerId, propTrack, currentTime, value, 'power2.out');
        compileTimeline(useEditorStore.getState().animatedObjects, activeCanvas);
    };

    const activeCanvas = getActiveCanvas();
    const selectedObj = useMemo(() => {
        if (!activeCanvas || !selectedLayerId) return null;
        return activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId) ?? null;
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

    // Sync node position / corner radius when selection changes
    useEffect(() => {
        if (selectedAnchor) {
            setNodeX(Math.round(selectedAnchor.x));
            setNodeY(Math.round(selectedAnchor.y));
            setNodeType(selectedAnchor.nodeType);
        } else if (isPolygonObj && selectedNodeIndex !== null && selectedNodeIndex < polygonPoints.length) {
            const pt = polygonPoints[selectedNodeIndex];
            setNodeX(Math.round(pt.x));
            setNodeY(Math.round(pt.y));
        }
        if (selectedNodeIndex === null) {
            setNodeX(0);
            setNodeY(0);
        }
    }, [selectedAnchor, selectedNodeIndex, isPolygonObj, polygonPoints]);

    useEffect(() => {
        if (!activeCanvas || !selectedLayerId) return;
        const targetObj = activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId);
        if (!targetObj) return;
        const updateLocalStates = () => {
            setLeft(Math.round(targetObj.left || 0));
            setTop(Math.round(targetObj.top || 0));
            setWidth(Math.round(targetObj.getScaledWidth()));
            setHeight(Math.round(targetObj.getScaledHeight()));
            setAngle(Math.round(targetObj.angle || 0));
            setScaleX(Number((targetObj.scaleX || 1).toFixed(2)));
            setScaleY(Number((targetObj.scaleY || 1).toFixed(2)));
            setSkewX(Math.round(targetObj.skewX || 0));
            setSkewY(Math.round(targetObj.skewY || 0));
            setOpacity(Number((targetObj.opacity !== undefined ? targetObj.opacity : 1).toFixed(2)));
            setFill((targetObj.fill as string) || '#6366f1');
            setStroke(targetObj.stroke || '#4f46e5');
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

    const handlePropertyChange = (property: string, rawValue: string) => {
        const canvas = getActiveCanvas();
        if (!canvas) return;
        const targetObj = canvas.getActiveObject() || (selectedLayerId ? canvas.getObjects().find(obj => obj.data?.id === selectedLayerId) : null);
        if (!targetObj) return;
        switch (property) {
            case 'left': setLeft(rawValue); break;
            case 'top': setTop(rawValue); break;
            case 'angle': setAngle(rawValue); break;
            case 'scaleX': setScaleX(rawValue); break;
            case 'scaleY': setScaleY(rawValue); break;
            case 'skewX': setSkewX(rawValue); break;
            case 'skewY': setSkewY(rawValue); break;
            case 'opacity': setOpacity(rawValue); break;
            case 'fill': setFill(rawValue); break;
            case 'stroke': setStroke(rawValue); break;
        }
        const numericValue = parseFloat(rawValue);
        if (isNaN(numericValue) && property !== 'fill' && property !== 'stroke') return;
        const finalValue = (property === 'fill' || property === 'stroke') ? rawValue : numericValue;
        targetObj.set({ [property]: finalValue });
        targetObj.setCoords();
        canvas.requestRenderAll();
        let trackValue: any;
        if (property === 'left' || property === 'top') {
            trackValue = { left: parseFloat(String(left)), top: parseFloat(String(top)) };
        } else if (property === 'scaleX' || property === 'scaleY') {
            trackValue = { scaleX: parseFloat(String(scaleX)), scaleY: parseFloat(String(scaleY)) };
        } else if (property === 'angle') {
            trackValue = numericValue;
        } else if (property === 'opacity') {
            trackValue = numericValue;
        } else if (property === 'skewX' || property === 'skewY') {
            trackValue = { skewX: parseFloat(String(skewX)), skewY: parseFloat(String(skewY)) };
        } else if (property === 'fill') {
            trackValue = rawValue;
        } else if (property === 'stroke') {
            trackValue = rawValue;
        } else return;
        autoKeyframe(property, trackValue);
    };

    if (!selectedLayerId) {
        return (
            <div className="w-80 border-l border-slate-800 bg-slate-950 p-4 text-xs text-slate-500 italic text-center h-full flex items-center justify-center">
                Select a layer to view properties.
            </div>
        );
    }

    return (
        <div className="w-80 border-l border-slate-800 bg-slate-950 p-4 flex flex-col gap-4 text-slate-200 h-full select-none overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-2">
                Transform Inspector
            </h3>

            {/* PATH NODES — only when activeTool === 'node' */}
            {isNodeTool && (isPathObj || isPolygonObj) && (
                <div className="flex flex-col gap-2 border border-slate-800/60 rounded-md p-2 bg-slate-900/20">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Path Nodes</span>

                    {/* Node Type Selector — only for Path, NOT for Polygon */}
                    {isPathObj && (
                        <div>
                            <label className="text-[10px] text-slate-500">Node Type</label>
                            <select value={nodeType}
                                onChange={(e) => {
                                    setNodeType(e.target.value);
                                    if (selectedAnchor) {
                                        selectedAnchor.nodeType = e.target.value as any;
                                        const pathObj = selectedObj as fabric.Path;
                                        pathObj.set({ path: (pathObj.path || []).slice() as any });
                                        pathObj.setCoords();
                                        getActiveCanvas()?.requestRenderAll();
                                    }
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500 mt-1">
                                {NODE_TYPES.map((nt) => (
                                    <option key={nt.id} value={nt.id}>{nt.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Node Position */}
                    <div>
                        <label className="text-[10px] text-slate-500">Node Position</label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                                <label className="text-[9px] text-slate-500">X</label>
                                <input type="number" value={nodeX}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (isNaN(v)) return;
                                        setNodeX(v);
                                        if (isPathObj && selectedAnchor) {
                                            const pathObj = selectedObj as fabric.Path;
                                            updatePathAnchor(pathObj, selectedAnchor, v, parseFloat(String(nodeY)));
                                            pathObj.set({ path: (pathObj.path || []).slice() as any });
                                            pathObj.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        } else if (isPolygonObj && selectedNodeIndex !== null) {
                                            const poly = selectedObj as fabric.Polygon;
                                            const pts = [...(poly.points || [])];
                                            pts[selectedNodeIndex] = new fabric.Point(v, parseFloat(String(nodeY)));
                                            poly.set({ points: pts });
                                            poly.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        }
                                    }}
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500">Y</label>
                                <input type="number" value={nodeY}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (isNaN(v)) return;
                                        setNodeY(v);
                                        if (isPathObj && selectedAnchor) {
                                            const pathObj = selectedObj as fabric.Path;
                                            updatePathAnchor(pathObj, selectedAnchor, parseFloat(String(nodeX)), v);
                                            pathObj.set({ path: (pathObj.path || []).slice() as any });
                                            pathObj.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        } else if (isPolygonObj && selectedNodeIndex !== null) {
                                            const poly = selectedObj as fabric.Polygon;
                                            const pts = [...(poly.points || [])];
                                            pts[selectedNodeIndex] = new fabric.Point(parseFloat(String(nodeX)), v);
                                            poly.set({ points: pts });
                                            poly.setCoords();
                                            getActiveCanvas()?.requestRenderAll();
                                        }
                                    }}
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                            </div>
                        </div>
                    </div>

                    {/* Corner Radius */}
                    <div>
                        <label className="text-[10px] text-slate-500">Corner Radius</label>
                        <input type="number" min={0} value={cornerRadius}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (isNaN(v) || !selectedObj) return;
                                setCornerRadius(v);
                                (selectedObj as any).set({ rx: v, ry: v });
                                selectedObj.setCoords();
                                getActiveCanvas()?.requestRenderAll();
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500 mt-1" />
                    </div>

                    {/* Node navigator dots */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {(isPathObj ? pathAnchors : polygonPoints).map((_: any, i: number) => (
                            <button key={i}
                                onClick={() => setSelectedNodeIndex(selectedNodeIndex === i ? null : i)}
                                className={`w-4 h-4 rounded-full text-[8px] font-bold transition-colors ${selectedNodeIndex === i ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                                {i + 1}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Position + Size */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Position</span>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-slate-500">X (Left)</label>
                        <input type="number" value={left} onChange={(e) => handlePropertyChange('left', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                    <div><label className="text-[10px] text-slate-500">Y (Top)</label>
                        <input type="number" value={top} onChange={(e) => handlePropertyChange('top', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                </div>
            </div>

            {/* Size */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Size</span>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-slate-500">W (Width)</label>
                        <input type="number" value={width}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (isNaN(v) || !selectedObj) return;
                                selectedObj.set({ width: v / (selectedObj.scaleX || 1) });
                                setWidth(v);
                                selectedObj.setCoords();
                                getActiveCanvas()?.requestRenderAll();
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                    <div><label className="text-[10px] text-slate-500">H (Height)</label>
                        <input type="number" value={height}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (isNaN(v) || !selectedObj) return;
                                selectedObj.set({ height: v / (selectedObj.scaleY || 1) });
                                setHeight(v);
                                selectedObj.setCoords();
                                getActiveCanvas()?.requestRenderAll();
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                </div>
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Scale</span>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-slate-500">Scale X</label>
                        <input type="number" step="0.1" value={scaleX} onChange={(e) => handlePropertyChange('scaleX', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                    <div><label className="text-[10px] text-slate-500">Scale Y</label>
                        <input type="number" step="0.1" value={scaleY} onChange={(e) => handlePropertyChange('scaleY', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                </div>
            </div>

            {/* Skew */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Skew</span>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-slate-500">Skew X (°)</label>
                        <input type="number" value={skewX} onChange={(e) => handlePropertyChange('skewX', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                    <div><label className="text-[10px] text-slate-500">Skew Y (°)</label>
                        <input type="number" value={skewY} onChange={(e) => handlePropertyChange('skewY', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                </div>
            </div>

            {/* Rotation & Opacity */}
            <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[10px] font-semibold text-indigo-400 uppercase block mb-1">Rotation</span>
                    <label className="text-[10px] text-slate-500">Angle (°)</label>
                    <input type="number" value={angle} onChange={(e) => handlePropertyChange('angle', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
                <div><span className="text-[10px] font-semibold text-indigo-400 uppercase block mb-1">Opacity</span>
                    <label className="text-[10px] text-slate-500">Alpha (0 - 1)</label>
                    <input type="number" step="0.05" min="0" max="1" value={opacity}
                        onChange={(e) => handlePropertyChange('opacity', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" /></div>
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Appearance Colors</span>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-slate-500 block mb-1">Fill Color</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" value={fill} onChange={(e) => {
                                const newColor = e.target.value;
                                setFill(newColor);
                                const canvas = getActiveCanvas();
                                if (canvas) {
                                    const obj = canvas.getActiveObject() || (selectedLayerId ? canvas.getObjects().find(o => o.data?.id === selectedLayerId) : null);
                                    if (obj) {
                                        obj.set('fill', newColor);
                                        obj.setCoords();
                                        canvas.requestRenderAll();
                                    }
                                }
                                handlePropertyChange('fill', newColor);
                            }}
                                className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0" />
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{fill}</span>
                        </div>
                    </div>
                    <div><label className="text-[10px] text-slate-500 block mb-1">Stroke Color</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" value={stroke} onChange={(e) => {
                                const newColor = e.target.value;
                                setStroke(newColor);
                                const canvas = getActiveCanvas();
                                if (canvas) {
                                    const obj = canvas.getActiveObject() || (selectedLayerId ? canvas.getObjects().find(o => o.data?.id === selectedLayerId) : null);
                                    if (obj) {
                                        obj.set('stroke', newColor);
                                        obj.setCoords();
                                        canvas.requestRenderAll();
                                    }
                                }
                                handlePropertyChange('stroke', newColor);
                            }}
                                className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0" />
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{stroke}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
