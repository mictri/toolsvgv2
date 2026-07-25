import { fabric } from 'fabric';
import gsap from 'gsap';
import { AnimatedObject, LoopMode, useEditorStore } from '../../store/editorStore';

let activeGsapTimeline: gsap.core.Timeline | null = null;

export const getActiveTimeline = () => activeGsapTimeline;

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

export const compileTimeline = (
    animatedObjects: AnimatedObject[],
    fabricCanvas: fabric.Canvas | null,
    overrideLoopMode?: LoopMode,
): gsap.core.Timeline | null => {
    if (!fabricCanvas) return null;

    // 1. Kill old timeline triệt để — tránh stale tween/cache
    if (activeGsapTimeline) {
        activeGsapTimeline.pause();
        activeGsapTimeline.clear();
        activeGsapTimeline.kill();
        activeGsapTimeline = null;
    }

    const store = useEditorStore.getState();
    const currentLoop = overrideLoopMode ?? store.loopMode;

    // 2. Cấu hình loop/pingpong
    let repeat = 0;
    let yoyo = false;
    if (currentLoop === 'loop') {
        repeat = -1;
    } else if (currentLoop === 'pingpong') {
        repeat = -1;
        yoyo = true;
    }

    // Force center origin
    for (const ao of animatedObjects) {
        const obj = fabricCanvas.getObjects().find((o: any) => o.data?.id === ao.id);
        if (obj) {
            obj.set('originX', 'center');
            obj.set('originY', 'center');
        }
    }

    // 3. Tạo GSAP Timeline mới với cấu hình loop
    const tl = gsap.timeline({
        paused: true,
        repeat,
        yoyo,
        onUpdate: () => {
            const time = tl.time();
            useEditorStore.getState().setCurrentTime(time);
            for (const ao of animatedObjects) {
                const obj = fabricCanvas.getObjects().find((o: any) => o.data?.id === ao.id);
                if (obj) obj.setCoords();
            }
            fabricCanvas.requestRenderAll();
        },
        onComplete: () => {
            if (currentLoop === 'none') {
                useEditorStore.getState().setIsPlaying(false);
            }
        },
    });

    let maxTime = 0;

    for (const ao of animatedObjects) {
        const targetObj = fabricCanvas.getObjects().find((o: any) => o.data?.id === ao.id);
        if (!targetObj) continue;

        for (const track of ao.tracks) {
            if (!track.enabled || track.keyframes.length < 2) continue;

            // Luôn sort keyframe tăng dần
            const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);
            const isColorTrack = track.property === 'fillColor' || track.property === 'strokeColor';

            // Set trạng thái đầu tiên
            const firstVal = sorted[0];
            const firstVars = trackValueToGSAP(track.property, firstVal.value);

            if (isColorTrack) {
                const rgba = normalizeColorToRgba(firstVal.value);
                const obj = rgbaStringToObject(rgba);
                const colorProp = track.property === 'fillColor' ? 'fill' : 'stroke';
                const proxy = { r: obj.r, g: obj.g, b: obj.b, a: obj.a };
                tl.set(proxy, { r: proxy.r, g: proxy.g, b: proxy.b, a: proxy.a }, Math.max(0, firstVal.time));
                applyColorToObject(targetObj, colorProp as any, objToRgbaString(proxy));
            } else {
                tl.set(targetObj, firstVars, Math.max(0, firstVal.time));
            }

            // Build tween chain giữa các keyframe
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

                    tl.to(proxy, {
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
                    tl.to(targetObj, toVars, Math.max(0, curr.time));
                }

                if (next.time > maxTime) maxTime = next.time;
            }
        }
    }

    // Cập nhật duration nếu cần
    if (maxTime > 0) {
        const storeState = useEditorStore.getState();
        if (maxTime > storeState.duration) {
            useEditorStore.setState({ duration: Math.ceil(maxTime + 1) });
        }
    }

    activeGsapTimeline = tl;

    // Restore playhead về đúng currentTime
    tl.time(store.currentTime);
    for (const ao of animatedObjects) {
        const obj = fabricCanvas.getObjects().find((o: any) => o.data?.id === ao.id);
        if (obj) obj.setCoords();
    }
    fabricCanvas.renderAll();

    return tl;
};
