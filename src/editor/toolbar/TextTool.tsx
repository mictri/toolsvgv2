/**
 * TextTool — Thêm text object vào Canvas.
 * Sử dụng fabric.IText để tạo text có thể chỉnh sửa trực tiếp trên canvas.
 */
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/editorStore';

interface TextToolProps {
    fabricCanvas: fabric.Canvas | null;
}

export default function TextTool({ fabricCanvas }: TextToolProps) {
    const { addLayer } = useEditorStore();

    const handleAddText = () => {
        if (!fabricCanvas) return;

        const id = crypto.randomUUID();
        const count = fabricCanvas.getObjects().filter(o => o.data?.type === 'text').length + 1;
        const name = `Text ${count}`;

        const text = new fabric.IText('Type here', {
            left: 150,
            top: 150,
            fontFamily: 'Arial',
            fontSize: 32,
            fill: '#e2e8f0',
            data: { id, type: 'text' },
        });

        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        fabricCanvas.renderAll();

        addLayer({ id, name, type: 'text', visible: true, locked: false });
    };

    return (
        <button
            onClick={handleAddText}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1"
        >
            T Text
        </button>
    );
}
