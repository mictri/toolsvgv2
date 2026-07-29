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

const LEAF_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'image']);
const SKIP_TAGS = new Set(['style', 'defs', 'desc', 'title', 'metadata', 'script']);

interface DomNode {
    /** data-fcv-idx assigned to the original DOM element for matching */
    elementIdx: number;
    tag: string;
    children: DomNode[];
}

/** Assign data-fcv-idx to every renderable SVG element. Returns a map: index → Element. */
function assignTreeIndices(root: Element): Map<number, Element> {
    const idxMap = new Map<number, Element>();
    let counter = 0;

    function walk(el: Element) {
        const tag = el.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return;
        const idx = counter++;
        el.setAttribute('data-fcv-idx', String(idx));
        idxMap.set(idx, el);
        if (tag === 'g') {
            for (const child of Array.from(el.children)) {
                walk(child as Element);
            }
        }
    }

    for (const child of Array.from(root.children)) {
        walk(child as Element);
    }
    return idxMap;
}

/** Walk the SVG DOM (which already has data-fcv-idx) and build a tree of DomNodes. */
function buildDomTree(root: Element): DomNode[] {
    const topNodes: DomNode[] = [];

    function walk(parentEl: Element, parentNode?: DomNode): void {
        for (let i = 0; i < parentEl.children.length; i++) {
            const el = parentEl.children[i] as Element;
            const tag = el.tagName.toLowerCase();
            if (SKIP_TAGS.has(tag)) continue;

            const idxAttr = el.getAttribute('data-fcv-idx');
            if (idxAttr === null) continue;

            const node: DomNode = {
                elementIdx: parseInt(idxAttr, 10),
                tag,
                children: [],
            };

            if (tag === 'g') {
                walk(el, node);
            }

            if (parentNode) {
                parentNode.children.push(node);
            } else {
                topNodes.push(node);
            }
        }
    }

    walk(root);
    return topNodes;
}

export async function parseSvgString(svgString: string, folderName?: string): Promise<SvgParseResult> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    const { width: svgWidth, height: svgHeight } = parseSvgDimensions(svgRoot);

    const cssRules = parseCssStyles(svgRoot);
    inlineCssStyles(svgRoot, cssRules);

    // Step 1: Assign data-fcv-idx to every renderable element (modifies svgRoot in-place)
    const idxToSvgElement = assignTreeIndices(svgRoot);

    // Step 2: Build DOM tree from indexed elements
    const domTree = buildDomTree(svgRoot);

    const modifiedSvg = new XMLSerializer().serializeToString(svgRoot);

    return new Promise((resolve, reject) => {
        // Maps: data-fcv-idx (from fabric's re-parsed elements) → fabric.Object
        const idxToFabricObject = new Map<number, fabric.Object>();

        fabric.loadSVGFromString(modifiedSvg, (rawObjects) => {
            try {
                if (!rawObjects || rawObjects.length === 0) {
                    reject(new Error('No objects found in SVG'));
                    return;
                }

                const flat = flattenObjects(rawObjects.filter(Boolean));
                if (flat.length === 0) {
                    reject(new Error('No valid objects extracted'));
                    return;
                }

                flat.forEach(ensureFill);

                const typeCounters: TypeCounter = {};
                const layers: Layer[] = [];
                const resultObjects: fabric.Object[] = [];

                // Assign IDs to fabric objects and match via data-fcv-idx
                const fabricIdToObj = new Map<string, fabric.Object>();
                flat.forEach(obj => {
                    const id = crypto.randomUUID();
                    (obj as any).id = id;
                    obj.set('data', { id, originalId: '' });
                    obj.set({ selectable: true, evented: true, hasControls: true, hasBorders: true, visible: true });
                    obj.setCoords();
                    fabricIdToObj.set(id, obj);
                    resultObjects.push(obj);

                    // Find matching SVG element by data-fcv-idx
                    const svgEl = idxToSvgElement.get((obj as any).__fcvIdx);
                    if (svgEl) {
                        const origId = svgEl.getAttribute('id') || '';
                        obj.get('data')!.originalId = origId;
                    }
                });

                // ── Build DOM-based hierarchical layers ──
                const folderId = crypto.randomUUID();
                const folderChildIds: string[] = [];

                // Top-level folder for this SVG file
                layers.push({
                    id: folderId,
                    name: folderName || 'Imported SVG',
                    type: 'group',
                    visible: true,
                    locked: false,
                    parentId: null,
                    originalId: '',
                    childrenIds: folderChildIds,
                });

                // Helper: find fabric object IDs by data-fcv-idx
                const findLeafIdsByIndex = (idx: number): string[] => {
                    const obj = idxToFabricObject.get(idx);
                    return obj ? [(obj as any).id] : [];
                };

                const nextName = (objType: string, originalId: string): string => {
                    if (originalId) return originalId;
                    const label = shapeTypeLabel(objType);
                    typeCounters[label] = (typeCounters[label] || 0) + 1;
                    return `${label} ${typeCounters[label]}`;
                };

                function processDomNode(
                    node: DomNode,
                    parentLayerId: string,
                    parentChildIds: string[],
                ): void {
                    const tag = node.tag;

                    if (tag === 'g') {
                        const gid = crypto.randomUUID();
                        const origEl = idxToSvgElement.get(node.elementIdx);
                        const origId = origEl?.getAttribute('id') || '';
                        const name = origId || origEl?.getAttribute('data-name') || 'Group';
                        const childIds: string[] = [];

                        layers.push({
                            id: gid,
                            name,
                            type: 'group',
                            visible: true,
                            locked: false,
                            parentId: parentLayerId,
                            originalId: origId,
                            childrenIds: childIds,
                        });
                        parentChildIds.push(gid);

                        for (const child of node.children) {
                            processDomNode(child, gid, childIds);
                        }
                    } else if (LEAF_TAGS.has(tag)) {
                        const leafIds = findLeafIdsByIndex(node.elementIdx);
                        for (const leafId of leafIds) {
                            const obj = fabricIdToObj.get(leafId)!;
                            const data = obj.get('data') as any;
                            const name = data?.originalId || nextName(tag, '');

                            layers.push({
                                id: leafId,
                                name,
                                type: tag === 'path' ? 'path' : 'svg',
                                visible: true,
                                locked: false,
                                parentId: parentLayerId,
                                originalId: data?.originalId || '',
                                childrenIds: [],
                            });
                            parentChildIds.push(leafId);
                        }
                    }
                }

                // Process each top-level node in DOM tree order
                for (const node of domTree) {
                    processDomNode(node, folderId, folderChildIds);
                }

                resolve({ objects: resultObjects, layers, svgWidth, svgHeight });
            } catch (err) {
                console.error('parseSvgString crashed:', err);
                reject(err);
            }
        }, (element: SVGElement, object: fabric.Object) => {
            // Read data-fcv-idx from re-parsed element and store on fabric object
            const idx = element.getAttribute('data-fcv-idx');
            if (idx !== null) {
                const numIdx = parseInt(idx, 10);
                (object as any).__fcvIdx = numIdx;
                idxToFabricObject.set(numIdx, object);
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
