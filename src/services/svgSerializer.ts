import { fabric } from 'fabric';

export interface SvgExportOptions {
    width?: number;
    height?: number;
    inlineCss?: boolean;
    preserveAspectRatio?: string;
    backgroundColor?: string;
    isTransparent?: boolean;
}

export function serializeCanvas(
    canvas: fabric.Canvas,
    options?: SvgExportOptions,
): string {
    const w = options?.width || 600;
    const h = options?.height || 600;

    const prevBg = canvas.backgroundColor;

    // Hide the artboard rect before export so its dashed border never appears in SVG
    const artboard = canvas.getObjects().find((obj: any) =>
        obj.type === 'rect' && obj.data?.fcvArtboard
    );
    if (artboard) (artboard as any).visible = false;

    // Ensure every object has an id attribute in the SVG output
    const originalIds = new Map<fabric.Object, string | undefined>();
    canvas.forEachObject((obj: any) => {
        originalIds.set(obj, obj.id);
        obj.id = obj.data?.id || obj.id || undefined;
    });

    canvas.backgroundColor = null as any;

    let svg = canvas.toSVG({ width: w, height: h });

    // Restore original ids
    canvas.forEachObject((obj: any) => {
        obj.id = originalIds.get(obj);
    });

    canvas.backgroundColor = prevBg;
    if (artboard) (artboard as any).visible = true;

    svg = svg.replace(/viewBox="[^"]*"/, `viewBox="0 0 ${w} ${h}"`);

    svg = svg.replace(/<defs>\s*<\/defs>/g, '');

    svg = svg.replace(/<rect\s[^>]*?x="0"[^>]*?y="0"[^>]*?width="100%"[^>]*?\/?>/gi, '');

    // Safety: strip any rect with stroke-dasharray at origin (artboard leak fallback)
    svg = svg.replace(/<rect\s[^>]*?x="0"[^>]*?y="0"[^>]*?stroke-dasharray="[^"]*"[^>]*?\/?>/gi, '');

    if (options?.backgroundColor && !options?.isTransparent) {
        svg = svg.replace(/(<desc>[\s\S]*?<\/desc>)/,
            `$1\n<rect x="0" y="0" width="${w}" height="${h}" fill="${options.backgroundColor}" />`);
    }

    if (options?.preserveAspectRatio) {
        svg = svg.replace(/^<svg/, `<svg preserveAspectRatio="${options.preserveAspectRatio}"`);
    }

    return svg;
}

export function downloadSvg(svgString: string, filename = 'animation.svg') {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
