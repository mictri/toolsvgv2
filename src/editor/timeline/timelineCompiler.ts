import { fabric } from 'fabric';
import { globalGsapTimeline } from './gsapInstance';
import { AnimatedObject, useEditorStore } from '../../store/editorStore';

/**
 * Convert a PropertyTrack value into GSAP tween vars for the given property.
 */
function trackValueToGSAP(property: string, value: any): Record<string, any> {
    switch (property) {
        case 'position': return { left: value.left, top: value.top };
        case 'scale': return { scaleX: value.scaleX, scaleY: value.scaleY };
        case 'rotate': return { angle: value };
        case 'opacity': return { opacity: value };
        case 'skew': return { skewX: value.skewX, skewY: value.skewY };
        case 'morph': return { path: value };
        case 'fillColor': return { fill: value };
        case 'fillOpacity': return { fillOpacity: value };
        case 'strokeColor': return { stroke: value };
        case 'strokeOpacity': return { strokeOpacity: value };
        case 'strokeWidth': return { strokeWidth: value };
        case 'strokeOffset': return { strokeDashOffset: value };
        case 'strokeDashes': return { strokeDashArray: value };
        default: return {};
    }
}

/**
 * compileTimeline: Xây dựng GSAP master timeline từ các AnimatedObject
 * với per-property tracks, composite tất cả vào một timeline duy nhất.
 */
export const compileTimeline = (
    animatedObjects: AnimatedObject[],
    fabricCanvas: fabric.Canvas | null,
) => {
    if (!fabricCanvas) return;

    globalGsapTimeline.clear();
    globalGsapTimeline.eventCallback('onUpdate', () => {
        fabricCanvas.renderAll();
    });

    let maxTime = 0;

    for (const ao of animatedObjects) {
        const targetObj = fabricCanvas.getObjects().find((obj) => obj.data?.id === ao.id);
        if (!targetObj) continue;

        for (const track of ao.tracks) {
            if (!track.enabled || track.keyframes.length < 2) continue;

            const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);

            // Đặt trạng thái tại time=0
            const firstVal = sorted[0];
            const firstVars = trackValueToGSAP(track.property, firstVal.value);
            globalGsapTimeline.set(targetObj, firstVars, Math.max(0, firstVal.time));

            // Xây chuỗi keyframes
            for (let i = 0; i < sorted.length - 1; i++) {
                const curr = sorted[i];
                const next = sorted[i + 1];
                const segDuration = next.time - curr.time;
                if (segDuration <= 0) continue;

                const toVars: Record<string, any> = {
                    ...trackValueToGSAP(track.property, next.value),
                    duration: segDuration,
                    ease: next.easing === 'none' ? 'none' : next.easing,
                    onUpdate: () => {
                        if (targetObj.type === 'line') targetObj.setCoords();
                    },
                };
                globalGsapTimeline.to(targetObj, toVars, Math.max(0, curr.time));

                if (next.time > maxTime) maxTime = next.time;
            }
        }
    }

    // Cập nhật duration nếu cần
    if (maxTime > 0) {
        const store = useEditorStore.getState();
        if (maxTime > store.duration) {
            useEditorStore.setState({ duration: Math.ceil(maxTime + 1) });
        }
    }

    // Seek về currentTime
    const currentTime = useEditorStore.getState().currentTime;
    globalGsapTimeline.time(currentTime);
    fabricCanvas.renderAll();
};
