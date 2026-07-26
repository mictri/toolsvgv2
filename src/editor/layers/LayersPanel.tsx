import { useState, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { useEditorStore, ROOT_LAYER_ID, Layer } from '../../store/editorStore';

interface LayersPanelProps {
    fabricCanvasRef: React.MutableRefObject<fabric.Canvas | null>;
}

function findObjectById(container: fabric.Canvas | fabric.Group, id: string): fabric.Object | null {
    const items = container.getObjects();
    for (const obj of items) {
        if ((obj as any).id === id || (obj.data as any)?.id === id) return obj;
        if (obj.type === 'group') {
            const found = searchGroupRecursive(obj as fabric.Group, id);
            if (found) return found;
        }
    }
    return null;
}

function searchGroupRecursive(group: fabric.Group, id: string): fabric.Object | null {
    for (const child of group.getObjects()) {
        if ((child as any).id === id || (child.data as any)?.id === id) return child;
        if (child.type === 'group') {
            const found = searchGroupRecursive(child as fabric.Group, id);
            if (found) return found;
        }
    }
    return null;
}

function syncCanvasOrder(canvas: fabric.Canvas, layers: Layer[]) {
    const flat = layers.filter(l => l.parentId === null);
    for (let i = flat.length - 1; i >= 0; i--) {
        const obj = findObjectById(canvas, flat[i].id);
        if (obj) canvas.moveTo(obj, flat.length - 1 - i);
    }
    canvas.renderAll();
}

interface LayerRowProps {
    layer: Layer;
    allLayers: Layer[];
    selectedLayerId: string | null;
    collapsedGroups: Set<string>;
    editingId: string | null;
    editingName: string;
    depth: number;
    onToggleCollapse: (id: string) => void;
    onSelect: (id: string) => void;
    onToggleVisibility: (id: string) => void;
    onStartRename: (id: string, currentName: string) => void;
    onRenameChange: (name: string) => void;
    onRenameSubmit: () => void;
    onRenameCancel: () => void;
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: (e: React.DragEvent) => void;
}

function LayerRow({
    layer,
    allLayers,
    selectedLayerId,
    collapsedGroups,
    editingId,
    editingName,
    depth,
    onToggleCollapse,
    onSelect,
    onToggleVisibility,
    onStartRename,
    onRenameChange,
    onRenameSubmit,
    onRenameCancel,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: LayerRowProps) {
    const childrenLayers = allLayers.filter(l => l.parentId === layer.id);
    const isGroup = layer.type === 'group';
    const hasChildren = isGroup && childrenLayers.length > 0;
    const isEditing = editingId === layer.id;
    const isCollapsed = collapsedGroups.has(layer.id);
    const flatIndex = allLayers.findIndex(l => l.id === layer.id);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onStartRename(layer.id, layer.name || '');
    }, [layer.id, layer.name, onStartRename]);

    return (
        <div>
            <div
                draggable
                onClick={() => onSelect(layer.id)}
                onDragStart={(e) => onDragStart(e, flatIndex)}
                onDragOver={(e) => onDragOver(e, flatIndex)}
                onDrop={(e) => onDrop(e, flatIndex)}
                onDragEnd={onDragEnd}
                onContextMenu={handleContextMenu}
                className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-all cursor-pointer select-none
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
                        {hasChildren ? (isCollapsed ? '▶' : '▼') : '⏤'}
                    </span>
                ) : (
                    <span className="w-4 text-center text-xs text-slate-500">⏤</span>
                )}

                <span className="shrink-0 text-xs">
                    {isGroup ? '📁' : '✏️'}
                </span>

                {isEditing ? (
                    <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') onRenameSubmit();
                            if (e.key === 'Escape') onRenameCancel();
                        }}
                        onBlur={onRenameSubmit}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-slate-800 border border-indigo-500 rounded px-1 py-0.5 text-xs text-white outline-none"
                    />
                ) : (
                    <span
                        className="truncate flex-1 text-xs"
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            onStartRename(layer.id, layer.name || '');
                        }}
                    >
                        {layer.name || layer.originalId || '(unnamed)'}
                    </span>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    className="text-xs text-slate-500 hover:text-white transition-colors shrink-0 px-1"
                    title={layer.visible ? 'Hide' : 'Show'}
                >
                    {layer.visible ? '👁️' : '👁️‍🗨️'}
                </button>
            </div>

            {isGroup && hasChildren && !isCollapsed && (
                <div>
                    {childrenLayers.map(child => (
                        <LayerRow
                            key={child.id}
                            layer={child}
                            allLayers={allLayers}
                            selectedLayerId={selectedLayerId}
                            collapsedGroups={collapsedGroups}
                            editingId={editingId}
                            editingName={editingName}
                            depth={depth + 1}
                            onToggleCollapse={onToggleCollapse}
                            onSelect={onSelect}
                            onToggleVisibility={onToggleVisibility}
                            onStartRename={onStartRename}
                            onRenameChange={onRenameChange}
                            onRenameSubmit={onRenameSubmit}
                            onRenameCancel={onRenameCancel}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            onDragEnd={onDragEnd}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function LayersPanel({ fabricCanvasRef }: LayersPanelProps) {
    const { layers, selectedLayerId, selectLayer, updateLayerName, toggleLayerVisibility, reorderLayers } = useEditorStore();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [rootCollapsed, setRootCollapsed] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const dragIndex = useRef<number | null>(null);

    const rootLayers = layers.filter(l => l.parentId === null);

    const handleSelect = (id: string) => {
        const canvas = fabricCanvasRef.current;
        selectLayer(id);

        if (!canvas) return;

        const collectChildObjects = (parentId: string, acc: fabric.Object[]) => {
            const parent = layers.find(l => l.id === parentId);
            if (!parent) return;
            if (parent.type === 'group') {
                parent.childrenIds.forEach(cid => collectChildObjects(cid, acc));
            } else {
                const obj = findObjectById(canvas, parentId);
                if (obj) acc.push(obj);
            }
        };

        if (id === ROOT_LAYER_ID) {
            canvas.discardActiveObject();
        } else {
            const layer = layers.find(l => l.id === id);
            if (layer?.type === 'group' && layer.childrenIds.length > 0) {
                const childObjects: fabric.Object[] = [];
                collectChildObjects(id, childObjects);
                if (childObjects.length > 0) {
                    canvas.discardActiveObject();
                    const sel = new fabric.ActiveSelection(childObjects, { canvas });
                    canvas.setActiveObject(sel);
                } else {
                    canvas.discardActiveObject();
                }
            } else {
                const obj = findObjectById(canvas, id);
                if (obj) {
                    canvas.discardActiveObject();
                    canvas.setActiveObject(obj);
                } else {
                    canvas.discardActiveObject();
                }
            }
        }
        canvas.requestRenderAll();
    };

    const handleToggleVisibility = (id: string) => {
        toggleLayerVisibility(id);
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const afterToggle = useEditorStore.getState().layers.find(l => l.id === id);
        if (!afterToggle) return;
        const newVisible = afterToggle.visible;

        const collectLeafIds = (layerId: string, acc: string[] = []): string[] => {
            const l = layers.find(x => x.id === layerId);
            if (!l) return acc;
            if (l.type === 'group') {
                l.childrenIds.forEach(cid => collectLeafIds(cid, acc));
            } else {
                acc.push(layerId);
            }
            return acc;
        };

        const leafIds = collectLeafIds(id);

        leafIds.forEach(lid => {
            const obj = findObjectById(canvas, lid);
            if (obj) obj.set('visible', newVisible);
        });
        canvas.renderAll();
    };

    const handleToggleCollapse = (id: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleStartRename = (id: string, currentName: string) => {
        setEditingId(id);
        setEditingName(currentName);
    };

    const handleRenameSubmit = () => {
        if (editingId && editingName.trim()) {
            updateLayerName(editingId, editingName.trim());
            const canvas = fabricCanvasRef.current;
            if (canvas) {
                const obj = findObjectById(canvas, editingId);
                if (obj) {
                    obj.set('name', editingName.trim());
                    canvas.renderAll();
                }
            }
        }
        setEditingId(null);
        setEditingName('');
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        dragIndex.current = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, dropIdx: number) => {
        e.preventDefault();
        const fromIdx = dragIndex.current;
        if (fromIdx === null || fromIdx === dropIdx) return;
        
        reorderLayers(fromIdx, dropIdx);
        const canvas = fabricCanvasRef.current;
        if (canvas) {
            syncCanvasOrder(canvas, useEditorStore.getState().layers);
        }
        dragIndex.current = null;
    };

    return (
        <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/30 p-4 flex flex-col gap-4 overflow-hidden">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Layers Tree</h2>
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
                <div>
                    <div
                        onClick={() => handleSelect(ROOT_LAYER_ID)}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-all cursor-pointer select-none
                            ${selectedLayerId === ROOT_LAYER_ID
                                ? 'bg-indigo-600 text-white font-medium'
                                : 'text-slate-300 hover:bg-slate-800'
                            }`}
                    >
                        <span
                            onClick={(e) => { e.stopPropagation(); setRootCollapsed(c => !c); }}
                            className="w-4 text-center text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                            {rootCollapsed ? '▶' : '▼'}
                        </span>
                        <span className="shrink-0 text-xs">📄</span>
                        <span className="truncate flex-1 text-xs font-semibold">LAYER</span>
                    </div>

                    {!rootCollapsed && (
                        <div>
                            {rootLayers.length === 0 ? (
                                <p className="text-xs text-slate-500 italic p-2 pl-8">No layers yet.</p>
                            ) : (
                                rootLayers.map((layer) => (
                                    <LayerRow
                                        key={layer.id}
                                        layer={layer}
                                        allLayers={layers}
                                        selectedLayerId={selectedLayerId}
                                        collapsedGroups={collapsedGroups}
                                        editingId={editingId}
                                        editingName={editingName}
                                        depth={0}
                                        onToggleCollapse={handleToggleCollapse}
                                        onSelect={handleSelect}
                                        onToggleVisibility={handleToggleVisibility}
                                        onStartRename={handleStartRename}
                                        onRenameChange={setEditingName}
                                        onRenameSubmit={handleRenameSubmit}
                                        onRenameCancel={() => setEditingId(null)}
                                        onDragStart={handleDragStart}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                        onDragEnd={() => { dragIndex.current = null; }}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}