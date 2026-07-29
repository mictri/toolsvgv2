import { useState, useMemo, useCallback, useEffect } from 'react';
import { fabric } from 'fabric';
import { AnimatedObject, useEditorStore } from '../../store/editorStore';
import { serializeCanvas } from '../../services/svgSerializer';
import { compileToGsapCode } from './gsapCompiler';
import { generateExportHTML, downloadFile, ExportOptions } from './htmlExporter';

interface ExportModalProps {
    fabricCanvas: fabric.Canvas | null;
    animatedObjects: AnimatedObject[];
    onClose: () => void;
}

const SCROLL_START_OPTIONS = [
    { value: 'top 80%', label: 'Top 80%' },
    { value: 'top center', label: 'Top Center' },
    { value: 'center center', label: 'Center Center' },
    { value: 'bottom 20%', label: 'Bottom 20%' },
];

export default function ExportModal({ fabricCanvas, animatedObjects, onClose }: ExportModalProps) {
    const { canvasConfig } = useEditorStore();
    const [format, setFormat] = useState<'complete' | 'snippet'>('complete');
    const [triggerType, setTriggerType] = useState<ExportOptions['triggerType']>('auto');
    const [scrollStart, setScrollStart] = useState('top 80%');
    const [loop, setLoop] = useState(true);
    const [minify, setMinify] = useState(false);
    const [bgColor, setBgColor] = useState('#0f172a');
    const [copied, setCopied] = useState(false);

    const options: ExportOptions = {
        format,
        triggerType,
        scrollStart: triggerType === 'scroll' ? scrollStart : undefined,
        loop,
        minify,
        bgColor,
        width: canvasConfig.width,
    };

    const svgString = useMemo(() => {
        if (!fabricCanvas || fabricCanvas.getObjects().length === 0) return '';
        try {
            return serializeCanvas(fabricCanvas, { width: canvasConfig.width, height: canvasConfig.height });
        } catch {
            return '';
        }
    }, [fabricCanvas, canvasConfig.width, canvasConfig.height]);

    const gsapCode = useMemo(() => {
        const scrollOptions = triggerType === 'scroll' ? { start: scrollStart } : undefined;
        return compileToGsapCode(animatedObjects, triggerType, scrollOptions, loop);
    }, [animatedObjects, triggerType, scrollStart, loop]);

    const idMapping = useMemo(() => {
        if (!fabricCanvas) return [];
        return fabricCanvas.getObjects().map((obj: any) => ({
            dataId: obj.data?.id || obj.id || '',
        })).filter(m => m.dataId);
    }, [fabricCanvas]);

    const exportHtml = useMemo(() => {
        if (!svgString) return '';
        return generateExportHTML(svgString, gsapCode, options, idMapping);
    }, [svgString, gsapCode, options, idMapping]);

    const handleCopy = useCallback(() => {
        if (!exportHtml) return;
        navigator.clipboard.writeText(exportHtml).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [exportHtml]);

    const handleDownload = useCallback(() => {
        if (!exportHtml) return;
        downloadFile(exportHtml, 'animation-export.html');
    }, [exportHtml]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-[960px] max-w-[95vw] max-h-[90vh] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-indigo-400">⬇ Export Animation</span>
                        <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">Standalone HTML</span>
                    </div>
                    <button onClick={onClose}
                        className="text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg p-1.5 transition-colors">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Body — 2 columns */}
                <div className="flex flex-1 divide-x divide-slate-800 min-h-0 overflow-hidden">
                    {/* LEFT — Settings */}
                    <div className="w-[320px] shrink-0 overflow-y-auto p-5 flex flex-col gap-5">
                        {/* Export Format */}
                        <section>
                            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Export Format</span>
                            <div className="mt-2 flex flex-col gap-1.5">
                                <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-indigo-500/40 transition-colors">
                                    <input type="radio" name="format" checked={format === 'complete'} onChange={() => setFormat('complete')}
                                        className="accent-indigo-500" />
                                    <div><span className="text-xs text-slate-200 font-medium">Complete index.html</span>
                                        <span className="text-[10px] text-slate-500 block">Opens directly in any browser</span></div>
                                </label>
                                <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-indigo-500/40 transition-colors">
                                    <input type="radio" name="format" checked={format === 'snippet'} onChange={() => setFormat('snippet')}
                                        className="accent-indigo-500" />
                                    <div><span className="text-xs text-slate-200 font-medium">Embeddable Snippet</span>
                                        <span className="text-[10px] text-slate-500 block">SVG + script to paste into existing pages</span></div>
                                </label>
                            </div>
                        </section>

                        {/* Trigger Type */}
                        <section>
                            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Trigger Type</span>
                            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as any)}
                                className="mt-2 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                                <option value="auto">Auto Play</option>
                                <option value="scroll">On Scroll (ScrollTrigger)</option>
                                <option value="hover">On Hover</option>
                                <option value="click">On Click</option>
                            </select>
                        </section>

                        {/* ScrollTrigger Config */}
                        {triggerType === 'scroll' && (
                            <section className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col gap-3">
                                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">ScrollTrigger Config</span>
                                <div>
                                    <label className="text-[10px] text-slate-500">Start Position</label>
                                    <select value={scrollStart} onChange={(e) => setScrollStart(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                                        {SCROLL_START_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </section>
                        )}

                        {/* Performance & Loop */}
                        <section className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col gap-3">
                            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Performance & Loop</span>
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)}
                                    className="accent-indigo-500 rounded" />
                                Infinite Loop
                            </label>
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={minify} onChange={(e) => setMinify(e.target.checked)}
                                    className="accent-indigo-500 rounded" />
                                Minify Output
                            </label>
                        </section>

                        {/* Background Color */}
                        <section>
                            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Background</span>
                            <div className="mt-2 flex items-center gap-2">
                                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer border border-slate-800 bg-transparent" />
                                <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500" />
                            </div>
                        </section>
                    </div>

                    {/* RIGHT — Code Preview & Actions */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Action buttons */}
                        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800 shrink-0 bg-slate-950/50">
                            <span className="text-[10px] text-slate-500 font-mono">Output Preview</span>
                            <div className="flex items-center gap-2">
                                <button onClick={handleCopy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors">
                                    {copied ? '✅ Copied!' : '📋 Copy Code'}
                                </button>
                                <button onClick={handleDownload}
                                    disabled={!exportHtml}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors">
                                    ⬇️ Download index.html
                                </button>
                            </div>
                        </div>

                        {/* Code preview */}
                        <pre className="flex-1 overflow-auto p-5 text-[11px] leading-relaxed font-mono text-slate-300 bg-slate-950 whitespace-pre-wrap break-all"
                            style={{ tabSize: 2 }}>
                            {exportHtml ? (
                                <code>{exportHtml}</code>
                            ) : (
                                <span className="text-slate-600 italic">No canvas content to export.</span>
                            )}
                        </pre>

                        {/* Footer stats */}
                        <div className="flex items-center justify-between px-5 py-2 border-t border-slate-800 shrink-0 bg-slate-950/30">
                            <span className="text-[10px] text-slate-600">
                                {animatedObjects.length} animated object{animatedObjects.length !== 1 ? 's' : ''}
                                {svgString ? ` · ${(new Blob([exportHtml]).size / 1024).toFixed(1)} KB` : ''}
                            </span>
                            <span className="text-[10px] text-slate-600">{exportHtml.split('\n').length} lines</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
