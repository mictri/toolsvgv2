import { fabric } from 'fabric';
import { useEditorStore } from '../store/editorStore';

export interface ProjectFile {
    version: string;
    name: string;
    createdAt: string;
    fabricObjects: any;
    store: Record<string, any>;
}

async function writeFileNative(blob: Blob, suggestedName: string): Promise<boolean> {
    try {
        const opts: any = {
            suggestedName,
            types: [{
                description: 'Pro SVG Animator Project',
                accept: { 'application/json': ['.prosvg'] },
            }],
        };
        const handle = await (window as any).showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch {
        return false;
    }
}

function writeFileFallback(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function saveProject(
    canvas: fabric.Canvas | null,
    projectName?: string,
): Promise<void> {
    const state = useEditorStore.getState();
    const { undoStack, redoStack, ...storeData } = state;

    let fabricObjects: any = null;
    if (canvas && canvas.getObjects().length > 0) {
        fabricObjects = canvas.toJSON(['data', 'id']);
    }

    const project: ProjectFile = {
        version: '1.0',
        name: projectName || 'Untitled',
        createdAt: new Date().toISOString(),
        fabricObjects,
        store: storeData,
    };

    const json = JSON.stringify(project, null, 2);
    const safeName = projectName?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Untitled';
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

    const saved = await writeFileNative(blob, `${safeName}.prosvg`);
    if (!saved) {
        writeFileFallback(blob, `${safeName}.prosvg`);
    }
}

export function openProject(
    file: File,
    canvas: fabric.Canvas | null,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const raw = e.target?.result as string;
                const data: ProjectFile = JSON.parse(raw);

                if (!data.store) {
                    throw new Error('Invalid project file: missing store data');
                }

                // 1. Restore store state (exclude undo/redo, stop playback)
                const restoreData = { ...data.store, undoStack: [], redoStack: [], isPlaying: false, currentTime: 0 };
                useEditorStore.setState(restoreData);

                // 2. Restore fabric canvas objects
                if (data.fabricObjects && canvas) {
                    const storedState = data.store as any;
                    canvas.loadFromJSON(data.fabricObjects, () => {
                        // Re-apply custom data.id on each object (loadFromJSON may strip it)
                        if (data.fabricObjects.objects) {
                            const restored = canvas.getObjects();
                            data.fabricObjects.objects.forEach((savedObj: any, i: number) => {
                                if (restored[i]) {
                                    if (!(restored[i] as any).data && savedObj.data) {
                                        (restored[i] as any).data = savedObj.data;
                                    }
                                    if (!(restored[i] as any).id && savedObj.id) {
                                        (restored[i] as any).id = savedObj.id;
                                    }
                                }
                            });
                        }

                        canvas.setBackgroundColor(
                            storedState.canvasConfig?.backgroundColor || '#000000',
                            () => {},
                        );
                        canvas.calcOffset();
                        canvas.renderAll();

                        // 3. Select first layer if available
                        const firstLayerId = storedState.layers?.[0]?.id;
                        if (firstLayerId && canvas.getObjects().length > 0) {
                            const target = canvas.getObjects().find(
                                (obj: any) => obj.data?.id === firstLayerId || obj.id === firstLayerId,
                            );
                            if (target) {
                                canvas.setActiveObject(target);
                                useEditorStore.getState().setSelectedObjectIds([firstLayerId]);
                            }
                        }

                        resolve();
                    });
                } else {
                    resolve();
                }
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
