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
            width: options?.width || 400,
            height: options?.height || 400,
            backgroundColor: options?.backgroundColor || '#FFFFFF',
            preserveObjectStacking: true,
            selection: true, // Cho phép kéo chọn đa đối tượng
        });

        return this.canvas;
    }

    dispose() {
        this.canvas?.dispose();
        this.canvas = null;
    }

    /**
     * Nạp danh sách objects từ SVG import vào Canvas
     */
    loadSvgObjects(objects: fabric.Object[]) {
        if (!this.canvas) return;

        // Xóa sạch các object cũ trên Canvas
        this.canvas.clear();

        // Đặt nền canvas
        this.canvas.setBackgroundColor('#FFFFFF', () => {});

        // Thêm trực tiếp từng object con độc lập
        objects.forEach((obj) => {
            // Cho phép chọn và điều khiển từng path rời
            obj.set({
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
            });

            this.canvas?.add(obj);
            // Tính lại Bounding Box chính xác cho từng object
            obj.setCoords();
        });

        this.canvas.discardActiveObject();
        this.canvas.renderAll();
    }

    addShape(_layer: Layer, fabricObj: fabric.Object) {
        if (!this.canvas) return;
        
        fabricObj.set({
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true,
        });

        this.canvas.add(fabricObj);
        fabricObj.setCoords();
        this.canvas.setActiveObject(fabricObj);
        this.canvas.renderAll();
    }

    removeObjectById(id: string) {
        if (!this.canvas) return;
        const obj = this.findObjectById(id);
        if (obj) {
            this.canvas.remove(obj);
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
        }
    }

    /**
     * Chọn object theo ID và cập nhật Bounding Box ôm khít lấy hình
     */
    selectObjectById(id: string | null) {
        if (!this.canvas) return;

        if (!id) {
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
            return;
        }

        const obj = this.findObjectById(id);
        if (obj) {
            // Ép Fabric tính lại tọa độ khung điều khiển trước khi hiển thị
            obj.setCoords();
            this.canvas.setActiveObject(obj);
            this.canvas.renderAll();
        } else {
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
        }
    }

    /**
     * Tìm object trên Canvas dựa trên ID (kiểm tra cả obj.id lẫn obj.data.id)
     */
    private findObjectById(id: string): fabric.Object | null {
        if (!this.canvas) return null;
        
        const objects = this.canvas.getObjects();
        for (const obj of objects) {
            const objId = (obj as any).id || (obj.data as any)?.id;
            if (objId === id) return obj;
        }
        return null;
    }

    getCanvas() {
        return this.canvas;
    }
}