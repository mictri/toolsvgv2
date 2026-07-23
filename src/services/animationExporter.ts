import { fabric } from 'fabric';
import { AnimatedObject, Layer } from '../store/editorStore';

export interface ProjectData {
    version: string;
    layers: Layer[];
    animatedObjects: AnimatedObject[];
    duration: number;
    canvasWidth: number;
    canvasHeight: number;
}

export function exportProjectJson(
    layers: Layer[],
    animatedObjects: AnimatedObject[],
    duration: number,
    canvas: fabric.Canvas | null
): string {
    const project: ProjectData = {
        version: '1.0',
        layers,
        animatedObjects,
        duration,
        canvasWidth: canvas?.width || 800,
        canvasHeight: canvas?.height || 500,
    };
    return JSON.stringify(project, null, 2);
}

export async function renderFrames(
    _canvas: fabric.Canvas,
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
