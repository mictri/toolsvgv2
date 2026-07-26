import { fabric } from 'fabric';
import { pathCanvasToLocal, updatePathAnchor, updatePathHandle } from './pathNodeEditor';
import type { PathAnchorNode } from './pathNodeEditor';
import { useEditorStore } from '../../store/editorStore';

interface SavedState {
    controls: Record<string, fabric.Control>;
    hasBorders: boolean;
}

const savedStates = new WeakMap<fabric.Object, SavedState>();

// Screen-space constants (CSS pixels) — invariant under zoom / object scale
const SCREEN_ANCHOR_RADIUS = 6;
const SCREEN_HANDLE_RADIUS = 4;
const SCREEN_ANCHOR_STROKE = 2;
const SCREEN_HANDLE_STROKE = 1;
const SCREEN_LINE_STROKE = 1.5;
const SCREEN_HELPER_STROKE = 1;
const SCREEN_DASH_LEN = 3;

/**
 * Compute screen-space position from path-local coordinates by applying
 * the path object's full transform matrix then the canvas viewport transform.
 */
function anchorToScreen(obj: fabric.Object, localPt: { x: number; y: number }): fabric.Point {
    const pathObj = obj as fabric.Path;
    const matrix = pathObj.calcTransformMatrix();
    const off = pathObj.pathOffset || { x: 0, y: 0 };
    const canvasPt = fabric.util.transformPoint(
        new fabric.Point(localPt.x - off.x, localPt.y - off.y),
        matrix,
    );
    const vpt = pathObj.canvas?.viewportTransform;
    if (vpt) {
        return fabric.util.transformPoint(canvasPt, vpt) as fabric.Point;
    }
    return canvasPt as fabric.Point;
}

/**
 * Replace the standard selection controls on a fabric.Path with custom
 * anchor/handle controls via fabric.Control. Helper lines are drawn
 * via a drawControls override on the path instance.
 */
