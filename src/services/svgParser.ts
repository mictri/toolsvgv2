import { fabric } from 'fabric';
import { Layer } from '../store/editorStore';

export interface SvgParseResult {
    objects: fabric.Object[];
    layers: Layer[];
    svgWidth: number;
    svgHeight: number;
}

interface TypeCounter {
    [shapeType: string]: number;
}

interface CssRule {
    selector: string;
    properties: Record<string, string>;
}

function parseCssStyles(svgRoot: Element): CssRule[] {
    const rules: CssRule[] = [];
    svgRoot.querySelectorAll('style').forEach(styleEl => {
        const cssText = styleEl.textContent || '';
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(cssText)) !== null) {
            const selector = match[1].trim();
            const properties: Record<string, string> = {};
            const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
            let propMatch;
            while ((propMatch = propRegex.exec(match[2])) !== null) {
                properties[propMatch[1].trim()] = propMatch[2].trim();
            }
            rules.push({ selector, properties });
        }
    });
    return rules;
}

function elementMatches(element: Element, selector: string): boolean {
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return element.getAttribute('id') === selector.slice(1);
    return element.tagName.toLowerCase() === selector.toLowerCase();
}

const CSS_ATTR_MAP: Record<string, string> = {
    fill: 'fill',
    stroke: 'stroke',
    'stroke-width': 'stroke-width',
    opacity: 'opacity',
    'stroke-opacity': 'stroke-opacity',
};

function inlineCssStyles(root: Element, rules: CssRule[]) {
    root.querySelectorAll('*').forEach(el => {
        rules.forEach(rule => {
            if (!elementMatches(el, rule.selector)) return;
            for (const [prop, value] of Object.entries(rule.properties)) {
                const attr = CSS_ATTR_MAP[prop];
                if (attr && !el.hasAttribute(attr)) {
                    el.setAttribute(attr, value);
                }
            }
        });
    });
}

function shapeTypeLabel(objType: string): string {
    const map: Record<string, string> = {
        path: 'Path', circle: 'Circle', rect: 'Rect', ellipse: 'Ellipse',
        polygon: 'Polygon', polyline: 'Polyline', line: 'Line', text: 'Text',
        image: 'Image',
    };
    return map[objType] || objType.charAt(0).toUpperCase() + objType.slice(1);
}

function parseSvgDimensions(svgRoot: Element): { width: number; height: number } {
    const vb = svgRoot.getAttribute('viewBox');
    if (vb) {
        const parts = vb.trim().split(/\s+/).map(Number);
        if (parts.length === 4 && !parts.some(isNaN)) {
            return { width: parts[2], height: parts[3] };
        }
    }
    const w = svgRoot.getAttribute('width');
    const h = svgRoot.getAttribute('height');
    if (w && h) {
        const pw = parseFloat(w);
        const ph = parseFloat(h);
        if (!isNaN(pw) && !isNaN(ph)) {
            return { width: pw, height: ph };
        }
    }
    return { width: 800, height: 600 };
}

/** Flatten nested groups — extract all leaf objects recursively */
function flattenObjects(objs: fabric.Object[]): fabric.Object[] {
    const result: fabric.Object[] = [];
    for (const obj of objs) {
        if (!obj) continue;
        if (obj.type === 'group') {
            result.push(...flattenObjects((obj as fabric.Group).getObjects()));
        } else {
            result.push(obj);
        }
    }
    return result;
}

/** Ensure leaf objects have a visible fill */
function ensureFill(obj: fabric.Object) {
    if (obj.type === 'group') {
        (obj as fabric.Group).getObjects().forEach(ensureFill);
        return;
    }
    const fill = obj.get('fill') as string | undefined;
    const stroke = obj.get('stroke') as string | undefined;
    if ((!fill || fill === 'none' || fill === 'transparent') && (!stroke || stroke === 'none')) {
        obj.set('fill', '#4285f4');
    }
    if (!obj.get('opacity')) obj.set('opacity', 1);
    obj.set('visible', true);
}

