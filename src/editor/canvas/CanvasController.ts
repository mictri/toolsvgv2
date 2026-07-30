import { fabric } from 'fabric';

export interface CanvasControllerOptions {
    containerWidth: number;
    containerHeight: number;
    backgroundColor?: string;
}

export type ZoomChangeCallback = (zoom: number) => void;

export class CanvasController {
    private canvas: fabric.Canvas | null = null;
    private artboardRect: fabric.Rect | null = null;
    private _zoom = 1;
    private onZoomChange: ZoomChangeCallback | null = null;
    private isSpaceDown = false;
    private handToolActive = false;
    private panState = { isPanning: false, startX: 0, startY: 0, tx: 0, ty: 0 };
    private boundHandlers: { [key: string]: (...args: any[]) => void } = {};

    static readonly ARTBOARD_WIDTH = 350;
    static readonly ARTBOARD_HEIGHT = 350;
    static readonly MIN_ZOOM = 0.1;
    static readonly MAX_ZOOM = 50;
    static readonly BASE_CORNER_SIZE = 8;
    static readonly BASE_TOUCH_SIZE = 12;
    static readonly BASE_ROTATING_OFFSET = 30;

    setZoomChangeCallback(cb: ZoomChangeCallback | null) {
        this.onZoomChange = cb;
    }

    init(canvasEl: HTMLCanvasElement, options: CanvasControllerOptions) {
        this.canvas = new fabric.Canvas(canvasEl, {
            width: options.containerWidth,
            height: options.containerHeight,
            backgroundColor: options.backgroundColor || '#0f172a',
            preserveObjectStacking: true,
            enableRetinaScaling: true,
            renderOnAddRemove: true,
            selection: true,
        });

        this.setupArtboard();
        this.centerArtboard();
        this.bindViewportEvents();
        this.bindGlobalKeyEvents();

        return this.canvas;
    }

    dispose() {
        this.unbindGlobalKeyEvents();
        this.canvas?.dispose();
        this.canvas = null;
        this.artboardRect = null;
    }

    private setupArtboard() {
        if (!this.canvas) return;
        const rect = new fabric.Rect({
            left: 0,
            top: 0,
            width: CanvasController.ARTBOARD_WIDTH,
            height: CanvasController.ARTBOARD_HEIGHT,
            fill: '#FFFFFF',
            stroke: 'rgba(255,255,255,0.25)',
            strokeWidth: 1,
            strokeDashArray: [6, 4] as any,
            selectable: false,
            evented: false,
        });
        (rect as any).data = { fcvArtboard: true };
        this.canvas.add(rect);
        this.canvas.sendToBack(rect);
        this.artboardRect = rect;
    }

    centerArtboard() {
        if (!this.canvas || !this.artboardRect) return;
        const cw = this.artboardRect.width || CanvasController.ARTBOARD_WIDTH;
        const ch = this.artboardRect.height || CanvasController.ARTBOARD_HEIGHT;
        const containerWidth = this.canvas.getWidth();
        const containerHeight = this.canvas.getHeight();
        const zoom = 1;
        this._zoom = zoom;
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;
        vpt[0] = zoom;
        vpt[3] = zoom;
        vpt[4] = (containerWidth - cw * zoom) / 2;
        vpt[5] = (containerHeight - ch * zoom) / 2;
        this.canvas.setViewportTransform(vpt);
        this.canvas.requestRenderAll();
        this.onZoomChange?.(zoom);
    }

    updateArtboardSize(width: number, height: number) {
        if (!this.canvas) return;
        const rect = this.findArtboard() || this.artboardRect;
        if (!rect) return;
        rect.set({ width, height });
        this.canvas.sendToBack(rect);
        this.canvas.renderAll();
        this.centerArtboard();
        this.artboardRect = rect;
    }

    private findArtboard(): fabric.Rect | undefined {
        return this.canvas?.getObjects().find((obj: any) =>
            obj.type === 'rect' && obj.data?.fcvArtboard
        ) as fabric.Rect | undefined;
    }

    setArtboardBackground(color: string | null) {
        const rect = this.findArtboard() || this.artboardRect;
        if (!rect) return;
        rect.set({ fill: color || 'transparent' });
        if (this.canvas) {
            this.canvas.sendToBack(rect);
            this.canvas.renderAll();
        }
        this.artboardRect = rect;
    }

    private updateControlsScale() {
        if (!this.canvas) return;
        const zoom = this.canvas.getZoom();
        this.canvas.forEachObject((obj) => {
            if (obj === this.artboardRect) return;
            obj.cornerSize = CanvasController.BASE_CORNER_SIZE / zoom;
            (obj as any).touchCornerSize = CanvasController.BASE_TOUCH_SIZE / zoom;
            obj.rotatingPointOffset = CanvasController.BASE_ROTATING_OFFSET / zoom;
        });
    }

