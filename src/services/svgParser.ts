/**
 * svgParser — Import file SVG thành Fabric object trên Canvas.
 *
 * Luồng xử lý:
 *   1. Đọc file SVG (FileReader)
 *   2. Dùng fabric.loadSVGFromString() parse SVG string → Fabric objects
 *   3. Với mỗi object: gán data.id (UUID), data.type = 'svg'
 *   4. Trả về danh sách để App.tsx thêm vào canvas + store
 */
import { fabric } from 'fabric';
import { Layer } from '../store/editorStore';

export interface SvgParseResult {
    objects: fabric.Object[];
    layers: Layer[];
}

/**
 * Parse SVG string thành Fabric objects.
 * Hỗ trợ SVG có <g> (group) — fabric tự flatten thành các object riêng lẻ.
 */
export async function parseSvgString(svgString: string): Promise<SvgParseResult> {
    return new Promise((resolve, reject) => {
        fabric.loadSVGFromString(svgString, (objects, _options) => {
            if (!objects || objects.length === 0) {
                reject(new Error('No objects found in SVG'));
                return;
            }

            const layers: Layer[] = [];
            objects.forEach((obj, index) => {
                const id = crypto.randomUUID();
                obj.set('data', { id, type: 'svg' });
                layers.push({
                    id,
                    name: `SVG Element ${index + 1}`,
                    type: 'svg',
                    visible: true,
                    locked: false,
                });
            });

            resolve({ objects, layers });
        });
    });
}

/** Đọc file SVG từ File object (file input hoặc drag & drop) */
export function readSvgFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
