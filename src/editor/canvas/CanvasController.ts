/**
 * CanvasController — Business logic cho Fabric Canvas.
 * Chịu trách nhiệm thêm/xóa/chọn/sắp xếp object trên canvas.
 * Tách logic khỏi UI component Canvas.tsx để dễ maintain.
 */
import { fabric } from 'fabric';
import { Layer } from '../../store/editorStore';

export interface CanvasControllerOptions {
    /** Kích thước canvas mặc định */
    width?: number;
    height?: number;
    backgroundColor?: string;
}

export class CanvasController {
    private canvas: fabric.Canvas | null = null;

    init(canvasEl: HTMLCanvasElement, options?: CanvasControllerOptions) {
        this.canvas = new fabric.Canvas(canvasEl, {
            width: options?.width || 800,
            height: options?.height || 500,
            backgroundColor: options?.backgroundColor || '#1e293b',
            preserveObjectStacking: true,
        });
        return this.canvas;
    }

    dispose() {
        this.canvas?.dispose();
        this.canvas = null;
    }

    addShape(_layer: Layer, fabricObj: fabric.Object) {
        if (!this.canvas) return;
        this.canvas.add(fabricObj);
        this.canvas.setActiveObject(fabricObj);
        this.canvas.renderAll();
    }

    removeObjectById(id: string) {
        if (!this.canvas) return;
        const obj = this.canvas.getObjects().find(o => o.data?.id === id);
        if (obj) {
            this.canvas.remove(obj);
            this.canvas.discardActiveObject().renderAll();
        }
    }

    selectObjectById(id: string | null) {
        if (!this.canvas) return;
        if (!id) {
            this.canvas.discardActiveObject().renderAll();
            return;
        }
        const obj = this.canvas.getObjects().find(o => o.data?.id === id);
        if (obj) this.canvas.setActiveObject(obj).renderAll();
    }

    getCanvas() {
        return this.canvas;
    }
}
