import { fabric } from 'fabric';

interface Point { x: number; y: number; }

export interface PathHandleRef {
    cmdIdx: number;
    offset: number;
}

export interface PathAnchorNode {
    cmdIdx: number;
    anchorOffset: number;
    x: number;
    y: number;
    handleIn: { ref: PathHandleRef; x: number; y: number } | null;
    handleOut: { ref: PathHandleRef; x: number; y: number } | null;
    nodeType: 'smooth' | 'symmetric' | 'corner';
}

/** Convert a point in path-local coordinates to canvas coordinates */
export function pathLocalToCanvas(pathObj: fabric.Path, local: Point): Point {
    const matrix = pathObj.calcTransformMatrix();
    const off = pathObj.pathOffset || { x: 0, y: 0 };
    const p = fabric.util.transformPoint(
        new fabric.Point(local.x - off.x, local.y - off.y),
        matrix,
    );
    return { x: p.x, y: p.y };
}

/** Convert a canvas-space point back to path-local coordinates */
export function pathCanvasToLocal(pathObj: fabric.Path, canvasPt: Point): Point {
    const matrix = pathObj.calcTransformMatrix();
    const inv = fabric.util.invertTransform(matrix);
    const off = pathObj.pathOffset || { x: 0, y: 0 };
    const p = fabric.util.transformPoint(new fabric.Point(canvasPt.x, canvasPt.y), inv);
    return { x: p.x + off.x, y: p.y + off.y };
}

/**
 * Parse a fabric.Path's path array into a list of anchor nodes with their
 * control handles.
 */
export function parsePathAnchors(pathObj: fabric.Path): PathAnchorNode[] {
    const cmds = (pathObj.path as unknown) as unknown as any[][];
    const anchors = parsePathAnchorsFromCmds(cmds);
    // Classify node type (only available with full anchors including connections)
    for (const a of anchors) {
        if (a.handleIn && a.handleOut) {
            const dxIn = a.x - a.handleIn.x;
            const dyIn = a.y - a.handleIn.y;
            const dxOut = a.handleOut.x - a.x;
            const dyOut = a.handleOut.y - a.y;
            const cross = Math.abs(dxIn * dyOut - dyIn * dxOut);
            if (cross < 0.5) {
                const dIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn);
                const dOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut);
                a.nodeType = Math.abs(dIn - dOut) < 0.5 ? 'symmetric' : 'smooth';
            }
        }
    }
    return anchors;
}

/** Update an anchor point's position in the raw path commands */
export function updatePathAnchor(pathObj: fabric.Path, anchor: PathAnchorNode, newX: number, newY: number): void {
    const cmds = pathObj.path as unknown as any[][];
    const cmd = cmds[anchor.cmdIdx];
    const dx = newX - anchor.x;
    const dy = newY - anchor.y;
    cmd[anchor.anchorOffset] = newX;
    cmd[anchor.anchorOffset + 1] = newY;
    anchor.x = newX;
    anchor.y = newY;

    if (anchor.handleIn) {
        const hiCmd = cmds[anchor.handleIn.ref.cmdIdx];
        hiCmd[anchor.handleIn.ref.offset] = anchor.handleIn.x + dx;
        hiCmd[anchor.handleIn.ref.offset + 1] = anchor.handleIn.y + dy;
        anchor.handleIn.x += dx;
        anchor.handleIn.y += dy;
    }
    if (anchor.handleOut) {
        const hoCmd = cmds[anchor.handleOut.ref.cmdIdx];
        hoCmd[anchor.handleOut.ref.offset] = anchor.handleOut.x + dx;
        hoCmd[anchor.handleOut.ref.offset + 1] = anchor.handleOut.y + dy;
        anchor.handleOut.x += dx;
        anchor.handleOut.y += dy;
    }
}

