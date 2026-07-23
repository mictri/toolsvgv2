import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/editorStore';
import ToolCluster from "../toolbar/ToolCluster";
import type { ToolItem } from "../toolbar/ToolCluster";
import { compileTimeline } from '../timeline/timelineCompiler';
import { parsePathAnchors, parsePathAnchorsFromCmds, cloneCmds, pathCanvasToLocal, pathLocalToCanvas } from './pathNodeEditor';
import { setupPathNodeControls, teardownPathNodeControls, hasPathNodeControls } from './pathNodeControls';
import type { PathAnchorNode } from './pathNodeEditor';

interface CanvasProps {
    fabricCanvasRef: React.MutableRefObject<fabric.Canvas | null>;
    onCanvasReady: (canvas: fabric.Canvas) => void;
}

interface Point { x: number; y: number; }

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 20;

function generatePolygonPoints(sides: number, cx: number, cy: number, radius: number, angle: number = -Math.PI / 2): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i < sides; i++) {
        const a = angle + (i * 2 * Math.PI) / sides;
        pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
    return pts;
}

function generateStarPoints(pointsCount: number, cx: number, cy: number, outerRadius: number, innerRatio: number, angle: number = -Math.PI / 2): Point[] {
    const innerRadius = outerRadius * innerRatio;
    const pts: Point[] = [];
    for (let i = 0; i < pointsCount * 2; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const a = angle + (i * Math.PI) / pointsCount;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
}

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
    { id: 'transform', label: 'Transform', icon: '↖', shortcut: 'V' },
    { id: 'node', label: 'Node', icon: '✧', shortcut: 'A' },
];
const vectorTools: ToolItem[] = [
    { id: 'pen', label: 'Pen', icon: '✏️', shortcut: 'P' },
    { id: 'pencil', label: 'Pencil', icon: '✎', shortcut: 'N' },
    { id: 'add-node', label: 'Add Node', icon: '⊕', shortcut: '+' },
    { id: 'remove-node', label: 'Remove Node', icon: '⊖', shortcut: '-' },
];
const shapeTools: ToolItem[] = [
    { id: 'rect', label: 'Rectangle', icon: '🟦', shortcut: 'M' },
    { id: 'ellipse', label: 'Ellipse', icon: '⭕', shortcut: 'O' },
    { id: 'polygon', label: 'Polygon', icon: '⬡', shortcut: '⇧P' },
    { id: 'star', label: 'Star', icon: '⭐', shortcut: '⇧S' },
    { id: 'line', label: 'Line', icon: '➖', shortcut: 'L' },
];

