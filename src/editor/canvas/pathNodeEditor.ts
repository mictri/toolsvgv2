import { fabric } from 'fabric';

interface Point { x: number; y: number; }

export interface PathHandleRef {
    cmdIdx: number;
    offset: number;
}

export type NodeType = 'corner' | 'smooth' | 'symmetric' | 'disconnected';

export interface PathAnchorNode {
    cmdIdx: number;
    anchorOffset: number;
    x: number;
    y: number;
    handleIn: { ref: PathHandleRef; x: number; y: number } | null;
    handleOut: { ref: PathHandleRef; x: number; y: number } | null;
    nodeType: NodeType;
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
    // Restore user-set node types (e.g. 'disconnected') from persistent storage
    const stored = (pathObj as any).__nodeTypes as Record<number, string> | undefined;
    if (stored) {
        for (let i = 0; i < anchors.length; i++) {
            if (stored[i] === 'disconnected') {
                anchors[i].nodeType = 'disconnected';
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
    pathObj.set({ path: (pathObj.path || []).slice() as any });
    pathObj.setCoords();
}

/**
 * Full node-type transformation that rebuilds the entire path.
 *
 * - `corner`:       removes both handles, makes incoming/outgoing segments straight (L).
 * - `smooth`:       creates/aligns handles with C1 continuity (collinear, different lengths OK).
 * - `symmetric`:    creates/aligns handles with C1 + equal length.
 * - `disconnected`: creates handles but leaves them independent (no mirroring).
 */
export function setNodeType(
    pathObj: fabric.Path,
    nodeIndex: number,
    nodeType: NodeType,
): void {
    const cmds = pathObj.path as unknown as any[][];
    const isClosed = cmds.length > 0 && (cmds[cmds.length - 1][0] === 'Z' || cmds[cmds.length - 1][0] === 'z');
    const anchors = parsePathAnchorsFromCmds(cmds);
    if (nodeIndex < 0 || nodeIndex >= anchors.length) return;

    // --- corner: strip all handles on and adjacent to this node ---
    if (nodeType === 'corner') {
        const a = anchors[nodeIndex];
        a.handleIn = null;
        a.handleOut = null;
        if (nodeIndex > 0) anchors[nodeIndex - 1].handleOut = null;
        else if (isClosed && anchors.length > 1) anchors[anchors.length - 1].handleOut = null;
        if (nodeIndex < anchors.length - 1) anchors[nodeIndex + 1].handleIn = null;
        else if (isClosed && anchors.length > 1) anchors[0].handleIn = null;
    }

    // --- helpers for smooth / symmetric / disconnected ---
    const ensureIn = (idx: number) => {
        const a = anchors[idx];
        if (a.handleIn) return;
        let pIdx = idx - 1;
        if (pIdx < 0) { if (isClosed && anchors.length > 1) pIdx = anchors.length - 1; else return; }
        const prev = anchors[pIdx];
        const dx = a.x - prev.x, dy = a.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 30;
        const ux = dx / len, uy = dy / len;
        const hLen = Math.min(len / 3, 60);
        a.handleIn = { ref: { cmdIdx: -1, offset: -1 }, x: a.x - ux * hLen, y: a.y - uy * hLen };
        if (!prev.handleOut) { prev.handleOut = { ref: { cmdIdx: -1, offset: -1 }, x: prev.x + ux * hLen, y: prev.y + uy * hLen }; }
    };
    const ensureOut = (idx: number) => {
        const a = anchors[idx];
        if (a.handleOut) return;
        let nIdx = idx + 1;
        if (nIdx >= anchors.length) { if (isClosed && anchors.length > 1) nIdx = 0; else return; }
        const next = anchors[nIdx];
        const dx = next.x - a.x, dy = next.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 30;
        const ux = dx / len, uy = dy / len;
        const hLen = Math.min(len / 3, 60);
        a.handleOut = { ref: { cmdIdx: -1, offset: -1 }, x: a.x + ux * hLen, y: a.y + uy * hLen };
        if (!next.handleIn) { next.handleIn = { ref: { cmdIdx: -1, offset: -1 }, x: next.x - ux * hLen, y: next.y - uy * hLen }; }
    };

    if (nodeType === 'smooth' || nodeType === 'symmetric') {
        ensureIn(nodeIndex);
        ensureOut(nodeIndex);
        const a = anchors[nodeIndex];
        if (a.handleIn && a.handleOut) {
            if (nodeType === 'symmetric') {
                a.handleOut.x = a.x + (a.x - a.handleIn.x);
                a.handleOut.y = a.y + (a.y - a.handleIn.y);
            } else {
                const dxIn = a.x - a.handleIn.x, dyIn = a.y - a.handleIn.y;
                const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn);
                if (lenIn > 0) {
                    const dxOut = a.handleOut.x - a.x, dyOut = a.handleOut.y - a.y;
                    const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut);
                    a.handleOut.x = a.x + (dxIn / lenIn) * lenOut;
                    a.handleOut.y = a.y + (dyIn / lenIn) * lenOut;
                }
            }
        }
    }

    if (nodeType === 'disconnected') {
        ensureIn(nodeIndex);
        ensureOut(nodeIndex);
        // keep handles independent — no mirroring
    }

    // --- rebuild path commands from modified anchors ---
    const newCmds = anchorsToCmds(anchors, isClosed);

    // --- persist user-set node type ---
    const stored = ((pathObj as any).__nodeTypes = (pathObj as any).__nodeTypes || {});
    stored[nodeIndex] = nodeType;

    // Re-apply to fabric via set() — using newCmds.slice() ensures the
    // reference differs from pathObj.path, forcing Fabric's _setPathInfo()
    // to recalculate width/height/pathOffset. Without this, objectCaching
    // uses stale bounding box and nodes beyond the original bounds get clipped.
    pathObj.set({ path: newCmds.slice() as any });
    pathObj.setCoords();
}

/** Get the local-space coordinates of a node by index */
export function getNodePoint(
    pathObj: fabric.Path,
    nodeIndex: number,
): Point | null {
    const anchors = parsePathAnchors(pathObj);
    if (nodeIndex < 0 || nodeIndex >= anchors.length) return null;
    return { x: anchors[nodeIndex].x, y: anchors[nodeIndex].y };
}

/** Update a node's position in local space by index */
export function updateNodePoint(
    pathObj: fabric.Path,
    nodeIndex: number,
    localX: number,
    localY: number,
): void {
    const anchors = parsePathAnchors(pathObj);
    if (nodeIndex < 0 || nodeIndex >= anchors.length) return;
    updatePathAnchor(pathObj, anchors[nodeIndex], localX, localY);
}

/** Get the number of nodes / anchors in a path */
export function getNodeCount(pathObj: fabric.Path): number {
    return parsePathAnchors(pathObj).length;
}

/** Reconnect bezier handles after removing a node at anchorIdx */
export function removeAnchorFromCmds(cmds: any[][], anchorIdx: number, isClosed: boolean): any[][] {
    const result = cloneCmds(cmds);
    const anchors = parsePathAnchorsFromCmds(result);
    if (anchors.length < 3) return result;

    let prevIdx = anchorIdx - 1;
    let nextIdx = anchorIdx + 1;
    if (prevIdx < 0) { prevIdx = isClosed && anchors.length > 1 ? anchors.length - 1 : -1; }
    if (nextIdx >= anchors.length) { nextIdx = isClosed && anchors.length > 1 ? 0 : -1; }
    if (prevIdx < 0 || nextIdx < 0) return result;

    const anchor = anchors[anchorIdx];
    const prevAnchor = anchors[prevIdx];
    const nextAnchor = anchors[nextIdx];

    // Remove the anchor's own command (the segment ending at this anchor)
    result.splice(anchor.cmdIdx, 1);

    // After splice, the next segment (was at nextAnchor.cmdIdx) shifted down by 1
    const segIdx = nextAnchor.cmdIdx - 1;
    if (segIdx >= 0 && segIdx < result.length) {
        const seg = result[segIdx];
        const hasPrevHandle = !!prevAnchor.handleOut;
        const hasNextHandle = !!nextAnchor.handleIn;

        if (hasPrevHandle || hasNextHandle) {
            const hOut = hasPrevHandle
                ? { x: prevAnchor.handleOut!.x, y: prevAnchor.handleOut!.y }
                : { x: prevAnchor.x + (nextAnchor.x - prevAnchor.x) * 0.3, y: prevAnchor.y + (nextAnchor.y - prevAnchor.y) * 0.3 };
            const hIn = hasNextHandle
                ? { x: nextAnchor.handleIn!.x, y: nextAnchor.handleIn!.y }
                : { x: nextAnchor.x - (nextAnchor.x - prevAnchor.x) * 0.3, y: nextAnchor.y - (nextAnchor.y - prevAnchor.y) * 0.3 };
            if (seg[0] === 'L' || seg[0] === 'C') {
                result[segIdx] = ['C', hOut.x, hOut.y, hIn.x, hIn.y, nextAnchor.x, nextAnchor.y];
            }
        }
        // If neither side has handles, the next segment (L or C) remains as-is;
        // its implicit start point shifts to prevAnchor, creating a straight line.
    }

    // If first anchor was removed, ensure M exists
    if (anchorIdx === 0 && result.length > 0 && result[0][0] !== 'M') {
        result.unshift(['M', nextAnchor.x, nextAnchor.y]);
    }

    return result;
}

/** Remove a node from a fabric.Path and update it in place */
export function removeNode(pathObj: fabric.Path, nodeIndex: number): void {
    const cmds = (pathObj.path as unknown as any[][]) || [];
    if (cmds.length < 3) return;
    const isClosed = cmds.length > 0 && (cmds[cmds.length - 1]?.[0] === 'Z' || cmds[cmds.length - 1]?.[0] === 'z');
    const newCmds = removeAnchorFromCmds(cmds, nodeIndex, isClosed);
    if (newCmds.length < 2) return;
    (pathObj as any).__nodeTypes = undefined;
    pathObj.set({ path: newCmds as any });
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
