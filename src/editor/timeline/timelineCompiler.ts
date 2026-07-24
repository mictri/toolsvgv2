import { fabric } from 'fabric';
import { globalGsapTimeline } from './gsapInstance';
import { AnimatedObject, useEditorStore } from '../../store/editorStore';

/**
 * Normalize any CSS color string to rgba(r,g,b,a) using Fabric.js Color.
 * Handles hex, rgba, hsla, named colors, and all CSS color formats.
 */
function normalizeColorToRgba(color: string): string {
    try {
        return new fabric.Color(color).toRgba();
    } catch {
        return 'rgba(0,0,0,1)';
    }
}

function rgbaStringToObject(rgba: string): { r: number; g: number; b: number; a: number } {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return { r: 0, g: 0, b: 0, a: 1 };
    return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: match[4] ? parseFloat(match[4]) : 1,
    };
}

function objToRgbaString(obj: { r: number; g: number; b: number; a: number }): string {
    return `rgba(${Math.round(obj.r)},${Math.round(obj.g)},${Math.round(obj.b)},${obj.a})`;
}

function applyColorToObject(targetObj: fabric.Object, property: 'fill' | 'stroke', colorStr: string) {
    targetObj.set(property as any, colorStr);
    if (targetObj.type === 'group') {
        (targetObj as fabric.Group).forEachObject((child: any) => {
            child.set(property as any, colorStr);
        });
    }
}

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
        case 'fillColor':
        case 'strokeColor': {
            const rgba = normalizeColorToRgba(value);
            const obj = rgbaStringToObject(rgba);
            return { r: obj.r, g: obj.g, b: obj.b, a: obj.a };
        }
        case 'fillOpacity': return { fillOpacity: value };
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

    // Force center origin for correct transform matrix combination
    for (const ao of animatedObjects) {
        const obj = fabricCanvas.getObjects().find((o) => o.data?.id === ao.id);
        if (obj) {
            obj.set('originX', 'center');
            obj.set('originY', 'center');
        }
    }

    globalGsapTimeline.clear();
    globalGsapTimeline.eventCallback('onUpdate', () => {
        for (const ao of animatedObjects) {
            const obj = fabricCanvas.getObjects().find((o) => o.data?.id === ao.id);
            if (obj) obj.setCoords();
        }
        fabricCanvas.requestRenderAll();
    });

    let maxTime = 0;

    for (const ao of animatedObjects) {
        const targetObj = fabricCanvas.getObjects().find((obj) => obj.data?.id === ao.id);
        if (!targetObj) continue;

        for (const track of ao.tracks) {
            if (!track.enabled || track.keyframes.length < 2) continue;

            const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);
            const isColorTrack = track.property === 'fillColor' || track.property === 'strokeColor';

            // Đặt trạng thái tại time=0
            const firstVal = sorted[0];
            const firstVars = trackValueToGSAP(track.property, firstVal.value);

            if (isColorTrack) {
                const rgba = normalizeColorToRgba(firstVal.value);
                const obj = rgbaStringToObject(rgba);
                const colorProp = track.property === 'fillColor' ? 'fill' : 'stroke';
                const proxy = { r: obj.r, g: obj.g, b: obj.b, a: obj.a };
                globalGsapTimeline.set(proxy, { r: proxy.r, g: proxy.g, b: proxy.b, a: proxy.a }, Math.max(0, firstVal.time));
                applyColorToObject(targetObj, colorProp as any, objToRgbaString(proxy));
            } else {
                globalGsapTimeline.set(targetObj, firstVars, Math.max(0, firstVal.time));
            }

            // Xây chuỗi keyframes
            for (let i = 0; i < sorted.length - 1; i++) {
                const curr = sorted[i];
                const next = sorted[i + 1];
                const segDuration = next.time - curr.time;
                if (segDuration <= 0) continue;

                if (isColorTrack) {
                    const colorProp = track.property === 'fillColor' ? 'fill' : 'stroke';
                    const currRgba = normalizeColorToRgba(curr.value);
                    const nextRgba = normalizeColorToRgba(next.value);
                    const currObj = rgbaStringToObject(currRgba);
                    const nextObj = rgbaStringToObject(nextRgba);
                    const proxy: Record<string, number> = { r: currObj.r, g: currObj.g, b: currObj.b, a: currObj.a };

                    globalGsapTimeline.to(proxy, {
                        r: nextObj.r, g: nextObj.g, b: nextObj.b, a: nextObj.a,
                        duration: segDuration,
                        ease: next.easing === 'none' ? 'none' : next.easing,
                        onUpdate: () => {
                            applyColorToObject(targetObj, colorProp as any, objToRgbaString({
                                r: Math.round(proxy.r),
                                g: Math.round(proxy.g),
                                b: Math.round(proxy.b),
                                a: proxy.a,
                            }));
                            fabricCanvas.requestRenderAll();
                        },
                    }, Math.max(0, curr.time));
                } else {
                    const toVars: Record<string, any> = {
                        ...trackValueToGSAP(track.property, next.value),
                        duration: segDuration,
                        ease: next.easing === 'none' ? 'none' : next.easing,
                        onUpdate: () => {
                            targetObj.setCoords();
                        },
                    };
                    globalGsapTimeline.to(targetObj, toVars, Math.max(0, curr.time));
                }

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
    for (const ao of animatedObjects) {
        const obj = fabricCanvas.getObjects().find((o) => o.data?.id === ao.id);
        if (obj) obj.setCoords();
    }
    fabricCanvas.renderAll();
};