    private bindViewportEvents() {
        if (!this.canvas) return;

        this.boundHandlers.wheel = (opt: fabric.IEvent) => {
            const evt = opt.e as WheelEvent;
            evt.preventDefault();
            const delta = evt.deltaY > 0 ? 0.92 : 1.08;
            const currentZoom = this.canvas!.getZoom();
            let newZoom = currentZoom * delta;
            newZoom = Math.min(CanvasController.MAX_ZOOM, Math.max(CanvasController.MIN_ZOOM, newZoom));
            this._zoom = newZoom;
            this.canvas!.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), newZoom);
            this.updateControlsScale();
            this.canvas!.requestRenderAll();
            this.onZoomChange?.(newZoom);
        };

        this.boundHandlers.mouseDown = (opt: fabric.IEvent) => {
            const evt = opt.e as MouseEvent;
            const isMiddle = evt.button === 1;
            if (this.isSpaceDown || isMiddle || this.handToolActive) {
                if (isMiddle) evt.preventDefault();
                this.panState.isPanning = true;
                this.panState.startX = evt.clientX;
                this.panState.startY = evt.clientY;
                const vpt = this.canvas!.viewportTransform;
                if (vpt) { this.panState.tx = vpt[4]; this.panState.ty = vpt[5]; }
                this.canvas!.defaultCursor = 'grabbing';
                this.canvas!.selection = false;
            }
        };

        this.boundHandlers.mouseMove = (opt: fabric.IEvent) => {
            if (!this.panState.isPanning) return;
            const evt = opt.e as MouseEvent;
            const vpt = this.canvas!.viewportTransform;
            if (!vpt) return;
            vpt[4] = this.panState.tx + (evt.clientX - this.panState.startX);
            vpt[5] = this.panState.ty + (evt.clientY - this.panState.startY);
            this.canvas!.requestRenderAll();
        };

        this.boundHandlers.mouseUp = () => {
            this.panState.isPanning = false;
            this.canvas!.defaultCursor = this.isSpaceDown || this.handToolActive ? 'grab' : 'default';
            if (!this.isSpaceDown && !this.handToolActive) this.canvas!.selection = true;
        };

        this.canvas.on('mouse:wheel', this.boundHandlers.wheel);
        this.canvas.on('mouse:down', this.boundHandlers.mouseDown);
        this.canvas.on('mouse:move', this.boundHandlers.mouseMove);
        this.canvas.on('mouse:up', this.boundHandlers.mouseUp);
    }

    private bindGlobalKeyEvents() {
        this.boundHandlers.globalKeyDown = (e: KeyboardEvent) => {
            if (e.key === ' ' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.isSpaceDown = true;
                if (this.canvas) {
                    this.canvas.defaultCursor = 'grab';
                    this.canvas.selection = false;
                    this.canvas.renderAll();
                }
            }
        };
        this.boundHandlers.globalKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                this.isSpaceDown = false;
                this.panState.isPanning = false;
                if (this.canvas) {
                    this.canvas.defaultCursor = this.handToolActive ? 'grab' : 'default';
                    this.canvas.selection = !this.handToolActive;
                    this.canvas.renderAll();
                }
            }
        };
        window.addEventListener('keydown', this.boundHandlers.globalKeyDown);
        window.addEventListener('keyup', this.boundHandlers.globalKeyUp);
    }

    private unbindGlobalKeyEvents() {
        if (this.boundHandlers.globalKeyDown) {
            window.removeEventListener('keydown', this.boundHandlers.globalKeyDown);
        }
        if (this.boundHandlers.globalKeyUp) {
            window.removeEventListener('keyup', this.boundHandlers.globalKeyUp);
        }
    }

    setHandToolActive(active: boolean) {
        this.handToolActive = active;
    }

    // === PUBLIC API ===

    getZoom(): number {
        return Math.round(this._zoom * 100);
    }

    getRawZoom(): number {
        return this._zoom;
    }

    zoomIn() {
        if (!this.canvas) return;
        const center = new fabric.Point(
            this.canvas.getWidth() / 2,
            this.canvas.getHeight() / 2
        );
        let newZoom = this._zoom * 1.2;
        newZoom = Math.min(CanvasController.MAX_ZOOM, Math.max(CanvasController.MIN_ZOOM, newZoom));
        this._zoom = newZoom;
        this.canvas.zoomToPoint(center, newZoom);
        this.updateControlsScale();
        this.canvas.requestRenderAll();
        this.onZoomChange?.(newZoom);
    }

    zoomOut() {
        if (!this.canvas) return;
        const center = new fabric.Point(
            this.canvas.getWidth() / 2,
            this.canvas.getHeight() / 2
        );
        let newZoom = this._zoom / 1.2;
        newZoom = Math.min(CanvasController.MAX_ZOOM, Math.max(CanvasController.MIN_ZOOM, newZoom));
        this._zoom = newZoom;
        this.canvas.zoomToPoint(center, newZoom);
        this.updateControlsScale();
        this.canvas.requestRenderAll();
        this.onZoomChange?.(newZoom);
    }

    resetZoom() {
        this.centerArtboard();
    }

    resize(width: number, height: number) {
        if (!this.canvas) return;
        this.canvas.setWidth(width);
        this.canvas.setHeight(height);
        this.centerArtboard();
    }

    getCanvas(): fabric.Canvas | null {
        return this.canvas;
    }

    getArtboardRect(): fabric.Rect | null {
        return this.artboardRect;
    }
}
