/**
 * animationExporter — Export animation ra các định dạng:
 *   - JSON: serialized keyframes + project data
 *   - GIF: dùng gif.js (WASM) để render từng frame
 *   - WebM: dùng MediaRecorder API
 *
 * Luồng xử lý GIF:
 *   1. Lấy duration từ store
 *   2. Với mỗi frame: seek GSAP timeline → render canvas → capture frame
 *   3. Gửi frames vào gif.js encoder
 *   4. Download file .gif
 */
import { fabric } from 'fabric';
import { KeyframeNode, Layer } from '../store/editorStore';

export interface ProjectData {
    version: string;
    layers: Layer[];
    keyframes: KeyframeNode[];
    duration: number;
    canvasWidth: number;
    canvasHeight: number;
}

/**
 * Serialize project ra JSON string.
 */
export function exportProjectJson(
    layers: Layer[],
    keyframes: KeyframeNode[],
    duration: number,
    canvas: fabric.Canvas | null
): string {
    const project: ProjectData = {
        version: '1.0',
        layers,
        keyframes,
        duration,
        canvasWidth: canvas?.width || 800,
        canvasHeight: canvas?.height || 500,
    };
    return JSON.stringify(project, null, 2);
}

/**
 * Render animation thành các frame ảnh (dùng cho GIF export).
 * @param canvas Fabric canvas instance
 * @param keyframes Danh sách keyframe
 * @param duration Tổng thời gian (giây)
 * @param fps Số frame mỗi giây
 * @returns Mảng các dataURL frame
 */
export async function renderFrames(
    _canvas: fabric.Canvas,
    _keyframes: KeyframeNode[],
    duration: number,
    fps = 24
): Promise<string[]> {
    const frames: string[] = [];
    const totalFrames = Math.ceil(duration * fps);
    for (let i = 0; i < totalFrames; i++) {
        // TODO: Seek GSAP → render canvas → capture frame
    }
    return frames;
}

/**
 * Download JSON blob.
 */
export function downloadJson(json: string, filename = 'animation.json') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
