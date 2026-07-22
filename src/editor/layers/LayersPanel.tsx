/**
 * LayersPanel — Danh sách layers (bên trái).
 * Cho phép: chọn, ẩn/hiện, khóa, nhóm, kéo thả sắp xếp layer.
 * Dự kiến thay thế Aside trong App.tsx.
 */
import { useEditorStore } from '../../store/editorStore';

export default function LayersPanel() {
    const { layers, selectedLayerId, selectLayer } = useEditorStore();

    return (
        <aside className="w-64 border-r border-slate-800 bg-slate-950/30 p-4 flex flex-col gap-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Layers
            </h2>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {layers.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-2">No layers yet.</p>
                ) : (
                    layers.map((layer) => (
                        <div
                            key={layer.id}
                            onClick={() => selectLayer(layer.id)}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all cursor-pointer ${selectedLayerId === layer.id
                                ? 'bg-indigo-600 text-white font-medium'
                                : 'bg-slate-800/40 text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            <span>{layer.name}</span>
                            {/* Visibility/Lock toggle — sẽ implement sau */}
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
