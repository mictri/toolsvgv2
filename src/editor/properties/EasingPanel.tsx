/**
 * EasingPanel — Panel chọn easing curve cho keyframe.
 * Sau này có thể nâng cấp lên visual curve editor (drag handle).
 */
import { useState } from 'react';

type EasingOption = 'none' | 'power2.out' | 'bounce.out' | 'back.out';

interface EasingPanelProps {
    selectedKeyframeId: string | null;
    onChange?: (easing: EasingOption) => void;
}

const EASING_OPTIONS: { value: EasingOption; label: string }[] = [
    { value: 'none', label: 'Linear' },
    { value: 'power2.out', label: 'Ease Out' },
    { value: 'bounce.out', label: 'Bounce' },
    { value: 'back.out', label: 'Back' },
];

export default function EasingPanel({ selectedKeyframeId, onChange }: EasingPanelProps) {
    const [easing, setEasing] = useState<EasingOption>('power2.out');

    if (!selectedKeyframeId) return null;

    const handleChange = (value: EasingOption) => {
        setEasing(value);
        onChange?.(value);
    };

    return (
        <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold text-indigo-400 uppercase">Easing</span>
            <select
                value={easing}
                onChange={(e) => handleChange(e.target.value as EasingOption)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100"
            >
                {EASING_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}
