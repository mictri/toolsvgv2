import { fabric } from 'fabric';
import { Layer } from '../store/editorStore';

export interface SvgParseResult {
    objects: fabric.Object[];
    layers: Layer[];
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
    'stroke-linecap': 'stroke-linecap',
    'stroke-linejoin': 'stroke-linejoin',
    'stroke-dasharray': 'stroke-dasharray',
    'stroke-miterlimit': 'stroke-miterlimit',
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

function generateName(originalId: string, fallback: string, index: number): string {
    return originalId || `${fallback} ${index}`;
}

export async function parseSvgString(svgString: string): Promise<SvgParseResult> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    const cssRules = parseCssStyles(svgRoot);
    inlineCssStyles(svgRoot, cssRules);

    const modifiedSvg = new XMLSerializer().serializeToString(svgRoot);

    return new Promise((resolve, reject) => {
        const layerInfoMap = new Map<fabric.Object, { originalId: string; svgElement: Element | null }>();

        fabric.loadSVGFromString(modifiedSvg, (objects) => {
            if (!objects || objects.length === 0) {
                reject(new Error('No objects found in SVG'));
                return;
            }

            let nameCounter = 0;
            const layers: Layer[] = [];

            function setOriginCenter(obj: fabric.Object) {
                obj.set('originX', 'center');
                obj.set('originY', 'center');
                obj.setCoords();
            }

            function processObject(obj: fabric.Object, parentId: string | null): string {
                const id = crypto.randomUUID();
                const info = layerInfoMap.get(obj);
                const originalId = info?.originalId || '';
                nameCounter++;

                if (obj.type === 'group') {
                    const group = obj as fabric.Group;

                    setOriginCenter(group);

                    const layer: Layer = {
                        id,
                        name: generateName(originalId, `Group ${nameCounter}`, nameCounter),
                        type: 'group',
                        visible: true,
                        locked: false,
                        parentId,
                        originalId,
                        childrenIds: [],
                    };
                    layers.push(layer);

                    const childIds: string[] = [];
                    group.getObjects().forEach(child => {
                        childIds.push(processObject(child, id));
                        setOriginCenter(child);
                    });
                    layer.childrenIds = childIds;

                    group.set('subTargetCheck', true);
                    group.set('data', { ...(group.data || {}), id, originalId, type: 'group' });
                } else {
                    const typeName = obj.type || 'path';
                    layers.push({
                        id,
                        name: generateName(originalId, `${typeName.charAt(0).toUpperCase() + typeName.slice(1)} ${nameCounter}`, nameCounter),
                        type: typeName === 'path' ? 'path' : 'svg',
                        visible: true,
                        locked: false,
                        parentId,
                        originalId,
                        childrenIds: [],
                    });

                    setOriginCenter(obj);
                    obj.set('data', { ...(obj.data || {}), id, originalId });
                }

                return id;
            }

            objects.forEach(obj => {
                processObject(obj, null);
            });

            resolve({ objects, layers });
        }, (element: SVGElement, object: fabric.Object) => {
            const originalId = element.getAttribute('id') || '';
            layerInfoMap.set(object, { originalId, svgElement: element as Element | null });
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