export async function parseSvgString(svgString: string, folderName?: string): Promise<SvgParseResult> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    const { width: svgWidth, height: svgHeight } = parseSvgDimensions(svgRoot);

    const cssRules = parseCssStyles(svgRoot);
    inlineCssStyles(svgRoot, cssRules);

    const modifiedSvg = new XMLSerializer().serializeToString(svgRoot);

    return new Promise((resolve, reject) => {
        const layerInfoMap = new Map<fabric.Object, { originalId: string }>();

        fabric.loadSVGFromString(modifiedSvg, (rawObjects) => {
            try {
                if (!rawObjects || rawObjects.length === 0) {
                    reject(new Error('No objects found in SVG'));
                    return;
                }

                // Flatten all nested groups into a single-level array
                const flat = flattenObjects(rawObjects.filter(Boolean));
                if (flat.length === 0) {
                    reject(new Error('No valid objects extracted'));
                    return;
                }

                // Ensure every object has a visible fill
                flat.forEach(ensureFill);

                const typeCounters: TypeCounter = {};
                const layers: Layer[] = [];
                const resultObjects: fabric.Object[] = [];

                // Set origin to center for all objects
                flat.forEach(obj => {
                    obj.set({ originX: 'center', originY: 'center' });
                    obj.setCoords();
                });

                const nextName = (objType: string, originalId: string): string => {
                    if (originalId) return originalId;
                    const label = shapeTypeLabel(objType);
                    typeCounters[label] = (typeCounters[label] || 0) + 1;
                    return `${label} ${typeCounters[label]}`;
                };

                // Assign IDs and prepare objects
                flat.forEach(obj => {
                    const info = layerInfoMap.get(obj);
                    const originalId = info?.originalId || '';
                    const id = crypto.randomUUID();
                    (obj as any).id = id;
                    obj.set('data', { id, originalId });
                    obj.set({ selectable: true, evented: true, hasControls: true, hasBorders: true, visible: true });
                    obj.setCoords();
                });

                // Compute bounding box center
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                flat.forEach(obj => {
                    const rect = obj.getBoundingRect(true, true);
                    if (rect.left < minX) minX = rect.left;
                    if (rect.top < minY) minY = rect.top;
                    if (rect.left + rect.width > maxX) maxX = rect.left + rect.width;
                    if (rect.top + rect.height > maxY) maxY = rect.top + rect.height;
                });
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const offsetX = 175 - cx;
                const offsetY = 175 - cy;

                // Center all objects at artboard center (175, 175)
                flat.forEach(obj => {
                    obj.set({
                        left: (obj.left || 0) + offsetX,
                        top: (obj.top || 0) + offsetY,
                    });
                    obj.setCoords();
                });

                // Folder layer for the imported SVG
                const folderId = crypto.randomUUID();
                const childIds = flat.map(o => (o as any).id as string);
                layers.push({
                    id: folderId,
                    name: folderName || 'Imported SVG',
                    type: 'group',
                    visible: true,
                    locked: false,
                    parentId: null,
                    originalId: '',
                    childrenIds: childIds,
                });
                // Sub-layers for each child
                childIds.forEach((cid, i) => {
                    const obj = flat[i];
                    const info = layerInfoMap.get(obj);
                    layers.push({
                        id: cid,
                        name: (info?.originalId) || nextName(obj.type || 'svg', ''),
                        type: obj.type === 'path' ? 'path' : 'svg',
                        visible: true,
                        locked: false,
                        parentId: folderId,
                        originalId: info?.originalId || '',
                        childrenIds: [],
                    });
                });

                resultObjects.push(...flat);

                resolve({ objects: resultObjects, layers, svgWidth, svgHeight });
            } catch (err) {
                console.error('parseSvgString crashed:', err);
                reject(err);
            }
        }, (element: SVGElement, object: fabric.Object) => {
            if (element && object) {
                const originalId = element.getAttribute('id') || '';
                layerInfoMap.set(object, { originalId });
            }
        });
    });
}

export function readSvgFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}