import { useState, useRef, useEffect } from 'react';
import Canvas from './editor/canvas/Canvas';
import Timeline from './editor/timeline/Timeline';
import RightSidebar from './editor/sidebar/RightSidebar';
import LayersPanel from './editor/layers/LayersPanel';
import { useEditorStore } from './store/editorStore';
import { fabric } from 'fabric';
import { parseSvgString, readSvgFile } from './services/svgParser';
import { serializeCanvas, downloadSvg } from './services/svgSerializer';
import { exportProjectJson, downloadJson } from './services/animationExporter';

export default function App() {
    const { loadFromStorage } = useEditorStore();
    const [canvasInstance, setCanvasInstance] = useState<fabric.Canvas | null>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadFromStorage(); }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleImportSvg = async (file: File) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        try {
            const svgString = await readSvgFile(file);
            const folderName = file.name.replace(/\.svg$/i, '');
            const { objects, layers: newLayers } = await parseSvgString(svgString, folderName);
            
            if (!objects || objects.length === 0) return;

            canvas.clear();
            canvas.setBackgroundColor('#FFFFFF', () => {});

            objects.forEach(obj => {
                canvas.add(obj);
                obj.setCoords();
            });

            canvas.discardActiveObject();
            canvas.calcOffset();
            canvas.renderAll();

            // Ghi đè Layers vào Store
            useEditorStore.getState().setLayers(newLayers);
        } catch (err) {
            console.error('Import SVG failed:', err);
            alert('Failed to import SVG. Make sure the file is a valid SVG.');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleImportSvg(file);
        e.target.value = '';
    };

    const handleExportSvg = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || canvas.getObjects().length === 0) { alert('Canvas is empty.'); return; }
        const svg = serializeCanvas(canvas);
        downloadSvg(svg, 'pro-animation.svg');
        setShowExportMenu(false);
    };

    const handleExportJson = () => {
        const canvas = fabricCanvasRef.current;
        const state = useEditorStore.getState();
        if (state.layers.length === 0) { alert('No layers to export.'); return; }
        const json = exportProjectJson(state.layers, state.animatedObjects, state.duration, canvas);
        downloadJson(json, 'pro-animation.json');
        setShowExportMenu(false);
    };

    return (
        <div className="flex h-screen flex-col bg-slate-900 text-slate-100 font-sans">
            {/* Top Header Bar */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/50 px-6 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-bold tracking-wider text-indigo-400">⚡ PRO SVG ANIMATOR</span>
                    <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/20">Studio v1.0</span>
                </div>
                <div className="flex items-center gap-3">
                    <input ref={fileInputRef} type="file" accept=".svg" onChange={handleFileSelect} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors">
                        📂 Import SVG
                    </button>
                    <div className="relative" ref={exportMenuRef}>
                        <button onClick={() => setShowExportMenu(!showExportMenu)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors">
                            ⬇ Export
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-44 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-[999] p-1.5 flex flex-col gap-1">
                                <button onClick={handleExportSvg}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors">
                                    <span>🖼️</span><span>Export SVG</span>
                                </button>
                                <button onClick={handleExportJson}
                                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors">
                                    <span>📄</span><span>Export JSON (Project)</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Studio — 3-column + timeline below */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar — Layers Tree */}
                <LayersPanel fabricCanvasRef={fabricCanvasRef} />

                {/* Center Column: Canvas + Timeline */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    <main className="flex-1 flex items-center justify-center overflow-hidden bg-slate-900/50">
                        <Canvas fabricCanvasRef={fabricCanvasRef} onCanvasReady={setCanvasInstance} />
                    </main>
                </div>

                {/* Right Sidebar */}
                <RightSidebar fabricCanvas={canvasInstance} />
            </div>
            <Timeline fabricCanvas={canvasInstance} />
        </div>
    );
}