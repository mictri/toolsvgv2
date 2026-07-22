import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { fabric } from 'fabric';

interface ShapeSelectorProps {
    // Chấp nhận cả thực thể canvas trực tiếp HOẶC đối tượng useRef từ React
    fabricCanvas: fabric.Canvas | React.MutableRefObject<fabric.Canvas | null> | null;
}

interface ShapeTypeOption {
    type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';
    label: string;
    icon: string;
}

export default function ShapeSelector({ fabricCanvas }: ShapeSelectorProps) {
    const { addLayer } = useEditorStore();
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Danh sách công cụ gọn gàng (Đã bỏ toàn bộ phần dịch nghĩa tiếng Việt)
    const shapeOptions: ShapeTypeOption[] = [
        { type: 'rect', label: 'Rectangle', icon: '🟦' },
        { type: 'ellipse', label: 'Ellipse', icon: '⭕' },
        { type: 'polygon', label: 'Polygon', icon: '⬡' },
        { type: 'star', label: 'Star', icon: '⭐' },
        { type: 'line', label: 'Line', icon: '➖' },
    ];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAddShape = (shapeType: ShapeTypeOption['type']) => {
        // GIẢI QUYẾT LỖI KHÔNG XUẤT HIỆN: Tự động trích xuất canvas từ useRef nếu cần
        let activeCanvas: fabric.Canvas | null = null;
        if (fabricCanvas) {
            if ('current' in fabricCanvas) {
                activeCanvas = fabricCanvas.current;
            } else {
                activeCanvas = fabricCanvas as fabric.Canvas;
            }
        }

        if (!activeCanvas) {
            console.warn("Fabric Canvas is not initialized yet.");
            return;
        }

        const id = crypto.randomUUID();
        const count = activeCanvas.getObjects().filter(o => o.data?.type === shapeType).length + 1;
        const name = `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} ${count}`;

        let fabricObj: fabric.Object;

        const baseOptions = {
            left: 150,
            top: 150,
            fill: '#6366f1',
            stroke: '#4f46e5',
            strokeWidth: 2,
            data: { id, type: shapeType },
        };

        switch (shapeType) {
            case 'rect':
                fabricObj = new fabric.Rect({
                    ...baseOptions,
                    width: 100,
                    height: 100,
                    rx: 6,
                    ry: 6,
                });
                break;

            case 'ellipse':
                fabricObj = new fabric.Ellipse({
                    ...baseOptions,
                    rx: 50,
                    ry: 50,
                });
                break;

            case 'polygon': {
                const points = [
                    { x: 50, y: 0 },
                    { x: 93.3, y: 25 },
                    { x: 93.3, y: 75 },
                    { x: 50, y: 100 },
                    { x: 6.7, y: 75 },
                    { x: 6.7, y: 25 }
                ];
                fabricObj = new fabric.Polygon(points, {
                    ...baseOptions,
                    left: 150,
                    top: 150,
                });
                break;
            }

            case 'star': {
                const points = [];
                const numPoints = 5;
                const outerRadius = 50;
                const innerRadius = 20;
                const centerX = 50;
                const centerY = 50;

                for (let i = 0; i < 2 * numPoints; i++) {
                    const r = i % 2 === 0 ? outerRadius : innerRadius;
                    const currAngle = (Math.PI * i) / numPoints - Math.PI / 2;
                    points.push({
                        x: centerX + r * Math.cos(currAngle),
                        y: centerY + r * Math.sin(currAngle),
                    });
                }
                fabricObj = new fabric.Polygon(points, {
                    ...baseOptions,
                    left: 150,
                    top: 150,
                });
                break;
            }

            case 'line':
                fabricObj = new fabric.Line([0, 0, 150, 0], {
                    ...baseOptions,
                    strokeWidth: 4,
                });
                break;
        }

        activeCanvas.add(fabricObj);
        activeCanvas.setActiveObject(fabricObj);
        activeCanvas.renderAll();

        addLayer({
            id,
            name,
            type: shapeType,
            visible: true,
            locked: false,
        });

        setIsOpen(false);
    };

    return (
        <div className="relative inline-block text-left" ref={popoverRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
            >
                <span>+ Add Shape</span>
                <span className="text-xs opacity-80">▼</span>
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-48 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-[999] p-1.5 flex flex-col gap-1">
                    {shapeOptions.map((option) => (
                        <button
                            key={option.type}
                            onClick={() => handleAddShape(option.type)}
                            className="flex items-center gap-3 w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
                        >
                            <span className="text-sm bg-slate-950 p-1 rounded-md">{option.icon}</span>
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}