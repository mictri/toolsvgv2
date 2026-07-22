import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/editorStore';
import ToolCluster from "../toolbar/ToolCluster";
import type { ToolItem } from "../toolbar/ToolCluster";
import { compileTimeline } from '../timeline/timelineCompiler';

interface CanvasProps {
    fabricCanvasRef: React.MutableRefObject<fabric.Canvas | null>;
    onCanvasReady: (canvas: fabric.Canvas) => void;
}

interface Point { x: number; y: number; }

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 20;

function createGridPatternCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = GRID_SIZE; c.height = GRID_SIZE;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, GRID_SIZE, GRID_SIZE);
    return c;
}

const editTools: ToolItem[] = [
    { id: 'transform', label: 'Transform', icon: '↖' },
    { id: 'node', label: 'Node', icon: '✧' },
    { id: 'resize', label: 'Resize', icon: '⤡' },
];
const vectorTools: ToolItem[] = [
    { id: 'pen', label: 'Pen', icon: '✏️' },
    { id: 'pencil', label: 'Pencil', icon: '✎' },
    { id: 'add-node', label: 'Add Node', icon: '⊕' },
    { id: 'remove-node', label: 'Remove Node', icon: '⊖' },
];
const shapeTools: ToolItem[] = [
    { id: 'rect', label: 'Rectangle', icon: '🟦' },
    { id: 'ellipse', label: 'Ellipse', icon: '⭕' },
    { id: 'polygon', label: 'Polygon', icon: '⬡' },
    { id: 'star', label: 'Star', icon: '⭐' },
    { id: 'line', label: 'Line', icon: '➖' },
];

function simplifyPath(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points;
    let maxDist = 0, maxIdx = 0;
    const first = points[0], last = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dist = Math.abs(dy * points[i].x - dx * points[i].y + last.x * first.y - last.y * first.x) / (len || 1);
        if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance) {
        const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance);
        const right = simplifyPath(points.slice(maxIdx), tolerance);
        return [...left.slice(0, -1), ...right];
    }
    return [first, last];
}

