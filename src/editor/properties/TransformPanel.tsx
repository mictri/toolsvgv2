/**
 * TransformPanel — Panel chỉnh sửa Position, Scale, Skew, Rotation.
 * Dự kiến thay thế phần Position / Scale / Skew / Rotation trong RightSidebar hiện tại.
 */
interface TransformPanelProps {
    selectedLayerId: string | null;
    fabricCanvas: fabric.Canvas | null;
}

export default function TransformPanel({ selectedLayerId, fabricCanvas: _fabricCanvas }: TransformPanelProps) {
    if (!selectedLayerId) return null;

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-2">
                Transform
            </h3>
            {/* Position */}
            <div>
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Position</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                        <label className="text-[10px] text-slate-500">X</label>
                        <input type="number" className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Y</label>
                        <input type="number" className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs" />
                    </div>
                </div>
            </div>
            {/* Scale, Skew, Rotation — sẽ implement chi tiết sau */}
            <p className="text-[10px] text-slate-600 italic">Scale / Skew / Rotation — coming soon</p>
        </div>
    );
}
