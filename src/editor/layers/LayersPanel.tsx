import { useState, useCallback, useEffect } from 'react';
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

/** Collect all leaf (fabric object) layer IDs in tree order from a folder.
 *  Order is determined by the flat layers array, reflecting drag-drop reordering. */
function collectLeafIds(folderId: string, layers: Layer[], result: string[] = []): string[] {
    const folder = layers.find(l => l.id === folderId);
    if (!folder) return result;
    if (folder.type === 'group') {
        const children = layers.filter(l => l.parentId === folder.id);
        for (const child of children) {
            collectLeafIds(child.id, layers, result);
        }
    } else {
        result.push(folderId);
    }
    return result;
}

/** Sync canvas z-order to match tree order: top of tree = rendered on top */
function syncCanvasOrder(canvas: fabric.Canvas, layers: Layer[]) {
    const topFolders = layers.filter(l => l.parentId === null);

    const orderedLeafIds: string[] = [];
    for (const folder of topFolders) {
        collectLeafIds(folder.id, layers, orderedLeafIds);
    }

    // orderedLeafIds[0] = top of tree → should render on TOP
    // canvas renders: objects[0]=bottom, objects[last]=top
    // So orderedLeafIds[0] → canvas[length-1]
    // orderedLeafIds[last] → canvas[0]
    for (let i = 0; i < orderedLeafIds.length; i++) {
        const obj = findObjectById(canvas, orderedLeafIds[i]);
        if (obj) {
            const targetIdx = orderedLeafIds.length - 1 - i;
            canvas.moveTo(obj, targetIdx);
        }
    }

    // Keep artboard rect at the bottom
    const artboard = canvas.getObjects().find((obj: any) => obj.data?.fcvArtboard);
    if (artboard) canvas.sendToBack(artboard);

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
    onDrop: (e: React.DragEvent, layerId: string) => void;
    onDelete?: (layer: Layer) => void;
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
    onDrop,
    onDelete,
}: LayerRowProps) {
    const childrenLayers = allLayers.filter(l => l.parentId === layer.id);
    const isGroup = layer.type === 'group';
    const hasChildren = isGroup && childrenLayers.length > 0;
    const isEditing = editingId === layer.id;
    const isCollapsed = collapsedGroups.has(layer.id);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', layer.id);
        e.dataTransfer.effectAllowed = 'move';
    }, [layer.id]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDropOn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e, layer.id);
    }, [layer.id, onDrop]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onStartRename(layer.id, layer.name || '');
    }, [layer.id, layer.name, onStartRename]);

    const icon = isGroup ? (isCollapsed ? '📁' : '📂') : '✏️';

    return (
        <div>
            <div
                draggable
                onClick={() => onSelect(layer.id)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDropOn}
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

                <span className="shrink-0 text-xs">{icon}</span>

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
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(layer); }}
                    className="text-xs text-slate-600 hover:text-red-400 transition-colors shrink-0 px-1 opacity-0 group-hover:opacity-100"
                    title="Delete"
                >
                    🗑️
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
                            onDrop={onDrop}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function LayersPanel({ fabricCanvasRef }: LayersPanelProps) {
    const { layers, selectedLayerId, selectLayer, updateLayerName, toggleLayerVisibility, reorderFolder, removeLayerWithDescendants, setPendingUndoFabricData } = useEditorStore();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [rootCollapsed, setRootCollapsed] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const rootLayers = layers.filter(l => l.parentId === null);

    const handleSelect = (id: string) => {
        const canvas = fabricCanvasRef.current;
        selectLayer(id);
        if (!canvas) return;

        if (id === ROOT_LAYER_ID) {
            canvas.discardActiveObject();
        } else {
            // Try to find a fabric object with this ID
            let obj = findObjectById(canvas, id);

            // If no fabric object found, this is a group folder — select its first child leaf
            if (!obj) {
                const firstLeafId = collectLeafIds(id, layers)[0];
                if (firstLeafId) {
                    obj = findObjectById(canvas, firstLeafId);
                }
            }

            if (obj) {
                canvas.discardActiveObject();
                if (obj.group) {
                    (obj.group as any).subTargetCheck = true;
                }
                canvas.setActiveObject(obj);
            } else {
                canvas.discardActiveObject();
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

        const leafIds = collectLeafIds(id, useEditorStore.getState().layers);

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

    const handleDrop = (e: React.DragEvent, targetLayerId: string) => {
        e.preventDefault();
        const movedId = e.dataTransfer.getData('text/plain');
        if (!movedId || movedId === targetLayerId) return;

        const canvas = fabricCanvasRef.current;

        const movedLayer = layers.find(l => l.id === movedId);
        const targetLayer = layers.find(l => l.id === targetLayerId);
        if (!movedLayer || !targetLayer) return;

        // Only allow reordering items that share the same parent
        if (movedLayer.parentId !== targetLayer.parentId) return;

        // Get siblings (same parent) in current flat array order
        const siblings = layers.filter(l => l.parentId === movedLayer.parentId);
        const movedIdx = siblings.findIndex(l => l.id === movedId);
        const targetIdx = siblings.findIndex(l => l.id === targetLayerId);
        if (movedIdx === -1 || targetIdx === -1) return;

        const position = movedIdx < targetIdx ? 'after' : 'before';

        reorderFolder(movedId, targetLayerId, position);

        if (canvas) {
            syncCanvasOrder(canvas, useEditorStore.getState().layers);
        }
    };

    const collectChildIds = useCallback((parentId: string, layers: Layer[], acc: string[] = []): string[] => {
        const children = layers.filter(l => l.parentId === parentId);
        for (const child of children) {
            acc.push(child.id);
            collectChildIds(child.id, layers, acc);
        }
        return acc;
    }, []);

    const handleDeleteLayer = useCallback((layer: Layer) => {
        const childIds = collectChildIds(layer.id, layers);
        const isGroupWithChildren = layer.type === 'group' && childIds.length > 0;

        if (isGroupWithChildren) {
            const msg = `Are you sure you want to delete "${layer.name || 'Untitled'}" and all ${childIds.length} item(s) inside?\n\nThis action cannot be undone.`;
            if (!window.confirm(msg)) return;
        }

        const canvas = fabricCanvasRef.current;
        if (canvas) {
            setPendingUndoFabricData(canvas.toJSON(['data', 'id']));
            const allIds = [layer.id, ...childIds];
            allIds.forEach(lid => {
                const obj = findObjectById(canvas, lid);
                if (obj) canvas.remove(obj);
            });
            canvas.renderAll();
        }

        removeLayerWithDescendants(layer.id);
    }, [layers, fabricCanvasRef, removeLayerWithDescendants, collectChildIds, setPendingUndoFabricData]);

    // Keyboard handler for Delete/Backspace
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const state = useEditorStore.getState();
                const selId = state.selectedLayerId;
                if (!selId || selId === ROOT_LAYER_ID) return;
                const selLayer = state.layers.find(l => l.id === selId);
                if (!selLayer) return;
                // Don't trigger if editing a rename input
                if (document.activeElement?.tagName === 'INPUT') return;
                e.preventDefault();
                handleDeleteLayer(selLayer);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDeleteLayer]);

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
                                        onDrop={handleDrop}
                                        onDelete={handleDeleteLayer}
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