function pointsToSvgPath(pts: Point[]): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        const cpx = p0.x + (p1.x - p0.x) * 0.5;
        const cpy = p0.y + (p1.y - p0.y) * 0.5;
        const cpx2 = p1.x - (p2.x - p0.x) * 0.25;
        const cpy2 = p1.y - (p2.y - p0.y) * 0.25;
        d += ` C ${cpx} ${cpy}, ${cpx2} ${cpy2}, ${p1.x} ${p1.y}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
}

export default function Canvas({ fabricCanvasRef, onCanvasReady }: CanvasProps) {
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [snapGrid, setSnapGrid] = useState(false);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

    const [activeTool, setActiveTool] = useState('transform');
    const [activeShape, setActiveShape] = useState('rect');

    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

    // Pen tool refs
    const penPoints = useRef<Point[]>([]);
    const penHelpers = useRef<fabric.Object[]>([]);
    const penPreviewLine = useRef<fabric.Line | null>(null);

    // Pencil tool refs
    const pencilPoints = useRef<Point[]>([]);
    const pencilPreview = useRef<fabric.Path | null>(null);
    const isDrawingPencil = useRef(false);

    const { selectedLayerId, selectedKeyframeId, removeLayer, removeKeyframe, undo, redo, selectLayer, addLayer } = useEditorStore();

    const applyZoom = useCallback((newZoom: number) => {
        if (!canvas) return;
        canvas.setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom)));
        canvas.renderAll();
        setZoom(canvas.getZoom());
    }, [canvas]);

    // === ADD SHAPE ===
    const addShapeToCanvas = useCallback((shapeType: string) => {
        if (!canvas) return;
        const id = crypto.randomUUID();
        const count = canvas.getObjects().filter(o => o.data?.type === shapeType).length + 1;
        const name = `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} ${count}`;
        const base = { left: 150, top: 150, fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2, data: { id, type: shapeType } };

        let obj: fabric.Object;
        switch (shapeType) {
            case 'rect': obj = new fabric.Rect({ ...base, width: 100, height: 100, rx: 6, ry: 6 }); break;
            case 'ellipse': obj = new fabric.Ellipse({ ...base, rx: 50, ry: 50 }); break;
            case 'polygon': obj = new fabric.Polygon([{ x: 50, y: 0 }, { x: 93.3, y: 25 }, { x: 93.3, y: 75 }, { x: 50, y: 100 }, { x: 6.7, y: 75 }, { x: 6.7, y: 25 }], { ...base, left: 150, top: 150 }); break;
            case 'star': {
                const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? 50 : 20, a = Math.PI * i / 5 - Math.PI / 2; pts.push({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) }); }
                obj = new fabric.Polygon(pts, { ...base, left: 150, top: 150 }); break;
            }
            case 'line': obj = new fabric.Line([0, 0, 150, 0], { ...base, strokeWidth: 4 }); break;
            default: return;
        }
        canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        addLayer({ id, name, type: shapeType as any, visible: true, locked: false });
    }, [canvas, addLayer]);

    // === ADD TEXT ===
    const addTextToCanvas = useCallback(() => {
        if (!canvas) return;
        const id = crypto.randomUUID();
        const count = canvas.getObjects().filter(o => o.data?.type === 'text').length + 1;
        const text = new fabric.IText('Type here', { left: 150, top: 150, fontFamily: 'Arial', fontSize: 32, fill: '#e2e8f0', data: { id, type: 'text' } });
        canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
        addLayer({ id, name: `Text ${count}`, type: 'text', visible: true, locked: false });
    }, [canvas, addLayer]);

    // === TOOL SELECTOR (fix: add deps to avoid stale closure) ===
    const handleToolSelect = useCallback((toolId: string) => {
        if (shapeTools.some(t => t.id === toolId)) {
            addShapeToCanvas(toolId);
            setActiveShape(toolId);
            return;
        }
        if (toolId === 'text') { addTextToCanvas(); return; }
        if (toolId === 'hand') { setActiveTool(activeTool === 'hand' ? 'transform' : 'hand'); return; }
        if (vectorTools.some(t => t.id === toolId) || editTools.some(t => t.id === toolId)) {
            setActiveTool(activeTool === toolId ? 'transform' : toolId);
        }
    }, [activeTool, addShapeToCanvas, addTextToCanvas]);

    // === ALIGNMENT ===
    const alignObjects = useCallback((align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        if (!canvas) return;
        const activeObj = canvas.getActiveObject();
        if (!activeObj) return;
        const objects = activeObj.type === 'activeSelection' ? (activeObj as fabric.ActiveSelection).getObjects() : [activeObj];
        const cw = canvas.width || 800, ch = canvas.height || 500;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        objects.forEach(o => { const b = o.getBoundingRect(); if (b.left < minX) minX = b.left; if (b.top < minY) minY = b.top; if (b.left + b.width > maxX) maxX = b.left + b.width; if (b.top + b.height > maxY) maxY = b.top + b.height; });
        objects.forEach(o => { const b = o.getBoundingRect(); let l = o.left || 0, t = o.top || 0; if (align === 'left') l = minX; else if (align === 'center') l = (cw - b.width) / 2; else if (align === 'right') l = maxX - b.width; else if (align === 'top') t = minY; else if (align === 'middle') t = (ch - b.height) / 2; else if (align === 'bottom') t = maxY - b.height; o.set({ left: l, top: t }); });
        canvas.renderAll();
    }, [canvas]);

    // Init Fabric Canvas
    useEffect(() => {
        if (!canvasElRef.current) return;
        const c = new fabric.Canvas(canvasElRef.current, {
            width: 800, height: 500, backgroundColor: '#1e293b', preserveObjectStacking: true,
        });
        fabricCanvasRef.current = c;
        setCanvas(c);
        if (typeof onCanvasReady === 'function') onCanvasReady(c);
        c.on('selection:created', (e) => { const o = e.selected?.[0]; if (o?.data?.id) selectLayer(o.data.id as string); });
        c.on('selection:updated', (e) => { const o = e.selected?.[0]; if (o?.data?.id) selectLayer(o.data.id as string); });
        c.on('selection:cleared', () => selectLayer(null));
        const handleScrub = () => c.renderAll();
        window.addEventListener('timeline-scrub', handleScrub);
        return () => { window.removeEventListener('timeline-scrub', handleScrub); c.dispose(); };
    }, [selectLayer, onCanvasReady, fabricCanvasRef]);

    // === HAND TOOL ===
    useEffect(() => {
        if (!canvas || activeTool !== 'hand') return;
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        canvas.renderAll();
        const onMouseDown = (e: fabric.IEvent) => {
            if (!e.e) return;
            isPanning.current = true;
            canvas.defaultCursor = 'grabbing';
            const vt = canvas.viewportTransform!;
            panStart.current = { x: (e.e as MouseEvent).clientX, y: (e.e as MouseEvent).clientY, tx: vt[4], ty: vt[5] };
        };
        const onMouseMove = (e: fabric.IEvent) => {
            if (!isPanning.current || !e.e) return;
            const me = e.e as MouseEvent;
            const vt = canvas.viewportTransform!;
            vt[4] = panStart.current.tx + (me.clientX - panStart.current.x);
            vt[5] = panStart.current.ty + (me.clientY - panStart.current.y);
            canvas.requestRenderAll();
        };
        const onMouseUp = () => { isPanning.current = false; if (canvas) canvas.defaultCursor = 'grab'; };
        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);
        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            canvas.selection = true;
            canvas.defaultCursor = 'default';
            canvas.renderAll();
        };
    }, [activeTool, canvas]);

    // === PEN TOOL HELPER ===
    const cleanupPen = useCallback(() => {
        if (!canvas) return;
        penHelpers.current.forEach(obj => canvas.remove(obj));
        penHelpers.current = [];
        if (penPreviewLine.current) { canvas.remove(penPreviewLine.current); penPreviewLine.current = null; }
        penPoints.current = [];
    }, [canvas]);

    const drawPenDot = useCallback((pt: Point) => {
        if (!canvas) return;
        const dot = new fabric.Circle({
            left: pt.x - 3, top: pt.y - 3, radius: 3, fill: '#a5b4fc',
            selectable: false, evented: false, originX: 'center', originY: 'center',
        });
        canvas.add(dot);
        penHelpers.current.push(dot);
    }, [canvas]);

    const drawPenSegment = useCallback((from: Point, to: Point) => {
        if (!canvas) return;
        const seg = new fabric.Line([from.x, from.y, to.x, to.y], {
            stroke: '#a5b4fc', strokeWidth: 2, selectable: false, evented: false,
        });
        canvas.add(seg);
        penHelpers.current.push(seg);
    }, [canvas]);

    // === PEN TOOL ===
    useEffect(() => {
        if (!canvas || activeTool !== 'pen') return;
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        const onClick = (e: fabric.IEvent) => {
            const ptr = canvas.getPointer(e.e);
            const pt: Point = { x: ptr.x, y: ptr.y };

            if (penPoints.current.length >= 1) {
                const prev = penPoints.current[penPoints.current.length - 1];
                drawPenSegment(prev, pt);
            }
            drawPenDot(pt);
            penPoints.current.push(pt);

            if (penPreviewLine.current) { canvas.remove(penPreviewLine.current); penPreviewLine.current = null; }
            canvas.renderAll();
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (penPoints.current.length === 0) return;
            const last = penPoints.current[penPoints.current.length - 1];
            const ptr = canvas.getPointer(e.e);
            if (penPreviewLine.current) canvas.remove(penPreviewLine.current);
            const line = new fabric.Line([last.x, last.y, ptr.x, ptr.y], {
                stroke: '#a5b4fc', strokeWidth: 1, strokeDashArray: [4, 4] as any,
                selectable: false, evented: false,
            });
            canvas.add(line);
            penPreviewLine.current = line;
            canvas.renderAll();
        };

        const onDblClick = () => {
            if (penPoints.current.length < 2) { cleanupPen(); return; }
            const pts = penPoints.current.map(p => ({ x: p.x, y: p.y }));
            const id = crypto.randomUUID();
            const poly = new fabric.Polyline(pts, {
                fill: undefined, stroke: '#6366f1', strokeWidth: 2, strokeLineJoin: 'round',
                data: { id, type: 'path' },
            });
            canvas.add(poly);
            canvas.setActiveObject(poly);
            canvas.renderAll();
            const count = canvas.getObjects().filter(o => o.data?.type === 'path').length;
            addLayer({ id, name: `Path ${count}`, type: 'path', visible: true, locked: false });
            cleanupPen();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { cleanupPen(); setActiveTool('transform'); }
        };

        canvas.on('mouse:down', onClick);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:dblclick', onDblClick);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            canvas.off('mouse:down', onClick);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:dblclick', onDblClick);
            window.removeEventListener('keydown', onKeyDown);
            cleanupPen();
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, drawPenDot, drawPenSegment, cleanupPen]);

    // === PENCIL TOOL ===
    useEffect(() => {
        if (!canvas || activeTool !== 'pencil') return;
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;

        const onMouseDown = (e: fabric.IEvent) => {
            isDrawingPencil.current = true;
            const ptr = canvas.getPointer(e.e);
            pencilPoints.current = [{ x: ptr.x, y: ptr.y }];
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (!isDrawingPencil.current) return;
            const ptr = canvas.getPointer(e.e);
            pencilPoints.current.push({ x: ptr.x, y: ptr.y });

            const simplified = simplifyPath(pencilPoints.current, 2);
            const pathData = pointsToSvgPath(simplified.flatMap(p => [p]));

            if (pencilPreview.current) canvas.remove(pencilPreview.current);
            if (pathData) {
                const path = new fabric.Path(pathData, {
                    fill: undefined, stroke: '#6366f1', strokeWidth: 2,
                    selectable: false, evented: false,
                });
                canvas.add(path);
                pencilPreview.current = path;
            }
            canvas.renderAll();
        };

        const onMouseUp = () => {
            isDrawingPencil.current = false;
            if (pencilPoints.current.length < 3) {
                if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; }
                canvas.renderAll();
                return;
            }
            const simplified = simplifyPath(pencilPoints.current, 2);
            const pathData = pointsToSvgPath(simplified);
            const id = crypto.randomUUID();
            const path = new fabric.Path(pathData, {
                fill: undefined, stroke: '#6366f1', strokeWidth: 2, strokeLineJoin: 'round', strokeLineCap: 'round',
                data: { id, type: 'path' },
            });
            canvas.add(path);
            canvas.setActiveObject(path);
            canvas.renderAll();
            const count = canvas.getObjects().filter(o => o.data?.type === 'path').length;
            addLayer({ id, name: `Pencil ${count}`, type: 'path', visible: true, locked: false });

            if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; }
            pencilPoints.current = [];
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; }
            pencilPoints.current = [];
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer]);

    // === ZOOM via mouse wheel ===
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleWheel = (e: WheelEvent) => {
            if (activeTool === 'hand') { e.preventDefault(); applyZoom(zoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)); return; }
            if (e.ctrlKey || e.metaKey) { e.preventDefault(); applyZoom(zoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)); }
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [zoom, applyZoom, activeTool]);

    // === SNAP GRID ===
    useEffect(() => {
        const c = canvas; if (!c) return;
        if (!snapGrid) { c.setBackgroundColor('#1e293b', () => c.renderAll()); return; }
        const src = createGridPatternCanvas().toDataURL();
        const pattern = new fabric.Pattern({ source: src, repeat: 'repeat' as any });
        c.setBackgroundColor(pattern, () => c.renderAll());
        const handleMoving = (e: fabric.IEvent) => {
            const obj = e.target; if (!obj) return;
            const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
            obj.set({ left: snap(obj.left || 0), top: snap(obj.top || 0) });
        };
        c.on('object:moving', handleMoving);
        return () => { c.off('object:moving', handleMoving); c.setBackgroundColor('#1e293b', () => c.renderAll()); };
    }, [snapGrid, canvas]);

    // === KEYBOARD SHORTCUTS ===
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); setTimeout(() => compileTimeline(useEditorStore.getState().keyframes, canvas), 10); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); setTimeout(() => compileTimeline(useEditorStore.getState().keyframes, canvas), 10); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedKeyframeId) { e.preventDefault(); removeKeyframe(selectedKeyframeId); compileTimeline(useEditorStore.getState().keyframes, canvas); }
                else if (selectedLayerId) { e.preventDefault(); const obj = canvas?.getObjects().find(o => o.data?.id === selectedLayerId); if (obj) { canvas?.remove(obj); canvas?.discardActiveObject().renderAll(); } removeLayer(selectedLayerId); compileTimeline(useEditorStore.getState().keyframes, canvas); }
            }
            if (e.key === 'v' || e.key === 'V') setActiveTool('transform');
            if (e.key === 'h' || e.key === 'H') setActiveTool(activeTool === 'hand' ? 'transform' : 'hand');
            if (e.key === 'p' || e.key === 'P') setActiveTool(activeTool === 'pen' ? 'transform' : 'pen');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLayerId, selectedKeyframeId, removeLayer, removeKeyframe, undo, redo, canvas, activeTool]);

    const zoomIn = () => applyZoom(zoom + ZOOM_STEP);
    const zoomOut = () => applyZoom(zoom - ZOOM_STEP);
    const zoomReset = () => applyZoom(1);

    return (
        <div ref={containerRef} className="flex-1 h-full bg-slate-900/40 relative flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute top-4 left-4 z-50 flex items-center gap-2 flex-wrap">
                <ToolCluster items={editTools} activeId={activeTool} onSelect={handleToolSelect}
                    isActive={editTools.some(t => t.id === activeTool) && activeTool !== 'transform'} />
                <ToolCluster items={vectorTools} activeId={activeTool} onSelect={handleToolSelect}
                    isActive={vectorTools.some(t => t.id === activeTool)} />
                <div className="w-px h-5 bg-slate-700" />
                <ToolCluster items={shapeTools} activeId={activeShape} onSelect={handleToolSelect} behavior="instant" />
                <button onClick={addTextToCanvas}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1"><span>T</span><span>Text</span></button>
                <button onClick={() => handleToolSelect('hand')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${activeTool === 'hand' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                    title="Hand Tool (H)">✋<span>Hand</span></button>
                <div className="w-px h-5 bg-slate-700" />
                <button onClick={() => setSnapGrid(!snapGrid)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${snapGrid ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                    title="Toggle Snap Grid">⊞ Grid</button>
                <div className="flex items-center gap-0.5 ml-1">
                    {[
                        { a: 'left' as const, icon: '⇤', t: 'Left' }, { a: 'center' as const, icon: '⇔', t: 'Center' },
                        { a: 'right' as const, icon: '⇥', t: 'Right' }, { a: 'top' as const, icon: '⇧', t: 'Top' },
                        { a: 'middle' as const, icon: '⇕', t: 'Middle' }, { a: 'bottom' as const, icon: '⇩', t: 'Bottom' },
                    ].map(({ a, icon, t }) => (
                        <button key={a} onClick={() => alignObjects(a)}
                            className="px-1.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title={t}>{icon}</button>
                    ))}
                </div>
            </div>

            <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1 bg-slate-950/80 rounded-lg border border-slate-700 px-2 py-1">
                <button onClick={zoomOut} className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded" title="Zoom Out">−</button>
                <span className="px-2 text-xs font-mono text-slate-400 min-w-[48px] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={zoomIn} className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded" title="Zoom In">+</button>
                <button onClick={zoomReset} className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-white hover:bg-slate-700 rounded ml-1" title="Reset Zoom">↺</button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-700 shadow-2xl">
                <canvas ref={canvasElRef} />
            </div>
        </div>
    );
}