export function setupPathNodeControls(
    pathObj: fabric.Path,
    anchors: PathAnchorNode[],
    onNodeDrag?: (nodeIndex: number) => void,
): void {
    if (savedStates.has(pathObj)) return;

    savedStates.set(pathObj, {
        controls: { ...pathObj.controls },
        hasBorders: !!pathObj.hasBorders,
    });

    pathObj.hasBorders = false;
    pathObj.hasControls = true;

    const controls: Record<string, fabric.Control> = {};

    for (let ai = 0; ai < anchors.length; ai++) {
        const anchor = anchors[ai];

        controls[`anchor_${ai}`] = new fabric.Control({
            x: 0, y: 0,
            positionHandler(_dim: fabric.Point, _finalMatrix: number[], obj: fabric.Object) {
                return anchorToScreen(obj, { x: anchor.x, y: anchor.y });
            },
            actionHandler(_eventData: MouseEvent, transform: any, x: number, y: number) {
                const pathObj = transform.target as fabric.Path;
                const local = pathCanvasToLocal(pathObj, { x, y });
                const origLeft = pathObj.left;
                const origTop = pathObj.top;
                updatePathAnchor(pathObj, anchor, local.x, local.y);
                pathObj.set({ path: (pathObj.path || []).slice() as any });
                // Compensate for Fabric.js setPathInfo left/top adjustment
                if (pathObj.left !== origLeft || pathObj.top !== origTop) {
                    pathObj.set({ left: pathObj.left! - (pathObj.left! - origLeft!), top: pathObj.top! - (pathObj.top! - origTop!) });
                }
                pathObj.setCoords();
                (pathObj.canvas as fabric.Canvas)?.requestRenderAll();
                onNodeDrag?.(ai);
                return true;
            },
            render(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, _fabricObj: fabric.Object) {
                const selectedIndex = useEditorStore.getState().selectedNodeIndex;
                const isSelected = selectedIndex === ai;
                ctx.fillStyle = isSelected ? '#f59e0b' : '#fff';
                ctx.strokeStyle = isSelected ? '#f59e0b' : '#818cf8';
                ctx.lineWidth = isSelected ? 2.5 : SCREEN_ANCHOR_STROKE;
                const r = isSelected ? SCREEN_ANCHOR_RADIUS + 2 : SCREEN_ANCHOR_RADIUS;
                ctx.beginPath();
                ctx.arc(left, top, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            },
            cursorStyle: 'pointer',
            sizeX: 10, sizeY: 10,
        } as any);

        if (anchor.handleOut) {
            const hRef = anchor.handleOut;
            controls[`handleOut_${ai}`] = new fabric.Control({
                x: 0, y: 0,
                positionHandler(_dim: fabric.Point, _finalMatrix: number[], obj: fabric.Object) {
                    return anchorToScreen(obj, { x: hRef.x, y: hRef.y });
                },
                actionHandler(_eventData: MouseEvent, transform: any, x: number, y: number) {
                    const pathObj = transform.target as fabric.Path;
                    const alt = !!(transform as any).altKey;
                    const origLeft = pathObj.left;
                    const origTop = pathObj.top;
                    updatePathHandle(pathObj, anchor, 'out', { x, y }, alt);
                    pathObj.set({ path: (pathObj.path || []).slice() as any });
                    if (pathObj.left !== origLeft || pathObj.top !== origTop) {
                        pathObj.set({ left: pathObj.left! - (pathObj.left! - origLeft!), top: pathObj.top! - (pathObj.top! - origTop!) });
                    }
                    pathObj.setCoords();
                    (pathObj.canvas as fabric.Canvas)?.requestRenderAll();
                    onNodeDrag?.(ai);
                    return true;
                },
                render(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, _fabricObj: fabric.Object) {
                    ctx.fillStyle = '#60a5fa';
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = SCREEN_HANDLE_STROKE;
                    ctx.beginPath();
                    ctx.arc(left, top, SCREEN_HANDLE_RADIUS, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                },
                cursorStyle: 'pointer',
                sizeX: 10, sizeY: 10,
            } as any);
        }

        if (anchor.handleIn) {
            const hRef = anchor.handleIn;
            controls[`handleIn_${ai}`] = new fabric.Control({
                x: 0, y: 0,
                positionHandler(_dim: fabric.Point, _finalMatrix: number[], obj: fabric.Object) {
                    return anchorToScreen(obj, { x: hRef.x, y: hRef.y });
                },
                actionHandler(_eventData: MouseEvent, transform: any, x: number, y: number) {
                    const pathObj = transform.target as fabric.Path;
                    const alt = !!(transform as any).altKey;
                    const origLeft = pathObj.left;
                    const origTop = pathObj.top;
                    updatePathHandle(pathObj, anchor, 'in', { x, y }, alt);
                    pathObj.set({ path: (pathObj.path || []).slice() as any });
                    if (pathObj.left !== origLeft || pathObj.top !== origTop) {
                        pathObj.set({ left: pathObj.left! - (pathObj.left! - origLeft!), top: pathObj.top! - (pathObj.top! - origTop!) });
                    }
                    pathObj.setCoords();
                    (pathObj.canvas as fabric.Canvas)?.requestRenderAll();
                    onNodeDrag?.(ai);
                    return true;
                },
                render(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, _fabricObj: fabric.Object) {
                    ctx.fillStyle = '#60a5fa';
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = SCREEN_HANDLE_STROKE;
                    ctx.beginPath();
                    ctx.arc(left, top, SCREEN_HANDLE_RADIUS, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                },
                cursorStyle: 'pointer',
                sizeX: 10, sizeY: 10,
            } as any);
        }
    }

    pathObj.controls = controls;

    // Override drawControls to draw helper lines in screen space
    (pathObj as any).drawControls = function (this: fabric.Object, ctx: CanvasRenderingContext2D, styleOverride?: any) {
        styleOverride = styleOverride || {};
        ctx.save();
        var retinaScaling = this.canvas ? (this.canvas as any).getRetinaScaling() : 1;
        ctx.setTransform(retinaScaling, 0, 0, retinaScaling, 0, 0);
        ctx.lineCap = 'round';

        const oCoords = (this as any).oCoords as Record<string, { x: number; y: number }> | undefined;
        if (oCoords) {
            const n = anchors.length;

            ctx.strokeStyle = 'rgba(129,140,248,0.3)';
            ctx.lineWidth = SCREEN_LINE_STROKE;
            ctx.setLineDash([]);
            ctx.beginPath();
            for (let ai = 0; ai < n; ai++) {
                const a = oCoords[`anchor_${ai}`];
                const next = oCoords[`anchor_${(ai + 1) % n}`];
                if (!a || !next) continue;
                if (ai === 0) ctx.moveTo(a.x, a.y);
                ctx.lineTo(next.x, next.y);
            }
            ctx.stroke();

            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = SCREEN_HELPER_STROKE;
            ctx.setLineDash([SCREEN_DASH_LEN, SCREEN_DASH_LEN]);
            for (let ai = 0; ai < n; ai++) {
                const anchorPt = oCoords[`anchor_${ai}`];
                if (!anchorPt) continue;
                const hOut = oCoords[`handleOut_${ai}`];
                if (hOut) {
                    ctx.beginPath(); ctx.moveTo(anchorPt.x, anchorPt.y); ctx.lineTo(hOut.x, hOut.y); ctx.stroke();
                }
                const hIn = oCoords[`handleIn_${ai}`];
                if (hIn) {
                    ctx.beginPath(); ctx.moveTo(anchorPt.x, anchorPt.y); ctx.lineTo(hIn.x, hIn.y); ctx.stroke();
                }
            }
        }

        // Render each control
        const ctrlKeys = Object.keys(this.controls);
        for (let ci = 0; ci < ctrlKeys.length; ci++) {
            const key = ctrlKeys[ci];
            const control = this.controls[key];
            const p = (this as any).oCoords?.[key] as { x: number; y: number } | undefined;
            if (p && control.getVisibility(this, key)) {
                control.render(ctx, p.x, p.y, styleOverride, this);
            }
        }

        ctx.restore();
    };
}

/** Restore the original controls and drawControls on the path */
export function teardownPathNodeControls(pathObj: fabric.Path): void {
    const saved = savedStates.get(pathObj);
    if (!saved) return;
    pathObj.controls = saved.controls;
    pathObj.hasBorders = saved.hasBorders;
    savedStates.delete(pathObj);

    delete (pathObj as any).drawControls;
}

/** Check if a path currently has fabric.Control node controls */
export function hasPathNodeControls(pathObj: fabric.Path): boolean {
    return savedStates.has(pathObj);
}
