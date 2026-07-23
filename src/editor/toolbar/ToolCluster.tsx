import { useState, useRef, useEffect } from 'react';

export interface ToolItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
}

interface ToolClusterProps {
    items: ToolItem[];
    activeId: string;
    onSelect: (id: string) => void;
    className?: string;
    isActive?: boolean;
    /** 'mode' = toggle on/off (transform, hand, pen), 'instant' = perform action (shape) */
    behavior?: 'mode' | 'instant';
    onMainClick?: () => void;
}

export default function ToolCluster({
    items, activeId, onSelect, className, isActive,
    behavior = 'mode', onMainClick
}: ToolClusterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const activeItem = items.find(i => i.id === activeId) || items[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMainClick = () => {
        if (onMainClick) {
            onMainClick();
        } else if (behavior === 'instant') {
            onSelect(activeItem.id);
        } else if (isActive) {
            onSelect('transform');
        } else {
            onSelect(activeItem.id);
        }
    };

    return (
        <div ref={ref} className={`relative inline-flex ${className || ''}`}>
            <button
                onClick={handleMainClick}
                className={`rounded-l-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${isActive
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                title={`${activeItem.label}${activeItem.shortcut ? ` (${activeItem.shortcut})` : ''}`}
            >
                <span>{activeItem.icon}</span>
                <span>{activeItem.label}</span>
                {activeItem.shortcut && (
                    <kbd className="text-[9px] font-mono text-slate-500 bg-slate-800/60 px-1 py-0.5 rounded border border-slate-700/50 ml-0.5">{activeItem.shortcut}</kbd>
                )}
            </button>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`rounded-r-lg border-l border-slate-600 px-1.5 py-1.5 text-xs transition-colors ${isActive
                    ? 'bg-rose-700 text-white hover:bg-rose-600'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                title="Select tool"
            >
                ▼
            </button>
            {isOpen && (
                <div className="absolute left-0 top-full mt-1 w-52 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-[999] p-1.5 flex flex-col gap-1">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => { onSelect(item.id); setIsOpen(false); }}
                            className={`flex items-center w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${item.id === activeId
                                ? 'text-indigo-300 bg-indigo-950/40'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                        >
                            <span className="flex items-center gap-3 flex-1 min-w-0">
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </span>
                            {item.shortcut && (
                                <kbd className="ml-auto text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{item.shortcut}</kbd>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
