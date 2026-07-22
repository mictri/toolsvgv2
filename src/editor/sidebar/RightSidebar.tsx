import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { compileTimeline } from '../timeline/timelineCompiler';
import { fabric } from 'fabric';

interface RightSidebarProps {
    fabricCanvas: fabric.Canvas | React.MutableRefObject<fabric.Canvas | null> | null;
}

export default function RightSidebar({ fabricCanvas }: RightSidebarProps) {
    const { selectedLayerId, currentTime, addMasterKeyframe } = useEditorStore();

    // Các state lưu giá trị cục bộ trong ô nhập
    const [left, setLeft] = useState<string | number>(0);
    const [top, setTop] = useState<string | number>(0);
    const [angle, setAngle] = useState<string | number>(0);
    const [scaleX, setScaleX] = useState<string | number>(1);
    const [scaleY, setScaleY] = useState<string | number>(1);
    const [skewX, setSkewX] = useState<string | number>(0);
    const [skewY, setSkewY] = useState<string | number>(0);
    const [opacity, setOpacity] = useState<string | number>(1);
    const [fill, setFill] = useState('#6366f1');
    const [stroke, setStroke] = useState('#4f46e5');

    // Lấy thực thể canvas thực tế
    const getActiveCanvas = (): fabric.Canvas | null => {
        if (!fabricCanvas) return null;
        return 'current' in fabricCanvas ? fabricCanvas.current : fabricCanvas;
    };

    useEffect(() => {
        const activeCanvas = getActiveCanvas();
        if (!activeCanvas || !selectedLayerId) return;

        const targetObj = activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId);
        if (!targetObj) return;

        const updateLocalStates = () => {
            setLeft(Math.round(targetObj.left || 0));
            setTop(Math.round(targetObj.top || 0));
            setAngle(Math.round(targetObj.angle || 0));
            setScaleX(Number((targetObj.scaleX || 1).toFixed(2)));
            setScaleY(Number((targetObj.scaleY || 1).toFixed(2)));
            setSkewX(Math.round(targetObj.skewX || 0));
            setSkewY(Math.round(targetObj.skewY || 0));
            setOpacity(Number((targetObj.opacity !== undefined ? targetObj.opacity : 1).toFixed(2)));
            setFill((targetObj.fill as string) || '#6366f1');
            setStroke(targetObj.stroke || '#4f46e5');
        };

        updateLocalStates();

        targetObj.on('moving', updateLocalStates);
        targetObj.on('scaling', updateLocalStates);
        targetObj.on('rotating', updateLocalStates);
        targetObj.on('skewing', updateLocalStates);

        return () => {
            targetObj.off('moving', updateLocalStates);
            targetObj.off('scaling', updateLocalStates);
            targetObj.off('rotating', updateLocalStates);
            targetObj.off('skewing', updateLocalStates);
        };
    }, [selectedLayerId, currentTime, fabricCanvas]);

    const handlePropertyChange = (property: string, rawValue: string) => {
        const activeCanvas = getActiveCanvas();
        if (!activeCanvas || !selectedLayerId) return;

        const targetObj = activeCanvas.getObjects().find(obj => obj.data?.id === selectedLayerId);
        if (!targetObj) return;

        // 1. Cập nhật state cục bộ ngay lập tức để người dùng xóa chữ/gõ tiếp mượt mà
        switch (property) {
            case 'left': setLeft(rawValue); break;
            case 'top': setTop(rawValue); break;
            case 'angle': setAngle(rawValue); break;
            case 'scaleX': setScaleX(rawValue); break;
            case 'scaleY': setScaleY(rawValue); break;
            case 'skewX': setSkewX(rawValue); break;
            case 'skewY': setSkewY(rawValue); break;
            case 'opacity': setOpacity(rawValue); break;
            case 'fill': setFill(rawValue); break;
            case 'stroke': setStroke(rawValue); break;
        }

        // 2. Chuyển đổi an toàn giá trị nhập vào
        const numericValue = parseFloat(rawValue);

        // Nếu rỗng hoặc NaN (khi xóa trắng textbox) -> Giữ nguyên trạng thái canvas, không cập nhật lỗi để tránh đối tượng biến mất
        if (isNaN(numericValue) && property !== 'fill' && property !== 'stroke') return;

        const finalValue = (property === 'fill' || property === 'stroke') ? rawValue : numericValue;

        // 3. Áp dụng lên canvas vật lý
        targetObj.set({ [property]: finalValue });
        activeCanvas.renderAll();

        // 4. Với fill/stroke: CHỈ cập nhật canvas, KHÔNG tạo keyframe tự động.
        //    Người dùng sẽ chủ động bấm ◆ Keyframe nếu muốn tạo keyframe màu sắc.
        const isColorProp = property === 'fill' || property === 'stroke';
        if (isColorProp) return;

        // 5. Với các thuộc tính khác: tự động lưu keyframe + compile timeline
        addMasterKeyframe(selectedLayerId, currentTime, activeCanvas);
        compileTimeline(useEditorStore.getState().keyframes, activeCanvas);
    };

    if (!selectedLayerId) {
        return (
            <div className="w-80 border-l border-slate-800 bg-slate-950 p-4 text-xs text-slate-500 italic text-center h-full flex items-center justify-center">
                Select a layer to view properties.
            </div>
        );
    }

    return (
        <div className="w-80 border-l border-slate-800 bg-slate-950 p-5 flex flex-col gap-5 text-slate-200 h-full select-none overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-2">
                Transform Inspector
            </h3>

            {/* Position */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Position</span>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500">X (Left)</label>
                        <input
                            type="number"
                            value={left}
                            onChange={(e) => handlePropertyChange('left', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Y (Top)</label>
                        <input
                            type="number"
                            value={top}
                            onChange={(e) => handlePropertyChange('top', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Scale</span>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500">Scale X</label>
                        <input
                            type="number"
                            step="0.1"
                            value={scaleX}
                            onChange={(e) => handlePropertyChange('scaleX', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Scale Y</label>
                        <input
                            type="number"
                            step="0.1"
                            value={scaleY}
                            onChange={(e) => handlePropertyChange('scaleY', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Skew */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Skew</span>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500">Skew X (°)</label>
                        <input
                            type="number"
                            value={skewX}
                            onChange={(e) => handlePropertyChange('skewX', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Skew Y (°)</label>
                        <input
                            type="number"
                            value={skewY}
                            onChange={(e) => handlePropertyChange('skewY', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Rotation & Opacity */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <span className="text-[10px] font-semibold text-indigo-400 uppercase block mb-1">Rotation</span>
                    <label className="text-[10px] text-slate-500">Angle (°)</label>
                    <input
                        type="number"
                        value={angle}
                        onChange={(e) => handlePropertyChange('angle', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                </div>
                <div>
                    <span className="text-[10px] font-semibold text-indigo-400 uppercase block mb-1">Opacity</span>
                    <label className="text-[10px] text-slate-500">Alpha (0 - 1)</label>
                    <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={opacity}
                        onChange={(e) => handlePropertyChange('opacity', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                </div>
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Appearance Colors</span>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Fill Color</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="color"
                                value={fill}
                                onChange={(e) => handlePropertyChange('fill', e.target.value)}
                                className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0"
                            />
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{fill}</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Stroke Color</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="color"
                                value={stroke}
                                onChange={(e) => handlePropertyChange('stroke', e.target.value)}
                                className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0"
                            />
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{stroke}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}