function simplifyPath(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points;
    let maxDist = 0, maxIdx = 0;
    const first = points[0], last = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const dx = last.x - first.x, dy = last.y - first.y;
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
        d += ` C ${p0.x + (p1.x - p0.x) * 0.5} ${p0.y + (p1.y - p0.y) * 0.5}, ${p1.x - (p2.x - p0.x) * 0.25} ${p1.y - (p2.y - p0.y) * 0.25}, ${p1.x} ${p1.y}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
}

function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function deCasteljau(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const p01 = lerp(p0, p1, t), p12 = lerp(p1, p2, t), p23 = lerp(p2, p3, t);
    return lerp(lerp(p01, p12, t), lerp(p12, p23, t), t);
}
function splitCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { left: Point[]; right: Point[] } {
    const p01 = lerp(p0, p1, t), p12 = lerp(p1, p2, t), p23 = lerp(p2, p3, t);
    const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
    const p0123 = lerp(p012, p123, t);
    return { left: [p0, p01, p012, p0123], right: [p0123, p123, p23, p3] };
}
function closestOnBezier(p0: Point, p1: Point, p2: Point, p3: Point, pt: Point, samples = 20): { t: number; point: Point; dist: number } {
    let best = { t: 0, point: p0, dist: Infinity };
    for (let i = 0; i <= samples; i++) {
        const t = i / samples, q = deCasteljau(p0, p1, p2, p3, t), d = Math.hypot(q.x - pt.x, q.y - pt.y);
        if (d < best.dist) best = { t, point: q, dist: d };
    }
    return best;
}
function closestOnLine(a: Point, b: Point, pt: Point): { t: number; point: Point; dist: number } {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 === 0) return { t: 0, point: a, dist: Math.hypot(pt.x - a.x, pt.y - a.y) };
    let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    return { t, point: q, dist: Math.hypot(q.x - pt.x, q.y - pt.y) };
}

export default function Canvas({ fabricCanvasRef, onCanvasReady }: CanvasProps) {
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeTool = useEditorStore(s => s.activeTool);
    const [zoom, setZoom] = useState(1);
    const [snapGrid, setSnapGrid] = useState(false);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [activeShape, setActiveShape] = useState('rect');

    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
    const penPoints = useRef<Point[]>([]);
    const penHelpers = useRef<fabric.Object[]>([]);
    const penPreviewLine = useRef<fabric.Line | null>(null);
    const penPathPreview = useRef<fabric.Path | null>(null);
    const penIsCurve = useRef<boolean[]>([]);
    const penHandleOffsets = useRef<Point[]>([]);
    const penDragStart = useRef<Point | null>(null);
    const penIsDragging = useRef(false);
    const penLastHandleOffset = useRef<Point | null>(null);
    const penCloseSnap = useRef(false);
    const nodeHoverIndicator = useRef<fabric.Object | null>(null);
    const nodeHoverInfo = useRef<{ obj: fabric.Path; segIdx: number; t: number } | null>(null);
    const removeHoverInfo = useRef<{ obj: fabric.Path; anchorIdx: number } | null>(null);
    const pencilPoints = useRef<Point[]>([]);
    const pencilPreview = useRef<fabric.Path | null>(null);
    const isDrawingPencil = useRef(false);

    // Shape drawing preview
    const drawPreview = useRef<fabric.Object | null>(null);

    // Node tool refs
    const nodeHandles = useRef<fabric.Object[]>([]);
    type NodeDrag = { handle: fabric.Object; kind: 'poly'; target: fabric.Polygon | fabric.Polyline; idx: number };
    const draggingNode = useRef<NodeDrag | null>(null);
    const pathNodeCache = useRef<{ objId: string; anchors: PathAnchorNode[] } | null>(null);

    /** Draft state for Add/Remove Node tools – stores edits in a working copy until commit/cancel */
    interface DraftState {
        pathObj: fabric.Path;
        originalCmds: any[][];
        draftCmds: any[][];
        indicators: fabric.Object[];
        isClosed: boolean;
    }
    const draftState = useRef<DraftState | null>(null);
    const draggingDraftAnchor = useRef<{ pathObj: fabric.Path; anchorIdx: number; indicator: fabric.Object } | null>(null);

    const { selectedLayerId, selectedKeyframeId, removeLayer, undo, redo, selectLayer, addLayer, setTool, setSelectedObjectIds, setActiveObjectProperties } = useEditorStore();

    const applyZoom = useCallback((newZoom: number) => {
        if (!canvas) return;
        canvas.setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom)));
        canvas.renderAll();
        setZoom(canvas.getZoom());
    }, [canvas]);

    const addTextToCanvas = useCallback(() => {
        if (!canvas) return;
        const id = crypto.randomUUID();
        const count = canvas.getObjects().filter(o => o.data?.type === 'text').length + 1;
        const text = new fabric.IText('Type here', { left: 150, top: 150, fontFamily: 'Arial', fontSize: 32, fill: '#e2e8f0', data: { id, type: 'text' } });
        canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
        addLayer({ id, name: `Text ${count}`, type: 'text', visible: true, locked: false });
    }, [canvas, addLayer]);

    const handleToolSelect = useCallback((toolId: string) => {
        // All shapes enter drawing mode
        if (shapeTools.some(t => t.id === toolId)) { setTool(toolId); setActiveShape(toolId); return; }
        if (toolId === 'text') { addTextToCanvas(); return; }
        if (toolId === 'hand') { setTool(activeTool === 'hand' ? 'transform' : 'hand'); return; }
        if (vectorTools.some(t => t.id === toolId) || editTools.some(t => t.id === toolId)) { setTool(activeTool === toolId ? 'transform' : toolId); }
    }, [activeTool, addTextToCanvas, setTool]);

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

    // Init Canvas
    useEffect(() => {
        if (!canvasElRef.current) return;
        const c = new fabric.Canvas(canvasElRef.current, { width: 800, height: 500, backgroundColor: '#1e293b', preserveObjectStacking: true });
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
        canvas.selection = false; canvas.defaultCursor = 'grab'; canvas.renderAll();
        const onMouseDown = (e: fabric.IEvent) => { if (!e.e) return; isPanning.current = true; canvas.defaultCursor = 'grabbing'; const vt = canvas.viewportTransform!; panStart.current = { x: (e.e as MouseEvent).clientX, y: (e.e as MouseEvent).clientY, tx: vt[4], ty: vt[5] }; };
        const onMouseMove = (e: fabric.IEvent) => { if (!isPanning.current || !e.e) return; const me = e.e as MouseEvent; const vt = canvas.viewportTransform!; vt[4] = panStart.current.tx + (me.clientX - panStart.current.x); vt[5] = panStart.current.ty + (me.clientY - panStart.current.y); canvas.requestRenderAll(); };
        const onMouseUp = () => { isPanning.current = false; if (canvas) canvas.defaultCursor = 'grab'; };
        canvas.on('mouse:down', onMouseDown); canvas.on('mouse:move', onMouseMove); canvas.on('mouse:up', onMouseUp);
        return () => { canvas.off('mouse:down', onMouseDown); canvas.off('mouse:move', onMouseMove); canvas.off('mouse:up', onMouseUp); canvas.selection = true; canvas.defaultCursor = 'default'; canvas.renderAll(); };
    }, [activeTool, canvas]);

    // === PEN TOOL (click→L, drag→C, rubber-band, first-point snap) ===
    const buildPenPathD = useCallback((): string => {
        const anchors = penPoints.current;
        if (anchors.length === 0) return '';
        let d = `M ${anchors[0].x} ${anchors[0].y}`;
        for (let i = 1; i < anchors.length; i++) {
            const prev = anchors[i - 1], curr = anchors[i];
            if (penIsCurve.current[i - 1]) {
                const off = penHandleOffsets.current[i - 1];
                d += ` C ${(prev.x + off.x).toFixed(1)} ${(prev.y + off.y).toFixed(1)} ${(curr.x - off.x).toFixed(1)} ${(curr.y - off.y).toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
            } else {
                d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
            }
        }
        return d;
    }, []);
    const updatePenPreview = useCallback(() => {
        if (!canvas) return;
        if (penPathPreview.current) { canvas.remove(penPathPreview.current); penPathPreview.current = null; }
        const d = buildPenPathD();
        if (!d) return;
        const path = new fabric.Path(d, { fill: undefined, stroke: '#6366f1', strokeWidth: 2, strokeLineJoin: 'round', strokeLineCap: 'round', selectable: false, evented: false });
        canvas.add(path);
        penPathPreview.current = path;
    }, [canvas, buildPenPathD]);
    const cleanupPen = useCallback(() => {
        if (!canvas) return;
        penPoints.current = []; penIsCurve.current = []; penHandleOffsets.current = [];
        penHelpers.current.forEach(obj => canvas.remove(obj)); penHelpers.current = [];
        if (penPreviewLine.current) { canvas.remove(penPreviewLine.current); penPreviewLine.current = null; }
        if (penPathPreview.current) { canvas.remove(penPathPreview.current); penPathPreview.current = null; }
        penIsDragging.current = false; penDragStart.current = null;
        penLastHandleOffset.current = null; penCloseSnap.current = false;
        canvas.renderAll();
    }, [canvas]);
    const drawPenDot = useCallback((pt: Point, color = '#a5b4fc') => {
        if (!canvas) return;
        const dot = new fabric.Circle({ left: pt.x, top: pt.y, radius: color === '#f59e0b' ? 4 : 3, fill: color, selectable: false, evented: false, originX: 'center', originY: 'center' });
        canvas.add(dot); penHelpers.current.push(dot);
    }, [canvas]);
    const finalizePenPath = useCallback(() => {
        if (!canvas || penPoints.current.length < 2) { cleanupPen(); return; }
        const d = buildPenPathD();
        const id = crypto.randomUUID();
        const count = canvas.getObjects().filter(o => o.data?.type === 'path').length + 1;
        const path = new fabric.Path(d, {
            fill: undefined, stroke: '#6366f1', strokeWidth: 2,
            strokeLineJoin: 'round', strokeLineCap: 'round',
            data: { id, type: 'path' },
        });
        canvas.add(path); canvas.setActiveObject(path); canvas.renderAll();
        addLayer({ id, name: `Path ${count}`, type: 'path', visible: true, locked: false });
        cleanupPen();
        setTool('transform');
    }, [canvas, addLayer, buildPenPathD, cleanupPen, setTool]);
    const completePenPath = useCallback(() => {
        if (penPoints.current.length >= 2) finalizePenPath(); else cleanupPen();
    }, [finalizePenPath, cleanupPen]);

    useEffect(() => {
        if (!canvas || activeTool !== 'pen') { cleanupPen(); return; }
        canvas.defaultCursor = 'crosshair'; canvas.selection = false;

        const onMouseDown = (e: fabric.IEvent) => {
            if (penCloseSnap.current && penPoints.current.length >= 2) {
                // Close path: click on first anchor
                finalizePenPath();
                return;
            }
            const ptr = canvas.getPointer(e.e);
            penDragStart.current = { x: ptr.x, y: ptr.y };
            penIsDragging.current = false;
        };
        const onMouseMove = (e: fabric.IEvent) => {
            const ptr = canvas.getPointer(e.e);
            const cursorPt: Point = { x: ptr.x, y: ptr.y };
            const anchors = penPoints.current;

            // First-point snap check
            penCloseSnap.current = false;
            if (anchors.length >= 2) {
                const first = anchors[0];
                const dist = Math.sqrt((cursorPt.x - first.x) ** 2 + (cursorPt.y - first.y) ** 2);
                if (dist < 8) {
                    penCloseSnap.current = true;
                    canvas.defaultCursor = 'pointer';
                } else {
                    canvas.defaultCursor = 'crosshair';
                }
            }

            // Handle drag visualization
            if (penIsDragging.current && penDragStart.current) {
                // Show handle line from drag anchor to cursor
                penHelpers.current.forEach(obj => canvas.remove(obj));
                penHelpers.current = [];
                drawPenDot(penDragStart.current);
                const handleLine = new fabric.Line([penDragStart.current.x, penDragStart.current.y, cursorPt.x, cursorPt.y], {
                    stroke: '#f59e0b', strokeWidth: 1.5, strokeDashArray: [3, 3] as any, selectable: false, evented: false,
                });
                canvas.add(handleLine); penHelpers.current.push(handleLine);
                // Show symmetric handle preview
                drawPenDot(cursorPt, '#f59e0b');
                canvas.renderAll();
                return;
            }

            // Rubber-band: dashed line from last anchor to cursor
            if (penPreviewLine.current) { canvas.remove(penPreviewLine.current); penPreviewLine.current = null; }
            if (anchors.length > 0) {
                const last = anchors[anchors.length - 1];
                const line = new fabric.Line([last.x, last.y, cursorPt.x, cursorPt.y], {
                    stroke: '#a5b4fc', strokeWidth: 1, strokeDashArray: [4, 4] as any, selectable: false, evented: false,
                });
                canvas.add(line); penPreviewLine.current = line;
            }
            canvas.renderAll();
        };
        const onMouseUp = (e: fabric.IEvent) => {
            const ptr = canvas.getPointer(e.e);
            const pt: Point = { x: ptr.x, y: ptr.y };
            const dragStart = penDragStart.current;

            if (!dragStart) return;
            const dx = pt.x - dragStart.x;
            const dy = pt.y - dragStart.y;
            const dragDist = Math.sqrt(dx * dx + dy * dy);

            if (penIsDragging.current || dragDist > 3) {
                // Drag: create bezier curve segment
                if (penPoints.current.length === 0) {
                    // First point: just place anchor, no segment yet
                    penPoints.current.push({ x: dragStart.x, y: dragStart.y });
                    drawPenDot(penPoints.current[0]);
                    // Now add the second point from the drag release
                    penPoints.current.push(pt);
                    penIsCurve.current.push(true);
                    penHandleOffsets.current.push({ x: dx, y: dy });
                    penLastHandleOffset.current = { x: dx, y: dy };
                    drawPenDot(pt);
                } else {
                    // Drag defines a curve from the last anchor (dragStart) to pt
                    // But dragStart should be the same as penPoints[last] if release happened elsewhere
                    // We need to figure out if dragStart === last anchor
                    const last = penPoints.current[penPoints.current.length - 1];
                    if (Math.abs(dragStart.x - last.x) < 0.1 && Math.abs(dragStart.y - last.y) < 0.1) {
                        penPoints.current.push(pt);
                        penIsCurve.current.push(true);
                        penHandleOffsets.current.push({ x: dx, y: dy });
                        penLastHandleOffset.current = { x: dx, y: dy };
                        drawPenDot(pt);
                    } else {
                        // Drag started from somewhere else — add as regular click point
                        penPoints.current.push(pt);
                        penIsCurve.current.push(false);
                        penHandleOffsets.current.push({ x: 0, y: 0 });
                        penLastHandleOffset.current = null;
                        drawPenDot(pt);
                    }
                }
            } else {
                // Click: add straight line segment
                if (penPoints.current.length === 0) {
                    penPoints.current.push(pt);
                    drawPenDot(pt);
                } else {
                    penPoints.current.push(pt);
                    penIsCurve.current.push(false);
                    penHandleOffsets.current.push({ x: 0, y: 0 });
                    penLastHandleOffset.current = null;
                    drawPenDot(pt);
                }
            }

            penIsDragging.current = false;
            penDragStart.current = null;
            // Clean up handle visuals
            penHelpers.current.forEach(obj => { if (obj !== penPreviewLine.current) canvas.remove(obj); });
            penHelpers.current = [];
            // Re-draw all dots
            penPoints.current.forEach(p => drawPenDot(p));
            // Update the accumulated path preview
            updatePenPreview();
            canvas.renderAll();
        };
        const onDblClick = () => { completePenPath(); };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { cleanupPen(); setTool('transform'); }
            if (e.key === 'Enter') { completePenPath(); }
        };
        // Distinguish drag from click: on mouse move during button held
        const previewMouseMove = (e: fabric.IEvent) => {
            if (!penDragStart.current) return;
            const ptr = canvas.getPointer(e.e);
            const dx = ptr.x - penDragStart.current.x;
            const dy = ptr.y - penDragStart.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 3) {
                penIsDragging.current = true;
            }
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:move', previewMouseMove);
        canvas.on('mouse:up', onMouseUp);
        canvas.on('mouse:dblclick', onDblClick);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:move', previewMouseMove);
            canvas.off('mouse:up', onMouseUp);
            canvas.off('mouse:dblclick', onDblClick);
            window.removeEventListener('keydown', onKeyDown);
            cleanupPen();
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, drawPenDot, updatePenPreview, cleanupPen, completePenPath, setTool]);

    // === PENCIL TOOL ===
    useEffect(() => {
        if (!canvas || activeTool !== 'pencil') return;
        canvas.defaultCursor = 'crosshair'; canvas.selection = false;
        const onMouseDown = (e: fabric.IEvent) => { isDrawingPencil.current = true; const ptr = canvas.getPointer(e.e); pencilPoints.current = [{ x: ptr.x, y: ptr.y }]; };
        const onMouseMove = (e: fabric.IEvent) => { if (!isDrawingPencil.current) return; const ptr = canvas.getPointer(e.e); pencilPoints.current.push({ x: ptr.x, y: ptr.y }); const simplified = simplifyPath(pencilPoints.current, 2); const pathData = pointsToSvgPath(simplified.flatMap(p => [p])); if (pencilPreview.current) canvas.remove(pencilPreview.current); if (pathData) { const path = new fabric.Path(pathData, { fill: undefined, stroke: '#6366f1', strokeWidth: 2, selectable: false, evented: false }); canvas.add(path); pencilPreview.current = path; } canvas.renderAll(); };
        const onMouseUp = () => { isDrawingPencil.current = false; if (pencilPoints.current.length < 3) { if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; } canvas.renderAll(); return; } const simplified = simplifyPath(pencilPoints.current, 2); const pathData = pointsToSvgPath(simplified); const id = crypto.randomUUID(); const path = new fabric.Path(pathData, { fill: undefined, stroke: '#6366f1', strokeWidth: 2, strokeLineJoin: 'round', strokeLineCap: 'round', data: { id, type: 'path' } }); canvas.add(path); canvas.setActiveObject(path); canvas.renderAll(); const count = canvas.getObjects().filter(o => o.data?.type === 'path').length; addLayer({ id, name: `Pencil ${count}`, type: 'path', visible: true, locked: false }); if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; } pencilPoints.current = []; setTool('transform'); };
        canvas.on('mouse:down', onMouseDown); canvas.on('mouse:move', onMouseMove); canvas.on('mouse:up', onMouseUp);
        return () => { canvas.off('mouse:down', onMouseDown); canvas.off('mouse:move', onMouseMove); canvas.off('mouse:up', onMouseUp); if (pencilPreview.current) { canvas.remove(pencilPreview.current); pencilPreview.current = null; } pencilPoints.current = []; canvas.defaultCursor = 'default'; canvas.selection = true; };
    }, [activeTool, canvas, addLayer, setTool]);

    // === DRAFT HELPERS (Add / Remove Node) ===
    const clearDraftIndicators = useCallback(() => {
        if (!canvas || !draftState.current) return;
        draftState.current.indicators.forEach(obj => canvas.remove(obj));
        draftState.current.indicators = [];
    }, [canvas]);

    const enterDraftMode = useCallback((pathObj: fabric.Path, toolType: 'add' | 'remove') => {
        if (!canvas) return;
        // Exit any existing draft first
        if (draftState.current) {
            clearDraftIndicators();
            draftState.current = null;
        }
        const cmds = (pathObj.path as unknown as any[][]) || [];
        const isClosed = cmds.length > 0 && (cmds[cmds.length - 1]?.[0] === 'Z' || cmds[cmds.length - 1]?.[0] === 'z');
        draftState.current = {
            pathObj,
            originalCmds: cloneCmds(cmds),
            draftCmds: cloneCmds(cmds),
            indicators: [],
            isClosed,
        };
        // Disable objectCaching + hide transform handles to show only anchor dots
        pathObj.set({
            objectCaching: false,
            hasControls: false,
            hasBorders: false,
        });
        // Show anchor indicators from draft
        const anchors = parsePathAnchorsFromCmds(draftState.current.draftCmds);
        anchors.forEach((a, idx) => {
            const cp = pathLocalToCanvas(pathObj, { x: a.x, y: a.y });
            const dot = new fabric.Circle({
                left: cp.x - 3, top: cp.y - 3, radius: 3,
                fill: toolType === 'add' ? '#22c55e' : '#ef4444',
                stroke: '#fff', strokeWidth: 1.5,
                selectable: false, evented: true,
                data: { draftAnchor: true, anchorIdx: idx, pathObjId: pathObj.data?.id ?? '' },
            });
            canvas.add(dot);
            draftState.current!.indicators.push(dot);
        });
        canvas.renderAll();
    }, [canvas, clearDraftIndicators]);

    const commitDraft = useCallback(() => {
        if (!canvas || !draftState.current) return;
        const { pathObj, draftCmds } = draftState.current;
        clearDraftIndicators();
        // Push undo snapshot
        const store = useEditorStore.getState();
        const snapshot = { layers: JSON.parse(JSON.stringify(store.layers)) };
        useEditorStore.setState({
            undoStack: [...store.undoStack, snapshot],
            redoStack: [],
        });
        // Apply final path data & restore caching/handles synchronously
        pathObj.set({ path: draftCmds as any, objectCaching: true, hasControls: true, hasBorders: true });
        pathObj.setCoords();
        canvas.requestRenderAll();
        draftState.current = null;
        // Recompile timeline after state settles
        setTimeout(() => compileTimeline(useEditorStore.getState().animatedObjects, canvas), 10);
    }, [canvas, clearDraftIndicators]);

    /** Cancel draft and restore original path (available for Escape key shortcut) */
    const cancelDraft = useCallback(() => {
        if (!canvas || !draftState.current) return;
        clearDraftIndicators();
        const { pathObj, originalCmds } = draftState.current;
        pathObj.set({ path: cloneCmds(originalCmds) as any, objectCaching: true, hasControls: true, hasBorders: true });
        pathObj.setCoords();
        canvas.requestRenderAll();
        draftState.current = null;
    }, [canvas, clearDraftIndicators]);

    // === UNIVERSAL SHAPE → PATH CONVERSION ===
    const convertShapeToPath = useCallback((obj: fabric.Object): fabric.Path | null => {
        if (!canvas) return null;
        const o = obj as any;
        const type = obj.type;
        let d = '';

        if (type === 'rect') {
            const w = o.width ?? 100, h = o.height ?? 100;
            const rx = o.rx ?? 0, ry = o.ry ?? 0;
            if (rx > 0 || ry > 0) {
                const rrx = rx || ry, rry = ry || rx;
                d = `M ${rrx} 0 L ${w - rrx} 0 C ${w} 0 ${w} ${rry} ${w} ${rry} L ${w} ${h - rry} C ${w} ${h} ${w - rrx} ${h} ${w - rrx} ${h} L ${rrx} ${h} C 0 ${h} 0 ${h - rry} 0 ${h - rry} L 0 ${rry} C 0 0 ${rrx} 0 ${rrx} 0 Z`;
            } else {
                d = `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
            }
        } else if (type === 'ellipse') {
            const rx = o.rx ?? 50, ry = o.ry ?? 50;
            const k = 0.5522847498;
            d = `M ${2 * rx} ${ry} C ${2 * rx} ${ry + k * ry} ${rx + k * rx} ${2 * ry} ${rx} ${2 * ry} C ${rx - k * rx} ${2 * ry} 0 ${ry + k * ry} 0 ${ry} C 0 ${ry - k * ry} ${rx - k * rx} 0 ${rx} 0 C ${rx + k * rx} 0 ${2 * rx} ${ry - k * ry} ${2 * rx} ${ry} Z`;
        } else if (type === 'polygon' || type === 'polyline') {
            const pts = o.points?.map((p: any) => ({ x: p.x, y: p.y })) ?? [];
            if (pts.length < 2) return null;
            d = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            if (type === 'polygon') d += ' Z';
        } else if (type === 'line') {
            d = `M ${o.x1 ?? 0} ${o.y1 ?? 0} L ${o.x2 ?? 0} ${o.y2 ?? 0}`;
        } else {
            return null;
        }

        const path = new fabric.Path(d, {
            left: o.left ?? 0, top: o.top ?? 0,
            angle: o.angle ?? 0,
            scaleX: o.scaleX ?? 1, scaleY: o.scaleY ?? 1,
            skewX: o.skewX ?? 0, skewY: o.skewY ?? 0,
            flipX: o.flipX ?? false, flipY: o.flipY ?? false,
            originX: o.originX ?? 'left', originY: o.originY ?? 'top',
            fill: o.fill ?? '#6366f1', stroke: o.stroke ?? '#4f46e5',
            strokeWidth: o.strokeWidth ?? 2, opacity: o.opacity ?? 1,
            strokeLineCap: o.strokeLineCap ?? 'round',
            strokeLineJoin: o.strokeLineJoin ?? 'round',
            data: { ...(o.data || {}), type: 'path', originalType: type, convertedFrom: o.data?.id },
        });
        canvas.remove(obj);
        canvas.add(path);
        canvas.setActiveObject(path);
        canvas.renderAll();

        const store = useEditorStore.getState();
        store.setSelectedObjectIds([path.data?.id as string]);
        const layer = store.layers.find(l => l.id === o.data?.id);
        if (layer) {
            const updatedLayers = store.layers.map(l =>
                l.id === layer.id ? { ...l, id: path.data?.id as string, type: 'path' as const } : l
            );
            useEditorStore.setState({ layers: updatedLayers });
        }
        return path;
    }, [canvas]);

    // === ADD NODE TOOL (+) ===
    const addNodeCleanup = useCallback(() => {
        if (!canvas) return;
        if (nodeHoverIndicator.current) { canvas.remove(nodeHoverIndicator.current); nodeHoverIndicator.current = null; }
        nodeHoverInfo.current = null;
    }, [canvas]);

    /** Add a node to the draft cmds at the given segment using De Casteljau split */
    const applyAddNode = useCallback((segIdx: number, t: number) => {
        const ds = draftState.current;
        if (!ds) return;
        const cmds = ds.draftCmds;
        const anchors = parsePathAnchorsFromCmds(cmds);
        if (anchors.length < 2) return;
        const a = anchors[segIdx];
        const next = anchors[(segIdx + 1) % anchors.length];
        const aCmdIdx = a.cmdIdx;
        const nextCmdIdx = next.cmdIdx;
        const p0: Point = { x: a.x, y: a.y };
        const p3: Point = { x: next.x, y: next.y };
        const hasHandleOut = !!a.handleOut;
        const hasHandleIn = !!next.handleIn;
        const p1 = hasHandleOut ? { x: a.handleOut!.x, y: a.handleOut!.y } : p0;
        const p2 = hasHandleIn ? { x: next.handleIn!.x, y: next.handleIn!.y } : p3;
        const isLine = !hasHandleOut && !hasHandleIn;

        if (isLine) {
            const mid = lerp(p0, p3, t);
            const removeCount = (nextCmdIdx > aCmdIdx ? nextCmdIdx - aCmdIdx : cmds.length - aCmdIdx - 1);
            cmds.splice(aCmdIdx + 1, removeCount, ['L', mid.x, mid.y], ['L', p3.x, p3.y]);
        } else {
            const split = splitCubicBezier(p0, p1, p2, p3, t);
            const left = split.left, right = split.right;
            const removeCount = (nextCmdIdx > aCmdIdx ? nextCmdIdx - aCmdIdx : cmds.length - aCmdIdx - 1);
            cmds.splice(aCmdIdx + 1, removeCount,
                ['C', left[1].x, left[1].y, left[2].x, left[2].y, left[3].x, left[3].y],
                ['C', right[1].x, right[1].y, right[2].x, right[2].y, right[3].x, right[3].y],
            );
        }
    }, []);

    useEffect(() => {
        if (!canvas || activeTool !== 'add-node') {
            // Commit draft when leaving add-node mode
            if (draftState.current) commitDraft();
            addNodeCleanup();
            return;
        }
        canvas.defaultCursor = 'crosshair'; canvas.selection = false;

        // If a shape (or path) is already selected, convert + enter draft mode
        const active = canvas.getActiveObject();
        if (active && !draftState.current) {
            let targetObj = active;
            if (active.type !== 'path') {
                targetObj = convertShapeToPath(active) || active;
            }
            if (targetObj.type === 'path') enterDraftMode(targetObj as fabric.Path, 'add');
        }

        const onMouseMove = (e: fabric.IEvent) => {
            // Anchor drag in progress
            if (draggingDraftAnchor.current) {
                const { pathObj, anchorIdx, indicator } = draggingDraftAnchor.current;
                const ds = draftState.current;
                if (!ds || ds.pathObj !== pathObj) { draggingDraftAnchor.current = null; return; }
                const ptr = canvas.getPointer(e.e);
                const local = pathCanvasToLocal(pathObj, { x: ptr.x, y: ptr.y });
                const anchors = parsePathAnchorsFromCmds(ds.draftCmds);
                if (anchorIdx >= 0 && anchorIdx < anchors.length) {
                    const cmd = ds.draftCmds[anchors[anchorIdx].cmdIdx];
                    if (cmd[0] === 'M' || cmd[0] === 'L') { cmd[1] = local.x; cmd[2] = local.y; }
                    else if (cmd[0] === 'C') { cmd[5] = local.x; cmd[6] = local.y; }
                    pathObj.set({ path: ds.draftCmds as any });
                    pathObj.setCoords();
                    const cp = pathLocalToCanvas(pathObj, { x: local.x, y: local.y });
                    indicator.set({ left: cp.x - 3, top: cp.y - 3 });
                }
                canvas.renderAll(); return;
            }

            canvas.defaultCursor = 'not-allowed';
            const ptr = canvas.getPointer(e.e);
            const target = canvas.findTarget(e.e, false);
            addNodeCleanup();
            if (target && target.data?.draftAnchor) {
                canvas.defaultCursor = 'grab';
                canvas.renderAll();
                return;
            }
            if (!target) { canvas.renderAll(); return; }
            if (target.type !== 'path') {
                const canConvert = ['rect', 'ellipse', 'polygon', 'polyline', 'line'].includes(target.type as string);
                canvas.defaultCursor = canConvert ? 'pointer' : 'not-allowed';
                canvas.renderAll();
                return;
            }
            const pathObj = target as fabric.Path;
            const cmds = (draftState.current?.pathObj === pathObj && draftState.current?.draftCmds)
                ? draftState.current.draftCmds
                : (pathObj.path as unknown as any[][]);
            const anchors = parsePathAnchorsFromCmds(cmds);
            if (anchors.length < 2) { canvas.renderAll(); return; }

            // Grab cursor near existing anchors
            const local = pathCanvasToLocal(pathObj, { x: ptr.x, y: ptr.y });
            for (const a of anchors) {
                if (Math.hypot(local.x - a.x, local.y - a.y) < 8) {
                    canvas.defaultCursor = 'grab';
                    canvas.renderAll();
                    return;
                }
            }

            // Find closest segment
            let best = { segIdx: -1, t: 0, point: { x: 0, y: 0 }, dist: Infinity };
            for (let i = 0; i < anchors.length; i++) {
                const a = anchors[i];
                const next = anchors[(i + 1) % anchors.length];
                const p0: Point = { x: a.x, y: a.y };
                const p3: Point = { x: next.x, y: next.y };
                const p1 = a.handleOut ? { x: a.handleOut.x, y: a.handleOut.y } : p0;
                const p2 = next.handleIn ? { x: next.handleIn.x, y: next.handleIn.y } : p3;
                const isLine = !a.handleOut && !next.handleIn;
                const loc = pathCanvasToLocal(pathObj, { x: ptr.x, y: ptr.y });
                const result = isLine ? closestOnLine(p0, p3, loc) : closestOnBezier(p0, p1, p2, p3, loc, 20);
                if (result.dist < best.dist) { best = { segIdx: i, ...result }; }
            }
            if (best.dist > 15) { canvas.renderAll(); return; }
            canvas.defaultCursor = 'crosshair';

            const off = pathObj.pathOffset || { x: 0, y: 0 };
            const matrix = pathObj.calcTransformMatrix();
            const canvasPt = fabric.util.transformPoint(
                new fabric.Point(best.point.x - off.x, best.point.y - off.y), matrix,
            );
            const dot = new fabric.Circle({
                left: canvasPt.x - 6, top: canvasPt.y - 6, radius: 6,
                fill: '#22c55e', stroke: '#fff', strokeWidth: 2,
                opacity: 0.7,
                selectable: false, evented: false,
            });
            canvas.add(dot); nodeHoverIndicator.current = dot;
            nodeHoverInfo.current = { obj: pathObj, segIdx: best.segIdx, t: best.t };
            canvas.renderAll();
        };

        const onMouseDown = (e: fabric.IEvent) => {
            const tgt = e.target;
            // Drag existing anchor if hitting a draft indicator
            if (tgt && tgt.data?.draftAnchor && draftState.current) {
                draggingDraftAnchor.current = {
                    pathObj: draftState.current.pathObj,
                    anchorIdx: tgt.data.anchorIdx as number,
                    indicator: tgt,
                };
                return;
            }
            // Auto-convert non-path shapes on click
            if (tgt && !tgt.data?.draftAnchor && ['rect', 'ellipse', 'polygon', 'polyline', 'line'].includes(tgt.type as string)) {
                const converted = convertShapeToPath(tgt);
                if (converted) {
                    enterDraftMode(converted, 'add');
                    canvas.renderAll();
                    return;
                }
            }
            const info = nodeHoverInfo.current;
            if (!info) return;
            const pathObj = info.obj;
            if (!draftState.current || draftState.current.pathObj !== pathObj) {
                enterDraftMode(pathObj, 'add');
            }
            applyAddNode(info.segIdx, info.t);
            addNodeCleanup();
            clearDraftIndicators();
            const anchors = parsePathAnchorsFromCmds(draftState.current!.draftCmds);
            anchors.forEach((a, idx) => {
                const cp = pathLocalToCanvas(pathObj, { x: a.x, y: a.y });
                const dot = new fabric.Circle({
                    left: cp.x - 3, top: cp.y - 3, radius: 3,
                    fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5,
                    selectable: false, evented: true,
                    data: { draftAnchor: true, anchorIdx: idx, pathObjId: pathObj.data?.id ?? '' },
                });
                canvas.add(dot);
                draftState.current!.indicators.push(dot);
            });
            canvas.renderAll();
        };

        const onMouseUp = () => {
            draggingDraftAnchor.current = null;
        };

        const onDblClick = () => {
            if (draftState.current) {
                commitDraft();
                setTool('transform');
            }
        };

        const onCanvasMouseDown = (e: fabric.IEvent) => {
            if (!e.target && draftState.current) {
                commitDraft();
                setTool('transform');
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (draftState.current) cancelDraft();
                setTool('transform');
            }
        };
        window.addEventListener('keydown', onKeyDown);

        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:up', onMouseUp);
        canvas.on('mouse:dblclick', onDblClick);
        canvas.on('selection:cleared', onCanvasMouseDown);

        return () => {
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:up', onMouseUp);
            canvas.off('mouse:dblclick', onDblClick);
            canvas.off('selection:cleared', onCanvasMouseDown);
            window.removeEventListener('keydown', onKeyDown);
            addNodeCleanup();
            draggingDraftAnchor.current = null;
            if (draftState.current) commitDraft();
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addNodeCleanup, enterDraftMode, commitDraft, cancelDraft, clearDraftIndicators, applyAddNode, setTool, convertShapeToPath]);

    // === REMOVE NODE TOOL (-) ===
    const removeNodeCleanup = useCallback(() => {
        if (!canvas) return;
        if (nodeHoverIndicator.current) { canvas.remove(nodeHoverIndicator.current); nodeHoverIndicator.current = null; }
        removeHoverInfo.current = null;
    }, [canvas]);

    /** Remove a node from the draft cmds at the given anchor index */
    const applyRemoveNode = useCallback((anchorIdx: number) => {
        const ds = draftState.current;
        if (!ds) return;
        const cmds = ds.draftCmds;
        const anchors = parsePathAnchorsFromCmds(cmds);
        if (anchors.length < 3) return;
        const aidx = anchorIdx;
        const anchor = anchors[aidx];
        const isClosed = ds.isClosed;
        const prevAnchor = aidx > 0 ? anchors[aidx - 1] : (isClosed ? anchors[anchors.length - 1] : null);
        const nextAnchor = aidx < anchors.length - 1 ? anchors[aidx + 1] : (isClosed ? anchors[0] : null);
        const cmdToRemove = anchor.cmdIdx;

        // Handle previous command's handleOut (C → L conversion)
        if (prevAnchor && prevAnchor.handleOut) {
            const prevCmd = cmds[prevAnchor.cmdIdx];
            if (prevCmd && prevCmd[0] === 'C') {
                prevCmd[0] = 'L';
                prevCmd.length = 3;
                prevCmd[1] = anchor.x;
                prevCmd[2] = anchor.y;
            }
        }
        // Adjust next command's handleIn to point toward previous anchor
        if (nextAnchor && nextAnchor.handleIn) {
            const nextCmd = cmds[nextAnchor.cmdIdx];
            if (nextCmd && nextCmd[0] === 'C') {
                const prevPt = prevAnchor ? { x: prevAnchor.x, y: prevAnchor.y } : { x: anchor.x - 50, y: anchor.y };
                const dx = nextAnchor.x - prevPt.x;
                const dy = nextAnchor.y - prevPt.y;
                nextCmd[3] = nextAnchor.x - dx * 0.3;
                nextCmd[4] = nextAnchor.y - dy * 0.3;
            }
        }

        cmds.splice(cmdToRemove, 1);
        // If first anchor was M and was removed, ensure a new M exists
        if (aidx === 0 && cmds.length > 0 && cmds[0][0] !== 'M') {
            const reparse = parsePathAnchorsFromCmds(cmds);
            if (reparse.length > 0) {
                cmds.unshift(['M', reparse[0].x, reparse[0].y]);
            }
        }
    }, []);

    useEffect(() => {
        if (!canvas || activeTool !== 'remove-node') {
            // Commit/cancel draft when leaving remove-node mode
            if (draftState.current) commitDraft();
            removeNodeCleanup();
            return;
        }
        canvas.defaultCursor = 'crosshair'; canvas.selection = false;

        // If a shape (or path) is already selected, convert + enter draft mode
        const active = canvas.getActiveObject();
        if (active && !draftState.current) {
            let targetObj = active;
            if (active.type !== 'path') {
                targetObj = convertShapeToPath(active) || active;
            }
            if (targetObj.type === 'path') enterDraftMode(targetObj as fabric.Path, 'remove');
        }

        const onMouseMove = (e: fabric.IEvent) => {
            // Anchor drag in progress
            if (draggingDraftAnchor.current) {
                const { pathObj, anchorIdx, indicator } = draggingDraftAnchor.current;
                const ds = draftState.current;
                if (!ds || ds.pathObj !== pathObj) { draggingDraftAnchor.current = null; return; }
                const ptr = canvas.getPointer(e.e);
                const local = pathCanvasToLocal(pathObj, { x: ptr.x, y: ptr.y });
                const anchors = parsePathAnchorsFromCmds(ds.draftCmds);
                if (anchorIdx >= 0 && anchorIdx < anchors.length) {
                    const cmd = ds.draftCmds[anchors[anchorIdx].cmdIdx];
                    if (cmd[0] === 'M' || cmd[0] === 'L') { cmd[1] = local.x; cmd[2] = local.y; }
                    else if (cmd[0] === 'C') { cmd[5] = local.x; cmd[6] = local.y; }
                    pathObj.set({ path: ds.draftCmds as any });
                    pathObj.setCoords();
                    const cp = pathLocalToCanvas(pathObj, { x: local.x, y: local.y });
                    indicator.set({ left: cp.x - 3, top: cp.y - 3 });
                }
                canvas.renderAll(); return;
            }

            canvas.defaultCursor = 'not-allowed';
            const ptr = canvas.getPointer(e.e);
            const target = canvas.findTarget(e.e, false);
            removeNodeCleanup();
            if (target && target.data?.draftAnchor) {
                canvas.defaultCursor = 'grab';
                canvas.renderAll();
                return;
            }
            if (!target) { canvas.renderAll(); return; }
            if (target.type !== 'path') {
                const canConvert = ['rect', 'ellipse', 'polygon', 'polyline', 'line'].includes(target.type as string);
                canvas.defaultCursor = canConvert ? 'pointer' : 'not-allowed';
                canvas.renderAll();
                return;
            }
            const pathObj = target as fabric.Path;
            const cmds = (draftState.current?.pathObj === pathObj && draftState.current?.draftCmds)
                ? draftState.current.draftCmds
                : (pathObj.path as unknown as any[][]);
            const anchors = parsePathAnchorsFromCmds(cmds);
            if (anchors.length < 3) { canvas.renderAll(); return; }

            let bestIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < anchors.length; i++) {
                const a = anchors[i];
                const local = pathCanvasToLocal(pathObj, { x: ptr.x, y: ptr.y });
                const d = Math.hypot(local.x - a.x, local.y - a.y);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestDist > 8) { canvas.renderAll(); return; }
            canvas.defaultCursor = 'grab';

            const anchor = anchors[bestIdx];
            const off = pathObj.pathOffset || { x: 0, y: 0 };
            const matrix = pathObj.calcTransformMatrix();
            const canvasPt = fabric.util.transformPoint(
                new fabric.Point(anchor.x - off.x, anchor.y - off.y), matrix,
            );
            const dot = new fabric.Circle({
                left: canvasPt.x - 6, top: canvasPt.y - 6, radius: 6,
                fill: '#ef4444', stroke: '#fff', strokeWidth: 2,
                selectable: false, evented: false,
            });
            canvas.add(dot); nodeHoverIndicator.current = dot;
            removeHoverInfo.current = { obj: pathObj, anchorIdx: bestIdx };
            canvas.renderAll();
        };
        const onMouseDown = (e: fabric.IEvent) => {
            const tgt = e.target;
            // Drag existing anchor if hitting a draft indicator
            if (tgt && tgt.data?.draftAnchor && draftState.current) {
                draggingDraftAnchor.current = {
                    pathObj: draftState.current.pathObj,
                    anchorIdx: tgt.data.anchorIdx as number,
                    indicator: tgt,
                };
                return;
            }
            // Auto-convert non-path shapes on click
            if (tgt && !tgt.data?.draftAnchor && ['rect', 'ellipse', 'polygon', 'polyline', 'line'].includes(tgt.type as string)) {
                const converted = convertShapeToPath(tgt);
                if (converted) {
                    enterDraftMode(converted, 'remove');
                    canvas.renderAll();
                    return;
                }
            }
            const info = removeHoverInfo.current;
            if (!info) return;
            const pathObj = info.obj;
            if (!draftState.current || draftState.current.pathObj !== pathObj) {
                enterDraftMode(pathObj, 'remove');
            }
            applyRemoveNode(info.anchorIdx);
            removeNodeCleanup();
            clearDraftIndicators();
            const anchors = parsePathAnchorsFromCmds(draftState.current!.draftCmds);
            if (anchors.length < 3) {
                commitDraft();
                setTool('transform');
                return;
            }
            anchors.forEach((a, idx) => {
                const cp = pathLocalToCanvas(pathObj, { x: a.x, y: a.y });
                const dot = new fabric.Circle({
                    left: cp.x - 3, top: cp.y - 3, radius: 3,
                    fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5,
                    selectable: false, evented: true,
                    data: { draftAnchor: true, anchorIdx: idx, pathObjId: pathObj.data?.id ?? '' },
                });
                canvas.add(dot);
                draftState.current!.indicators.push(dot);
            });
            canvas.renderAll();
        };

        const onMouseUp = () => {
            draggingDraftAnchor.current = null;
        };

        const onDblClick = () => {
            if (draftState.current) {
                commitDraft();
                setTool('transform');
            }
        };

        const onCanvasMouseDown = (e: fabric.IEvent) => {
            if (!e.target && draftState.current) {
                commitDraft();
                setTool('transform');
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (draftState.current) cancelDraft();
                setTool('transform');
            }
        };
        window.addEventListener('keydown', onKeyDown);

        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:up', onMouseUp);
        canvas.on('mouse:dblclick', onDblClick);
        canvas.on('selection:cleared', onCanvasMouseDown);

        return () => {
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:up', onMouseUp);
            canvas.off('mouse:dblclick', onDblClick);
            canvas.off('selection:cleared', onCanvasMouseDown);
            window.removeEventListener('keydown', onKeyDown);
            removeNodeCleanup();
            draggingDraftAnchor.current = null;
            if (draftState.current) commitDraft();
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, removeNodeCleanup, enterDraftMode, commitDraft, cancelDraft, clearDraftIndicators, applyRemoveNode, setTool, convertShapeToPath]);

    // === NODE TOOL (Polygon/Polyline + Path) ===
    const cleanupNodeHandles = useCallback(() => {
        if (!canvas) return;
        nodeHandles.current.forEach(h => canvas.remove(h));
        nodeHandles.current = [];
        pathNodeCache.current = null;
        // Teardown fabric.Control-based path node controls,
        // finalize path + bounding box, then restore objectCaching
        canvas.getObjects().forEach((obj) => {
            if (obj.type === 'path' && hasPathNodeControls(obj as fabric.Path)) {
                const pathObj = obj as fabric.Path;
                teardownPathNodeControls(pathObj);
                // Finalize: re-apply path data to let Fabric recalculate bounding box
                const finalCmds = ((pathObj.path || []) as any).slice();
                pathObj.set({ path: finalCmds as any, objectCaching: false });
                pathObj.setCoords();
                // Restore caching
                pathObj.set({ objectCaching: true });
            }
        });
        canvas.renderAll();
    }, [canvas]);

    const showNodeHandles = useCallback((targetObj: fabric.Object) => {
        cleanupNodeHandles();
        if (!canvas) return;
        const type = targetObj.type;

        // --- Polygon / Polyline ---
        if (type === 'polygon' || type === 'polyline') {
            const poly = targetObj as fabric.Polygon | fabric.Polyline;
            const pts = poly.points;
            if (!pts) return;
            const matrix = poly.calcTransformMatrix();
            const pathOff = poly.pathOffset || { x: 0, y: 0 };
            pts.forEach((pt, i) => {
                const local = new fabric.Point(pt.x - pathOff.x, pt.y - pathOff.y);
                const canvasPt = fabric.util.transformPoint(local, matrix);
                const handle = new fabric.Circle({
                    left: canvasPt.x - 4, top: canvasPt.y - 4,
                    radius: 4, fill: '#818cf8', stroke: '#fff',
                    strokeWidth: 1.5, selectable: false, evented: true,
                    data: { nodeHandleType: 'poly', nodeIndex: i },
                });
                canvas.add(handle);
                nodeHandles.current.push(handle);
            });
            canvas.renderAll();
            return;
        }

        // --- fabric.Path (using fabric.Control) ---
        if (type === 'path') {
            const pathObj = targetObj as fabric.Path;
            // Disable objectCaching to prevent clipping during live editing
            pathObj.set({ objectCaching: false });
            const anchors = parsePathAnchors(pathObj);
            pathNodeCache.current = { objId: pathObj.data?.id as string || '', anchors };
            setupPathNodeControls(pathObj, anchors);
            canvas.renderAll();
            return;
        }

        // Fallback: unsupported type
        cleanupNodeHandles();
    }, [canvas, cleanupNodeHandles]);

    useEffect(() => {
        if (!canvas) return;
        if (activeTool !== 'node') { cleanupNodeHandles(); return; }

        canvas.defaultCursor = 'pointer';
        canvas.selection = false;

        const onSelection = () => {
            cleanupNodeHandles();
            let active = canvas.getActiveObject();
            if (!active) return;
            // Convert any primitive shape to Path for unified Node editing
            if (active.type !== 'path') {
                const result = convertShapeToPath(active);
                if (result) active = canvas.getActiveObject();
            }
            if (active && active.type === 'path') {
                showNodeHandles(active);
            }
        };
        canvas.on('selection:created', onSelection);
        canvas.on('selection:updated', onSelection);
        canvas.on('selection:cleared', cleanupNodeHandles);

        const onMouseDown = (e: fabric.IEvent) => {
            const target = e.target;

            // Dragging a poly/polyline node handle
            if (target && target.data?.nodeHandleType === 'poly') {
                const idx = target.data.nodeIndex as number;
                const activeObj = canvas.getActiveObject() as fabric.Polygon | fabric.Polyline;
                if (!activeObj || !activeObj.points) return;
                draggingNode.current = { handle: target, kind: 'poly', target: activeObj, idx };
                return;
            }

            // Click on empty space → deselect
            if (!target) {
                canvas.discardActiveObject();
                cleanupNodeHandles();
                canvas.renderAll();
                return;
            }

            // Click on a fabric object → select it + show node handles immediately
            let obj = target;
            if (obj.type !== 'path') {
                const result = convertShapeToPath(obj);
                if (result) obj = result;
            }
            if (obj.type === 'path') {
                canvas.discardActiveObject();
                canvas.setActiveObject(obj);
                // setActiveObject fires selection:created → onSelection → showNodeHandles,
                // but with canvas.selection=false we also call showNodeHandles explicitly
                showNodeHandles(obj);
                canvas.renderAll();
            }
        };

        const onMouseMove = (e: fabric.IEvent) => {
            const drag = draggingNode.current;
            if (!drag) return;
            const ptr = canvas.getPointer(e.e);

            if (drag.kind === 'poly') {
                const pts = drag.target.points!;
                const matrix = drag.target.calcTransformMatrix();
                const inv = fabric.util.invertTransform(matrix);
                const pathOff = drag.target.pathOffset || { x: 0, y: 0 };
                const localPt = fabric.util.transformPoint(new fabric.Point(ptr.x, ptr.y), inv);
                pts[drag.idx].x = localPt.x + pathOff.x;
                pts[drag.idx].y = localPt.y + pathOff.y;
                drag.target.set({ points: pts });
                drag.target.setCoords();
                drag.handle.set({ left: ptr.x - 4, top: ptr.y - 4 });
                canvas.renderAll();
            }
        };

        const onMouseUp = () => { draggingNode.current = null; };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        // Show handles for already-selected object when entering Node mode
        let active = canvas.getActiveObject();
        if (active) {
            if (active.type !== 'path') {
                const result = convertShapeToPath(active);
                if (result) active = canvas.getActiveObject();
            }
            if (active && active.type === 'path') {
                showNodeHandles(active);
            }
        }

        return () => {
            canvas.off('selection:created', onSelection);
            canvas.off('selection:updated', onSelection);
            canvas.off('selection:cleared', cleanupNodeHandles);
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            cleanupNodeHandles();
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, cleanupNodeHandles, showNodeHandles, convertShapeToPath]);

    // === TRANSFORM TOOL (select / move / scale / rotate) ===
    const syncObjectProperties = useCallback((obj: fabric.Object | null) => {
        if (!obj) { setActiveObjectProperties(null); return; }
        setActiveObjectProperties({
            x: Math.round((obj.left || 0) * 10) / 10,
            y: Math.round((obj.top || 0) * 10) / 10,
            rotation: Math.round(obj.angle || 0),
            scaleX: obj.scaleX !== undefined ? Number(obj.scaleX.toFixed(3)) : 1,
            scaleY: obj.scaleY !== undefined ? Number(obj.scaleY.toFixed(3)) : 1,
        });
    }, [setActiveObjectProperties]);

    useEffect(() => {
        if (!canvas || activeTool !== 'transform') return;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.forEachObject((obj) => {
            obj.set({ hasControls: true, hasBorders: true, lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
        });
        canvas.renderAll();

        // Selection eventing
        const onSelect = (e: fabric.IEvent) => {
            const selected = e.selected || [];
            setSelectedObjectIds(selected.map(o => o.data?.id as string).filter(Boolean));
            if (selected.length === 1) {
                syncObjectProperties(selected[0]);
            } else {
                setActiveObjectProperties(null);
            }
        };
        const onClear = () => {
            setSelectedObjectIds([]);
            setActiveObjectProperties(null);
        };
        canvas.on('selection:created', onSelect);
        canvas.on('selection:updated', onSelect);
        canvas.on('selection:cleared', onClear);

        // Transform sync
        const onTransform = (e: fabric.IEvent) => {
            const obj = e.target;
            if (obj) syncObjectProperties(obj);
        };
        canvas.on('object:moving', onTransform);
        canvas.on('object:scaling', onTransform);
        canvas.on('object:rotating', onTransform);

        // Sync initial selection
        const initActive = canvas.getActiveObject();
        if (initActive) {
            setSelectedObjectIds(initActive.data?.id ? [initActive.data.id as string] : []);
            syncObjectProperties(initActive);
        }

        return () => {
            canvas.off('selection:created', onSelect);
            canvas.off('selection:updated', onSelect);
            canvas.off('selection:cleared', onClear);
            canvas.off('object:moving', onTransform);
            canvas.off('object:scaling', onTransform);
            canvas.off('object:rotating', onTransform);
        };
    }, [activeTool, canvas, setSelectedObjectIds, syncObjectProperties]);

    // === RECT / ELLIPSE DRAWING TOOL (interactive drag) ===
    useEffect(() => {
        if (!canvas || (activeTool !== 'rect' && activeTool !== 'ellipse')) {
            if (drawPreview.current) { canvas?.remove(drawPreview.current); drawPreview.current = null; }
            return;
        }
        const isEllipse = activeTool === 'ellipse';
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        let startPoint: Point | null = null;

        const onMouseDown = (e: fabric.IEvent) => {
            const ptr = canvas.getPointer(e.e);
            startPoint = { x: ptr.x, y: ptr.y };
            const common = { fill: 'rgba(99,102,241,0.15)', stroke: '#6366f1', strokeWidth: 2, selectable: false, evented: false };
            const preview = isEllipse
                ? new fabric.Ellipse({ left: ptr.x, top: ptr.y, rx: 0, ry: 0, ...common })
                : new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, rx: 6, ry: 6, ...common });
            canvas.add(preview);
            drawPreview.current = preview;
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (!startPoint || !drawPreview.current) return;
            const ptr = canvas.getPointer(e.e);
            const me = e.e as MouseEvent;
            let dx = ptr.x - startPoint.x;
            let dy = ptr.y - startPoint.y;

            if (me.shiftKey) {
                const size = Math.max(Math.abs(dx), Math.abs(dy));
                dx = size * (dx >= 0 ? 1 : -1);
                dy = size * (dy >= 0 ? 1 : -1);
            }

            if (isEllipse) {
                let rx: number, ry: number, left: number, top: number;
                if (me.altKey) {
                    rx = Math.abs(dx);
                    ry = Math.abs(dy);
                    left = startPoint.x - rx;
                    top = startPoint.y - ry;
                } else {
                    rx = Math.abs(dx) / 2;
                    ry = Math.abs(dy) / 2;
                    left = dx < 0 ? startPoint.x + dx : startPoint.x;
                    top = dy < 0 ? startPoint.y + dy : startPoint.y;
                }
                (drawPreview.current as fabric.Ellipse).set({ left, top, rx, ry });
            } else {
                let left: number, top: number, width: number, height: number;
                if (me.altKey) {
                    left = startPoint.x - Math.abs(dx);
                    top = startPoint.y - Math.abs(dy);
                    width = Math.abs(dx) * 2;
                    height = Math.abs(dy) * 2;
                } else {
                    left = dx < 0 ? startPoint.x + dx : startPoint.x;
                    top = dy < 0 ? startPoint.y + dy : startPoint.y;
                    width = Math.abs(dx);
                    height = Math.abs(dy);
                }
                drawPreview.current.set({ left, top, width, height });
            }
            drawPreview.current.setCoords();
            canvas.renderAll();
        };

        const onMouseUp = () => {
            if (!startPoint || !drawPreview.current) return;
            const prev = drawPreview.current;
            const w = isEllipse ? ((prev as fabric.Ellipse).rx ?? 0) * 2 : prev.width || 0;
            const h = isEllipse ? ((prev as fabric.Ellipse).ry ?? 0) * 2 : prev.height || 0;
            if (w < 3 && h < 3) {
                canvas.remove(prev);
                drawPreview.current = null;
                startPoint = null;
                canvas.renderAll();
                setTool('transform');
                setActiveShape('rect');
                return;
            }

            const id = crypto.randomUUID();
            const count = canvas.getObjects().filter(o => o.data?.type === activeTool).length + 1;
            const name = `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} ${count}`;

            const final = isEllipse
                ? new fabric.Ellipse({ left: prev.left, top: prev.top, rx: w / 2, ry: h / 2, fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2, data: { id, type: 'ellipse' } })
                : new fabric.Rect({ left: prev.left, top: prev.top, width: w, height: h, rx: 6, ry: 6, fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2, data: { id, type: 'rect' } });

            canvas.remove(prev);
            drawPreview.current = null;
            startPoint = null;
            canvas.add(final);
            canvas.setActiveObject(final);
            canvas.renderAll();
            addLayer({ id, name, type: activeTool as any, visible: true, locked: false });
            setTool('transform');
            setActiveShape(activeTool);
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            if (drawPreview.current) { canvas.remove(drawPreview.current); drawPreview.current = null; }
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, setTool]);

    // === POLYGON DRAWING TOOL (interactive drag) ===
    useEffect(() => {
        if (!canvas || activeTool !== 'polygon') {
            if (drawPreview.current) { canvas?.remove(drawPreview.current); drawPreview.current = null; }
            return;
        }
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        let centerPoint: Point | null = null;
        let currentSides = useEditorStore.getState().polygonSides;

        const onMouseDown = (e: fabric.IEvent) => {
            currentSides = useEditorStore.getState().polygonSides;
            const ptr = canvas.getPointer(e.e);
            centerPoint = { x: ptr.x, y: ptr.y };
            const pts = generatePolygonPoints(currentSides, ptr.x, ptr.y, 0);
            const preview = new fabric.Polygon(pts, {
                fill: 'rgba(99,102,241,0.15)', stroke: '#6366f1', strokeWidth: 2,
                selectable: false, evented: false,
            });
            canvas.add(preview);
            drawPreview.current = preview;
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (!centerPoint || !drawPreview.current) return;
            const ptr = canvas.getPointer(e.e);
            const dx = ptr.x - centerPoint.x;
            const dy = ptr.y - centerPoint.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + Math.PI / 2;
            const pts = generatePolygonPoints(currentSides, centerPoint.x, centerPoint.y, radius, angle);
            (drawPreview.current as fabric.Polygon).set({ points: pts as any });
            drawPreview.current.setCoords();
            canvas.renderAll();
        };

        const onMouseUp = () => {
            if (!centerPoint || !drawPreview.current) return;
            const prev = drawPreview.current as fabric.Polygon;
            const pts = (prev.points ?? []).map((p: any) => ({ x: p.x, y: p.y }));
            const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            const radius = Math.max(...pts.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)));
            if (radius < 5) {
                canvas.remove(prev);
                drawPreview.current = null;
                centerPoint = null;
                canvas.renderAll();
                setTool('transform');
                setActiveShape('polygon');
                return;
            }

            const id = crypto.randomUUID();
            const count = canvas.getObjects().filter(o => o.data?.type === 'polygon').length + 1;
            const name = `Polygon ${count}`;
            const final = new fabric.Polygon(pts, {
                left: prev.left, top: prev.top,
                fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2,
                data: { id, type: 'polygon', sides: currentSides },
            });

            canvas.remove(prev);
            drawPreview.current = null;
            centerPoint = null;
            canvas.add(final);
            canvas.setActiveObject(final);
            canvas.renderAll();
            addLayer({ id, name, type: 'polygon', visible: true, locked: false });
            setTool('transform');
            setActiveShape('polygon');
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            if (drawPreview.current) { canvas.remove(drawPreview.current); drawPreview.current = null; }
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, setTool]);

    // === STAR DRAWING TOOL (interactive drag) ===
    useEffect(() => {
        if (!canvas || activeTool !== 'star') {
            if (drawPreview.current) { canvas?.remove(drawPreview.current); drawPreview.current = null; }
            return;
        }
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        let centerPoint: Point | null = null;
        let currentPoints = useEditorStore.getState().starPoints;
        let currentRatio = useEditorStore.getState().starInnerRatio;

        const onMouseDown = (e: fabric.IEvent) => {
            currentPoints = useEditorStore.getState().starPoints;
            currentRatio = useEditorStore.getState().starInnerRatio;
            const ptr = canvas.getPointer(e.e);
            centerPoint = { x: ptr.x, y: ptr.y };
            const pts = generateStarPoints(currentPoints, ptr.x, ptr.y, 0, currentRatio);
            const preview = new fabric.Polygon(pts, {
                fill: 'rgba(99,102,241,0.15)', stroke: '#6366f1', strokeWidth: 2,
                selectable: false, evented: false,
            });
            canvas.add(preview);
            drawPreview.current = preview;
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (!centerPoint || !drawPreview.current) return;
            const ptr = canvas.getPointer(e.e);
            const dx = ptr.x - centerPoint.x;
            const dy = ptr.y - centerPoint.y;
            const outerRadius = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + Math.PI / 2;
            const pts = generateStarPoints(currentPoints, centerPoint.x, centerPoint.y, outerRadius, currentRatio, angle);
            (drawPreview.current as fabric.Polygon).set({ points: pts as any });
            drawPreview.current.setCoords();
            canvas.renderAll();
        };

        const onMouseUp = () => {
            if (!centerPoint || !drawPreview.current) return;
            const prev = drawPreview.current as fabric.Polygon;
            const pts = (prev.points ?? []).map((p: any) => ({ x: p.x, y: p.y }));
            const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            const maxR = Math.max(...pts.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)));
            if (maxR < 5) {
                canvas.remove(prev);
                drawPreview.current = null;
                centerPoint = null;
                canvas.renderAll();
                setTool('transform');
                setActiveShape('star');
                return;
            }

            const id = crypto.randomUUID();
            const count = canvas.getObjects().filter(o => o.data?.type === 'star').length + 1;
            const name = `Star ${count}`;
            const final = new fabric.Polygon(pts, {
                left: prev.left, top: prev.top,
                fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2,
                data: { id, type: 'star', pointsCount: currentPoints, innerRatio: currentRatio },
            });

            canvas.remove(prev);
            drawPreview.current = null;
            centerPoint = null;
            canvas.add(final);
            canvas.setActiveObject(final);
            canvas.renderAll();
            addLayer({ id, name, type: 'star', visible: true, locked: false });
            setTool('transform');
            setActiveShape('star');
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            if (drawPreview.current) { canvas.remove(drawPreview.current); drawPreview.current = null; }
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, setTool]);

    // === LINE DRAWING TOOL (interactive drag with 45° snap) ===
    useEffect(() => {
        if (!canvas || activeTool !== 'line') {
            if (drawPreview.current) { canvas?.remove(drawPreview.current); drawPreview.current = null; }
            return;
        }
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        let startPoint: Point | null = null;
        let currentLine: fabric.Line | null = null;

        const onMouseDown = (e: fabric.IEvent) => {
            const ptr = canvas.getPointer(e.e);
            startPoint = { x: ptr.x, y: ptr.y };
            const preview = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
                stroke: '#6366f1', strokeWidth: 3, strokeLineCap: 'round',
                selectable: false, evented: false,
            });
            canvas.add(preview);
            drawPreview.current = preview;
            currentLine = preview;
        };

        const snapAngle = (dx: number, dy: number): { dx: number; dy: number } => {
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const snapped = Math.round(angle / 45) * 45;
            const len = Math.sqrt(dx * dx + dy * dy);
            const rad = snapped * (Math.PI / 180);
            return { dx: len * Math.cos(rad), dy: len * Math.sin(rad) };
        };

        const onMouseMove = (e: fabric.IEvent) => {
            if (!startPoint || !currentLine) return;
            const ptr = canvas.getPointer(e.e);
            let dx = ptr.x - startPoint.x;
            let dy = ptr.y - startPoint.y;
            const me = e.e as MouseEvent;
            if (me.shiftKey) {
                const snapped = snapAngle(dx, dy);
                dx = snapped.dx;
                dy = snapped.dy;
            }
            currentLine.set({ x2: startPoint.x + dx, y2: startPoint.y + dy });
            currentLine.setCoords();
            canvas.renderAll();
        };

        const onMouseUp = () => {
            if (!startPoint || !currentLine) return;
            const x1 = currentLine.x1 ?? 0, y1 = currentLine.y1 ?? 0;
            const x2 = currentLine.x2 ?? 0, y2 = currentLine.y2 ?? 0;
            const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (len < 5) {
                canvas.remove(currentLine);
                drawPreview.current = null;
                currentLine = null;
                startPoint = null;
                canvas.renderAll();
                setTool('transform');
                setActiveShape('line');
                return;
            }

            const id = crypto.randomUUID();
            const count = canvas.getObjects().filter(o => o.data?.type === 'line').length + 1;
            const name = `Line ${count}`;
            const final = new fabric.Line([x1!, y1!, x2!, y2!], {
                stroke: '#6366f1', strokeWidth: 3, strokeLineCap: 'round',
                data: { id, type: 'line' },
            });

            // GSAP-compatible getter/setter for x1/y1/x2/y2 (Stroke Draw animation)
            ['x1', 'y1', 'x2', 'y2'].forEach(prop => {
                const key = '_gs_' + prop;
                (final as any)[key] = (final as any)[prop];
                Object.defineProperty(final, prop, {
                    get() { return (this as any)[key]; },
                    set(v) {
                        if ((this as any)[key] !== v) {
                            (this as any)[key] = v;
                            this.setCoords();
                            this.canvas?.renderAll();
                        }
                    },
                    configurable: true,
                    enumerable: true,
                });
            });

            canvas.remove(currentLine);
            drawPreview.current = null;
            currentLine = null;
            startPoint = null;
            canvas.add(final);
            canvas.setActiveObject(final);
            canvas.renderAll();
            addLayer({ id, name, type: 'line', visible: true, locked: false });
            setTool('transform');
            setActiveShape('line');
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
            if (drawPreview.current) { canvas.remove(drawPreview.current); drawPreview.current = null; }
            currentLine = null;
            canvas.defaultCursor = 'default';
            canvas.selection = true;
        };
    }, [activeTool, canvas, addLayer, setTool]);

    // === ZOOM ===
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
        const handleMoving = (e: fabric.IEvent) => { const obj = e.target; if (!obj) return; const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE; obj.set({ left: snap(obj.left || 0), top: snap(obj.top || 0) }); };
        c.on('object:moving', handleMoving);
        return () => { c.off('object:moving', handleMoving); c.setBackgroundColor('#1e293b', () => c.renderAll()); };
    }, [snapGrid, canvas]);

    // === KEYBOARD ===
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); setTimeout(() => compileTimeline(useEditorStore.getState().animatedObjects, canvas), 10); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); setTimeout(() => compileTimeline(useEditorStore.getState().animatedObjects, canvas), 10); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedKeyframeId) { e.preventDefault(); const s = useEditorStore.getState(); for (const ao2 of s.animatedObjects) { for (const trk of ao2.tracks) { if (trk.keyframes.some(k => k.id === selectedKeyframeId)) { s.removeKeyframeFromTrack(ao2.id, trk.property, selectedKeyframeId); break; } } } compileTimeline(useEditorStore.getState().animatedObjects, canvas); }
                else if (selectedLayerId) { e.preventDefault(); const obj = canvas?.getObjects().find(o => o.data?.id === selectedLayerId); if (obj) { canvas?.remove(obj); canvas?.discardActiveObject().renderAll(); } removeLayer(selectedLayerId); compileTimeline(useEditorStore.getState().animatedObjects, canvas); }
            }
            if (e.key === 'v' || e.key === 'V') setTool('transform');
            if (e.key === 'h' || e.key === 'H') setTool(activeTool === 'hand' ? 'transform' : 'hand');
            if (e.key === 'p' || e.key === 'P') {
                if (e.shiftKey) setTool(activeTool === 'polygon' ? 'transform' : 'polygon');
                else setTool(activeTool === 'pen' ? 'transform' : 'pen');
            }
            if (e.key === 'a' || e.key === 'A') setTool(activeTool === 'node' ? 'transform' : 'node');
            if (e.key === 'n' || e.key === 'N') setTool(activeTool === 'pencil' ? 'transform' : 'pencil');
            if (e.key === 's' || e.key === 'S') {
                setTool(activeTool === 'star' ? 'transform' : 'star');
            }
            if (e.key === 'r' || e.key === 'R' || e.key === 'm' || e.key === 'M') setTool(activeTool === 'rect' ? 'transform' : 'rect');
            if (e.key === 'o' || e.key === 'O' || e.key === 'e' || e.key === 'E') setTool(activeTool === 'ellipse' ? 'transform' : 'ellipse');
            if (e.key === 'g' || e.key === 'G') setTool(activeTool === 'polygon' ? 'transform' : 'polygon');
            if (e.key === 'j' || e.key === 'J') setTool(activeTool === 'star' ? 'transform' : 'star'); // legacy
            if (e.key === 'l' || e.key === 'L') setTool(activeTool === 'line' ? 'transform' : 'line');
            if (e.key === 't' || e.key === 'T') { e.preventDefault(); addTextToCanvas(); }
            if (e.key === '=' || e.key === '+') setTool(activeTool === 'add-node' ? 'transform' : 'add-node');
            if (e.key === '-' || e.key === '_') setTool(activeTool === 'remove-node' ? 'transform' : 'remove-node');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLayerId, selectedKeyframeId, removeLayer, undo, redo, canvas, activeTool, setTool, addTextToCanvas]);

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
                <ToolCluster items={shapeTools} activeId={activeShape} onSelect={handleToolSelect} behavior="instant"
                    isActive={shapeTools.some(t => t.id === activeTool)} />
                {activeTool === 'polygon' && (() => {
                    const sides = useEditorStore.getState().polygonSides;
                    const setSides = useEditorStore.getState().setPolygonSides;
                    return <span className="flex items-center gap-1 bg-slate-800 rounded px-2 py-1 text-xs text-slate-300">
                        <span>Sides:</span>
                        <button onClick={() => setSides(sides - 1)} className="px-1 hover:text-white font-bold">−</button>
                        <span className="min-w-[16px] text-center font-mono">{sides}</span>
                        <button onClick={() => setSides(sides + 1)} className="px-1 hover:text-white font-bold">+</button>
                    </span>;
                })()}
                {activeTool === 'star' && (() => {
                    const pts = useEditorStore.getState().starPoints;
                    const ratio = useEditorStore.getState().starInnerRatio;
                    const setPts = useEditorStore.getState().setStarPoints;
                    const setRatio = useEditorStore.getState().setStarInnerRatio;
                    return <span className="flex items-center gap-2 bg-slate-800 rounded px-2 py-1 text-xs text-slate-300">
                        <span className="flex items-center gap-1">
                            <span>Pts:</span>
                            <button onClick={() => setPts(pts - 1)} className="px-1 hover:text-white font-bold">−</button>
                            <span className="min-w-[16px] text-center font-mono">{pts}</span>
                            <button onClick={() => setPts(pts + 1)} className="px-1 hover:text-white font-bold">+</button>
                        </span>
                        <span className="flex items-center gap-1">
                            <span>Depth:</span>
                            <button onClick={() => setRatio(Math.round((ratio - 0.1) * 10) / 10)} className="px-1 hover:text-white font-bold">−</button>
                            <span className="min-w-[24px] text-center font-mono">{ratio.toFixed(1)}</span>
                            <button onClick={() => setRatio(Math.round((ratio + 0.1) * 10) / 10)} className="px-1 hover:text-white font-bold">+</button>
                        </span>
                    </span>;
                })()}
                <button onClick={addTextToCanvas}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1"><span>T</span><span>Text</span><kbd className="text-[9px] font-mono text-slate-500 bg-slate-800/60 px-1 py-0.5 rounded border border-slate-700/50">T</kbd></button>
                <button onClick={() => handleToolSelect('hand')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${activeTool === 'hand' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >✋<span>Hand</span><kbd className="text-[9px] font-mono text-slate-500 bg-slate-800/60 px-1 py-0.5 rounded border border-slate-700/50">H</kbd></button>
                <div className="w-px h-5 bg-slate-700" />
                <button onClick={() => setSnapGrid(!snapGrid)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${snapGrid ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >⊞ Grid</button>
                <div className="flex items-center gap-0.5 ml-1">
                    {[{ a: 'left' as const, icon: '⇤', t: 'Left' }, { a: 'center' as const, icon: '⇔', t: 'Center' }, { a: 'right' as const, icon: '⇥', t: 'Right' }, { a: 'top' as const, icon: '⇧', t: 'Top' }, { a: 'middle' as const, icon: '⇕', t: 'Middle' }, { a: 'bottom' as const, icon: '⇩', t: 'Bottom' }]
                        .map(({ a, icon, t }) => (<button key={a} onClick={() => alignObjects(a)}
                            className="px-1.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title={t}>{icon}</button>))}
                </div>
            </div>

            <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1 bg-slate-950/80 rounded-lg border border-slate-700 px-2 py-1">
                <button onClick={zoomOut} className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded">−</button>
                <span className="px-2 text-xs font-mono text-slate-400 min-w-[48px] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={zoomIn} className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded">+</button>
                <button onClick={zoomReset} className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-white hover:bg-slate-700 rounded ml-1">↺</button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-700 shadow-2xl">
                <canvas ref={canvasElRef} />
            </div>
        </div>
    );
}
