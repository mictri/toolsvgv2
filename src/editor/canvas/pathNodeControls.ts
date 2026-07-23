import { fabric } from 'fabric';
import { pathLocalToCanvas, pathCanvasToLocal, updatePathAnchor, updatePathHandle } from './pathNodeEditor';
import type { PathAnchorNode } from './pathNodeEditor';

interface SavedState {
    controls: Record<string, fabric.Control>;
    hasBorders: boolean;
}

const savedStates = new WeakMap<fabric.Object, SavedState>();

/**
 * Replace the standard selection controls on a fabric.Path with custom
 * anchor/handle controls via fabric.Control. Helper lines are drawn
 * via a drawControls override on the path instance.
 */
export function setupPathNodeControls(
    pathObj: fabric.Path,
    anchors: PathAnchorNode[],
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
                const p = pathLocalToCanvas(obj as fabric.Path, { x: anchor.x, y: anchor.y });
                return new fabric.Point(p.x, p.y);
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
                return true;
            },
            render(ctx: CanvasRenderingContext2D, left: number, top: number) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#818cf8';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(left, top, 4, 0, Math.PI * 2);
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
                    const p = pathLocalToCanvas(obj as fabric.Path, { x: hRef.x, y: hRef.y });
                    return new fabric.Point(p.x, p.y);
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
                    return true;
                },
                render(ctx: CanvasRenderingContext2D, left: number, top: number) {
                    ctx.fillStyle = '#60a5fa';
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(left, top, 3, 0, Math.PI * 2);
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
                    const p = pathLocalToCanvas(obj as fabric.Path, { x: hRef.x, y: hRef.y });
                    return new fabric.Point(p.x, p.y);
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
                    return true;
                },
                render(ctx: CanvasRenderingContext2D, left: number, top: number) {
                    ctx.fillStyle = '#60a5fa';
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(left, top, 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                },
                cursorStyle: 'pointer',
                sizeX: 10, sizeY: 10,
            } as any);
        }
    }

    pathObj.controls = controls;

    // Override drawControls to draw helper lines + controls
    (pathObj as any).drawControls = function (this: fabric.Object, ctx: CanvasRenderingContext2D, styleOverride?: any) {
        styleOverride = styleOverride || {};
        ctx.save();
        const canvas = this.canvas;
        const retinaScaling = canvas ? (canvas as any).getRetinaScaling() : 1;
        ctx.setTransform(retinaScaling, 0, 0, retinaScaling, 0, 0);
        ctx.lineCap = 'round';

        const oCoords = (this as any).oCoords as Record<string, { x: number; y: number }> | undefined;
        if (oCoords) {
            const n = anchors.length;

            ctx.strokeStyle = 'rgba(129,140,248,0.3)';
            ctx.lineWidth = 1.5;
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
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
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
