import { useState } from 'react';
import { fabric } from 'fabric';
import { useEditorStore, Layer } from '../../store/editorStore';

interface LayersPanelProps {
    fabricCanvasRef: React.MutableRefObject<fabric.Canvas | null>;
}

function findObjectById(canvas: fabric.Canvas, id: string): fabric.Object | null {
    for (const obj of canvas.getObjects()) {
        if ((obj.data as any)?.id === id) return obj;
        if (obj.type === 'group') {
            const group = obj as fabric.Group;
            const found = group.getObjects().find(child => (child.data as any)?.id === id);
            if (found) return found;
        }
    }
    return null;
}

function LayerRow({
    layer,
    childrenLayers,
    selectedLayerId,
    collapsed,
    onToggleCollapse,
    onSelect,
    onToggleVisibility,
    depth,
}: {
    layer: Layer;
    childrenLayers: Layer[];
    selectedLayerId: string | null;
    collapsed: boolean;
    onToggleCollapse: (id: string) => void;
    onSelect: (id: string) => void;
    onToggleVisibility: (id: string) => void;
    depth: number;
}) {
    const isGroup = layer.type === 'group';
    const hasChildren = isGroup && childrenLayers.length > 0;

    return (
        <div>
            <div
                onClick={() => onSelect(layer.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-all cursor-pointer select-none
                    ${selectedLayerId === layer.id
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-800'
                    } ${!layer.visible ? 'opacity-50' : ''}`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
                {isGroup ? (
                    <span
                        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleCollapse(layer.id); }}
                        className={`w-4 text-center text-xs transition-colors ${hasChildren ? 'text-slate-400 hover:text-white cursor-pointer' : 'text-transparent'}`}
                    >
                        {hasChildren ? (collapsed ? '▶' : '▼') : '⏤'}
                    </span>
                ) : (
                    <span className="w-4 text-center text-xs text-slate-500">⏤</span>
                )}

                <span className="shrink-0 text-xs">
                    {isGroup ? '📁' : '✏️'}
                </span>

                <span className="truncate flex-1 text-xs">{layer.name || layer.originalId || '(unnamed)'}</span>

                <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    className="text-xs text-slate-500 hover:text-white transition-colors shrink-0 px-1"
                    title={layer.visible ? 'Hide' : 'Show'}
                >
                    {layer.visible ? '👁️' : '👁️‍🗨️'}
                </button>
            </div>

            {isGroup && hasChildren && !collapsed && (
                <div>
                    {childrenLayers.map(child => {
                        const grandChildren = useEditorStore.getState().layers.filter(l => l.parentId === child.id);
                        return (
                            <LayerRow
                                key={child.id}
                                layer={child}
                                childrenLayers={grandChildren}
                                selectedLayerId={selectedLayerId}
                                collapsed={collapsed}
                                onToggleCollapse={onToggleCollapse}
                                onSelect={onSelect}
                                onToggleVisibility={onToggleVisibility}
                                depth={depth + 1}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function LayersPanel({ fabricCanvasRef }: LayersPanelProps) {
    const { layers, selectedLayerId, selectLayer } = useEditorStore();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const rootLayers = layers.filter(l => l.parentId === null);

    const handleSelect = (id: string) => {
        selectLayer(id);
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const obj = findObjectById(canvas, id);
        if (obj) {
            canvas.setActiveObject(obj);
            canvas.renderAll();
        }
    };

    const handleToggleVisibility = (id: string) => {
        useEditorStore.getState().toggleLayerVisibility(id);
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const layer = useEditorStore.getState().layers.find(l => l.id === id);
        if (!layer) return;
        const obj = findObjectById(canvas, id);
        if (obj) {
            obj.set('visible', layer.visible);
            canvas.renderAll();
        }
    };

    const handleToggleCollapse = (id: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/30 p-4 flex flex-col gap-4 overflow-hidden">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Layers Tree</h2>
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
                {rootLayers.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-2">No layers yet.</p>
                ) : (
                    rootLayers.map(layer => {
                        const childrenLayers = layers.filter(l => l.parentId === layer.id);
                        return (
                            <LayerRow
                                key={layer.id}
                                layer={layer}
                                childrenLayers={childrenLayers}
                                selectedLayerId={selectedLayerId}
                                collapsed={collapsedGroups.has(layer.id)}
                                onToggleCollapse={handleToggleCollapse}
                                onSelect={handleSelect}
                                onToggleVisibility={handleToggleVisibility}
                                depth={0}
                            />
                        );
                    })
                )}
            </div>
        </aside>
    );
}
