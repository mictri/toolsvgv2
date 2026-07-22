/**
 * svgSerializer — Export Fabric Canvas thành file SVG string.
 *
 * Luồng xử lý:
 *   1. Dùng canvas.toSVG() để lấy SVG string từ Fabric canvas
 *   2. Có thể thêm metadata (viewBox, animation tags...)
 *   3. Tạo file blob và trigger download
 */
import { fabric } from 'fabric';

export interface SvgExportOptions {
    /** Width của viewBox (mặc định lấy từ canvas) */
    width?: number;
    /** Height của viewBox (mặc định lấy từ canvas) */
    height?: number;
    /** Có inline CSS vào SVG không */
    inlineCss?: boolean;
}

/**
 * Serialize Fabric canvas thành SVG string.
 */
export function serializeCanvas(
    canvas: fabric.Canvas,
    options?: SvgExportOptions
): string {
    const svg = canvas.toSVG({
        width: options?.width,
        height: options?.height,
    });
    return svg;
}

/**
 * Tạo file blob từ SVG string và trigger download.
 */
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
