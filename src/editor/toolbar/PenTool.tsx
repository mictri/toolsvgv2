/**
 * PenTool — Công cụ vẽ path (Polyline) bằng click chuột.
 *
 * Cách dùng:
 *   1. Click "Pen" để kích hoạt
 *   2. Click trên canvas để thêm từng điểm
 *   3. Double-click để kết thúc path
 *   4. Escape để hủy
 *   5. Path được tạo thành fabric.Polyline + layer mới
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/editorStore';

interface Point {
    x: number;
    y: number;
}

interface PenToolProps {
    fabricCanvas: fabric.Canvas | null;
}

export default function PenTool({ fabricCanvas }: PenToolProps) {
    const [isActive, setIsActive] = useState(false);
    const pointsRef = useRef<Point[]>([]);
    const previewLineRef = useRef<fabric.Line | null>(null);
    const polylineRef = useRef<fabric.Polyline | null>(null);
    const { addLayer } = useEditorStore();

    // Dọn dẹp preview khi hủy/kết thúc
    const cleanup = useCallback(() => {
        if (previewLineRef.current && fabricCanvas) {
            fabricCanvas.remove(previewLineRef.current);
            previewLineRef.current = null;
        }
        if (polylineRef.current && fabricCanvas) {
            fabricCanvas.remove(polylineRef.current);
            polylineRef.current = null;
        }
        pointsRef.current = [];
    }, [fabricCanvas]);

    // Kết thúc path — tạo Polyline chính thức
    const finishPath = useCallback(() => {
        const canvas = fabricCanvas;
        if (!canvas || pointsRef.current.length < 2) {
            cleanup();
            return;
        }

        const pts = pointsRef.current.map(p => ({ x: p.x, y: p.y }));
        const id = crypto.randomUUID();
        const polyline = new fabric.Polyline(pts, {
            fill: undefined,
            stroke: '#6366f1',
            strokeWidth: 2,
            strokeLineJoin: 'round',
            data: { id, type: 'path' },
        });

        canvas.add(polyline);
        canvas.setActiveObject(polyline);
        canvas.renderAll();

        const count = canvas.getObjects().filter(o => o.data?.type === 'path').length;
        addLayer({ id, name: `Path ${count}`, type: 'path', visible: true, locked: false });

        cleanup();
    }, [fabricCanvas, addLayer, cleanup]);

    // Xử lý click trên canvas
    const handleCanvasClick = useCallback((e: fabric.IEvent) => {
        if (!fabricCanvas) return;
        const pointer = fabricCanvas.getPointer(e.e);
        const pt: Point = { x: pointer.x, y: pointer.y };
        pointsRef.current.push(pt);

        // Vẽ preview line từ điểm trước đến điểm hiện tại
        if (pointsRef.current.length >= 2) {
            const prev = pointsRef.current[pointsRef.current.length - 2];
            if (previewLineRef.current) {
                fabricCanvas.remove(previewLineRef.current);
            }
            const line = new fabric.Line([prev.x, prev.y, pt.x, pt.y], {
                stroke: '#a5b4fc',
                strokeWidth: 1.5,
                strokeDashArray: [4, 4],
                selectable: false,
                evented: false,
                data: { isPreview: true },
            });
            fabricCanvas.add(line);
            previewLineRef.current = line;
            fabricCanvas.renderAll();
        }
    }, [fabricCanvas]);

    // Double-click → finish path
    const handleCanvasDblClick = useCallback((_e: fabric.IEvent) => {
        finishPath();
    }, [finishPath]);

    // Escape → cancel
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && isActive) {
            cleanup();
            setIsActive(false);
        }
    }, [isActive, cleanup]);

    // Đăng ký / hủy các event khi active state thay đổi
    useEffect(() => {
        if (!fabricCanvas || !isActive) return;

        fabricCanvas.on('mouse:down', handleCanvasClick);
        fabricCanvas.on('mouse:dblclick', handleCanvasDblClick);
        window.addEventListener('keydown', handleKeyDown);

        // Đổi cursor
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.selection = false;
        fabricCanvas.renderAll();

        return () => {
            fabricCanvas.off('mouse:down', handleCanvasClick);
            fabricCanvas.off('mouse:dblclick', handleCanvasDblClick);
            window.removeEventListener('keydown', handleKeyDown);
            fabricCanvas.defaultCursor = 'default';
            fabricCanvas.selection = true;
        };
    }, [fabricCanvas, isActive, handleCanvasClick, handleCanvasDblClick, handleKeyDown]);

    const toggleActive = () => {
        if (isActive) {
            cleanup();
        }
        setIsActive(!isActive);
    };

    return (
        <button
            onClick={toggleActive}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${isActive
                ? 'bg-rose-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
            title={isActive ? 'Click canvas to add points, double-click to finish' : 'Pen Tool'}
        >
            ✏️ {isActive ? 'Drawing...' : 'Pen'}
        </button>
    );
}
