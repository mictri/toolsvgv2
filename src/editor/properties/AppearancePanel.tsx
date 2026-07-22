/**
 * AppearancePanel — Panel chỉnh sửa Fill, Stroke, Opacity.
 * Dự kiến thay thế phần Appearance Colors trong RightSidebar hiện tại.
 */
interface AppearancePanelProps {
    selectedLayerId: string | null;
    fabricCanvas: fabric.Canvas | null;
}

export default function AppearancePanel({ selectedLayerId, fabricCanvas: _fabricCanvas }: AppearancePanelProps) {
    if (!selectedLayerId) return null;

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-2">
                Appearance
            </h3>
            {/* Fill — sẽ implement chi tiết sau */}
            <div>
                <label className="text-[10px] text-slate-500">Fill Color</label>
                <input type="color" className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0" />
            </div>
            {/* Stroke */}
            <div>
                <label className="text-[10px] text-slate-500">Stroke Color</label>
                <input type="color" className="w-8 h-8 rounded bg-transparent cursor-pointer border-0 p-0" />
            </div>
            {/* Opacity */}
            <div>
                <label className="text-[10px] text-slate-500">Opacity</label>
                <input type="number" min="0" max="1" step="0.05" className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs" />
            </div>
        </div>
    );
}
