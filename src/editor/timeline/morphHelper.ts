import { fabric } from 'fabric';
import gsap from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';

// Singleton hidden SVG <path> element — fallback MorphSVGPlugin target for unequal paths
const morphPathEl = (() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    return el;
})();

function getEaseFunction(easeName: string): (p: number) => number {
    if (!easeName || easeName === 'none' || easeName === 'Linear') return (p) => p;
    const formatted = easeName.trim().toLowerCase().replace(/\s+/g, '.');
    try {
        return gsap.parseEase(formatted) || ((p: number) => p);
    } catch {
        return (p) => p;
    }
}

/**
 * Direct numeric vector interpolation for SVG paths with equal structure
 * (same number of nodes, same command letters at the same positions).
 * Falls back to GSAP MorphSVGPlugin only if token structure differs.
 */
export function interpolateEqualPath(
    pathA: string,
    pathB: string,
    rawProgress: number,
    easeName: string = 'none',
): string {
    if (rawProgress <= 0) return pathA;
    if (rawProgress >= 1) return pathB;

    const easeFn = getEaseFunction(easeName);
    const progress = easeFn(rawProgress);

    const regex = /([a-zA-Z])|([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/g;
    const tokensA = pathA.match(regex) || [];
    const tokensB = pathB.match(regex) || [];

    if (tokensA.length !== tokensB.length) {
        return morphFallback(pathA, pathB, rawProgress, easeName);
    }

    const resultTokens: string[] = [];
    for (let i = 0; i < tokensA.length; i++) {
        const a = tokensA[i];
        const b = tokensB[i];
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            const v = numA + (numB - numA) * progress;
            resultTokens.push(Number(v.toFixed(4)).toString());
        } else {
            resultTokens.push(a);
        }
    }

    return resultTokens.join(' ');
}

function morphFallback(
    startPathD: string,
    endPathD: string,
    rawProgress: number,
    easeName: string,
): string {
    const gsapEase = easeName === 'none' || easeName === 'Linear' ? 'none' : easeName;
    try {
        if (!morphPathEl) {
            return rawProgress > 0.5 ? endPathD : startPathD;
        }
        morphPathEl.setAttribute('d', startPathD);
        const proxy = { d: startPathD };
        const tween = gsap.to(morphPathEl, {
            morphSVG: {
                shape: endPathD,
                origin: '50% 50%',
                updateTarget: false,
                render: (rawPath: any) => {
                    proxy.d = MorphSVGPlugin.rawPathToString(rawPath);
                },
            },
            ease: gsapEase,
            duration: 1,
            paused: true,
            immediateRender: false,
        });
        tween.progress(rawProgress);
        const result = proxy.d;
        tween.kill();
        return result;
    } catch (error) {
        console.error('MorphSVG Fallback Error:', error);
        return rawProgress > 0.5 ? endPathD : startPathD;
    }
}

export function interpolateMorphPath(
    startPathD: string,
    endPathD: string,
    progress: number,
    easeType: string = 'none',
): string {
    if (!startPathD || typeof startPathD !== 'string') return endPathD || '';
    if (!endPathD || typeof endPathD !== 'string') return startPathD || '';
    if (progress <= 0) return startPathD;
    if (progress >= 1) return endPathD;

    return interpolateEqualPath(startPathD, endPathD, progress, easeType);
}

export function pathArrayToString(pathArr: any[][]): string {
    if (!Array.isArray(pathArr) || pathArr.length === 0) return '';
    return pathArr.map((cmd: any[]) => (Array.isArray(cmd) ? cmd.join(' ') : String(cmd))).join(' ');
}

export function morphedPathToString(startD: string, endD: string, progress: number, easeType?: string): string {
    return interpolateMorphPath(startD, endD, progress, easeType);
}

export function getPathStringFromObj(pathObj: fabric.Path): string {
    const pathArr = (pathObj as any).path;
    return Array.isArray(pathArr) ? pathArrayToString(pathArr) : '';
}

export function applyPathString(pathObj: fabric.Path, pathStr: string) {
    if (!pathStr || typeof pathStr !== 'string') return;
    try {
        const parsed = (fabric.util as any).parsePath(pathStr);
        if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return;
        pathObj.set({ path: parsed as any, dirty: true });
        pathObj.setCoords();
    } catch {
        const cmds: any[][] = [];
        const tokens = pathStr.match(/[A-Za-z]|[\d.-]+/g);
        if (tokens) {
            let i = 0;
            while (i < tokens.length) {
                const cmd = tokens[i++];
                const params: number[] = [];
                while (i < tokens.length && /[\d.-]/.test(tokens[i])) {
                    params.push(parseFloat(tokens[i++]));
                }
                cmds.push([cmd, ...params]);
            }
            if (cmds.length > 0) {
                pathObj.set({ path: cmds as any, dirty: true });
                pathObj.setCoords();
            }
        }
    }
}