/** Update a control handle position, optionally maintaining C1 continuity */
export function updatePathHandle(
    pathObj: fabric.Path,
    anchor: PathAnchorNode,
    side: 'in' | 'out',
    targetCanvas: Point,
    altPressed: boolean,
): { newAnchor: PathAnchorNode } {
    const cmds = pathObj.path as unknown as any[][];
    const local = pathCanvasToLocal(pathObj, targetCanvas);

    if (side === 'in' && anchor.handleIn) {
        const hiCmd = cmds[anchor.handleIn.ref.cmdIdx];
        hiCmd[anchor.handleIn.ref.offset] = local.x;
        hiCmd[anchor.handleIn.ref.offset + 1] = local.y;
        anchor.handleIn.x = local.x;
        anchor.handleIn.y = local.y;

        if (!altPressed && anchor.handleOut) {
            // Mirror around anchor for C1 continuity
            const nx = anchor.x + (anchor.x - local.x);
            const ny = anchor.y + (anchor.y - local.y);
            const hoCmd = cmds[anchor.handleOut.ref.cmdIdx];
            hoCmd[anchor.handleOut.ref.offset] = nx;
            hoCmd[anchor.handleOut.ref.offset + 1] = ny;
            anchor.handleOut.x = nx;
            anchor.handleOut.y = ny;
        }
    }

    if (side === 'out' && anchor.handleOut) {
        const hoCmd = cmds[anchor.handleOut.ref.cmdIdx];
        hoCmd[anchor.handleOut.ref.offset] = local.x;
        hoCmd[anchor.handleOut.ref.offset + 1] = local.y;
        anchor.handleOut.x = local.x;
        anchor.handleOut.y = local.y;

        if (!altPressed && anchor.handleIn) {
            const nx = anchor.x + (anchor.x - local.x);
            const ny = anchor.y + (anchor.y - local.y);
            const hiCmd = cmds[anchor.handleIn.ref.cmdIdx];
            hiCmd[anchor.handleIn.ref.offset] = nx;
            hiCmd[anchor.handleIn.ref.offset + 1] = ny;
            anchor.handleIn.x = nx;
            anchor.handleIn.y = ny;
        }
    }

    return { newAnchor: anchor };
}

/** Create a fabric.Path from a raw path string suitable for Node tool operations */
export function rebuildPath(pathObj: fabric.Path): void {
    pathObj.set({ path: pathObj.path as any });
    pathObj.setCoords();
}

/** Deep-clone a Fabric path commands array */
export function cloneCmds(cmds: any[][]): any[][] {
    return cmds.map(cmd => [...cmd]);
}

/** Convert a Fabric path commands array back to an SVG path `d` string */
export function cmdsToD(cmds: any[][]): string {
    return cmds.map(cmd => {
        const t = cmd[0] as string;
        const args = cmd.slice(1).map((n: number) => (Math.round(n * 100) / 100).toFixed(1));
        return `${t} ${args.join(' ')}`;
    }).join(' ');
}

/**
 * Parse a raw Fabric path commands array (instead of a fabric.Path instance)
 * into anchor nodes.  Same logic as parsePathAnchors but operates on the
 * raw array.
 */
export function parsePathAnchorsFromCmds(cmds: any[][]): PathAnchorNode[] {
    if (!cmds || cmds.length === 0) return [];
    const anchors: PathAnchorNode[] = [];
    let firstMAnchor: PathAnchorNode | null = null;

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const type = cmd[0] as string;

        if (type === 'M') {
            const node: PathAnchorNode = {
                cmdIdx: i, anchorOffset: 1,
                x: cmd[1] as number, y: cmd[2] as number,
                handleIn: null, handleOut: null,
                nodeType: 'corner',
            };
            anchors.push(node);
            firstMAnchor = node;
        } else if (type === 'L') {
            anchors.push({
                cmdIdx: i, anchorOffset: 1,
                x: cmd[1] as number, y: cmd[2] as number,
                handleIn: null, handleOut: null,
                nodeType: 'corner',
            });
        } else if (type === 'C') {
            anchors.push({
                cmdIdx: i, anchorOffset: 5,
                x: cmd[5] as number, y: cmd[6] as number,
                handleIn: { ref: { cmdIdx: i, offset: 3 }, x: cmd[3] as number, y: cmd[4] as number },
                handleOut: null,
                nodeType: 'corner',
            });
        } else if (type === 'Q') {
            anchors.push({
                cmdIdx: i, anchorOffset: 3,
                x: cmd[3] as number, y: cmd[4] as number,
                handleIn: { ref: { cmdIdx: i, offset: 1 }, x: cmd[1] as number, y: cmd[2] as number },
                handleOut: null,
                nodeType: 'corner',
            });
        }
    }

    // Fill handleOut
    for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const nextIdx = anchor.cmdIdx + 1;
        if (nextIdx < cmds.length) {
            const next = cmds[nextIdx];
            const nt = next[0] as string;
            if (nt === 'C') {
                anchor.handleOut = { ref: { cmdIdx: nextIdx, offset: 1 }, x: next[1] as number, y: next[2] as number };
            } else if (nt === 'Q') {
                anchor.handleOut = { ref: { cmdIdx: nextIdx, offset: 1 }, x: next[1] as number, y: next[2] as number };
            }
        }
        if (!anchor.handleOut && i === anchors.length - 1) {
            const lastCmd = cmds[cmds.length - 1];
            if (lastCmd && (lastCmd[0] === 'Z' || lastCmd[0] === 'z') && firstMAnchor && anchors.length > 1) {
                const afterM = firstMAnchor.cmdIdx + 1;
                if (afterM < cmds.length) {
                    const c = cmds[afterM];
                    if (c[0] === 'C') {
                        anchor.handleOut = { ref: { cmdIdx: afterM, offset: 1 }, x: c[1] as number, y: c[2] as number };
                    }
                }
            }
        }
    }

    return anchors;
}

/**
 * Build a complete Fabric path command array from a list of anchor nodes.
 * This reverses parsePathAnchorsFromCmds so that commit can reconstruct
 * the path from a modified draft.
 */
export function anchorsToCmds(
    anchors: PathAnchorNode[],
    isClosed: boolean,
): any[][] {
    if (anchors.length === 0) return [];
    const cmds: any[][] = [];
    // Always start with M for the first anchor
    cmds.push(['M', anchors[0].x, anchors[0].y]);

    for (let i = 1; i < anchors.length; i++) {
        const prev = anchors[i - 1];
        const curr = anchors[i];
        // If previous anchor has handleOut, emit a C command
        if (prev.handleOut) {
            const hOut = prev.handleOut;
            const hIn = curr.handleIn;
            cmds.push([
                'C',
                hOut.x, hOut.y,
                hIn ? hIn.x : curr.x, hIn ? hIn.y : curr.y,
                curr.x, curr.y,
            ]);
        } else {
            cmds.push(['L', curr.x, curr.y]);
        }
    }

    if (isClosed) {
        // Close the path: if the last anchor has handleOut, the closing
        // segment from last → first needs a C command
        const last = anchors[anchors.length - 1];
        const first = anchors[0];
        if (last.handleOut) {
            cmds.push([
                'C',
                last.handleOut.x, last.handleOut.y,
                first.handleIn ? first.handleIn.x : first.x,
                first.handleIn ? first.handleIn.y : first.y,
                first.x, first.y,
            ]);
        } else {
            // If the opening segment (first → second) is a C, we must still
            // emit a C here because the first anchor may have handleIn
            if (first.handleIn) {
                cmds.push([
                    'C',
                    last.x, last.y,
                    first.handleIn.x, first.handleIn.y,
                    first.x, first.y,
                ]);
            }
        }
        cmds.push(['Z']);
    }

    return cmds;
}
