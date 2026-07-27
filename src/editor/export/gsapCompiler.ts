import { AnimatedObject } from '../../store/editorStore';

function toJsValue(key: string, value: any): string {
    if (key === 'ease') return `"${value}"`;
    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return toJsLiteral(value);
    return String(value);
}

function toJsLiteral(obj: Record<string, any>): string {
    const entries: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        entries.push(`${k}: ${toJsValue(k, v)}`);
    }
    return `{ ${entries.join(', ')} }`;
}

export function mapKeyframeToGsapProps(propName: string, value: any): Record<string, any> {
    switch (propName) {
        case 'position':
        case 'left':
        case 'top':
            return { x: value.x ?? value.left ?? 0, y: value.y ?? value.top ?? 0 };

        case 'rotate':
        case 'rotation':
            return { rotation: Number(value) || 0, transformOrigin: '50% 50%' };

        case 'opacity':
            return { opacity: Number(value) ?? 1 };

        case 'fillColor':
        case 'fill':
            return { fill: typeof value === 'string' ? value : (value.fill || '#f8ff00') };

        case 'strokeColor':
        case 'stroke':
            return { stroke: typeof value === 'string' ? value : (value.stroke || '') };

        case 'fillOpacity':
            return { fillOpacity: Number(value) ?? 1 };

        case 'strokeOpacity':
            return { strokeOpacity: Number(value) ?? 1 };

        case 'strokeWidth':
            return { strokeWidth: Number(value) ?? 0 };

        case 'strokeOffset':
            return { strokeDashoffset: Number(value) ?? 0 };

        case 'strokeDashes': {
            const n = Number(value) || 0;
            return { strokeDasharray: `${n} ${n}` };
        }

        case 'morph':
        case 'morphPath':
            return { morphSVG: typeof value === 'string' ? value : (value?.shape || '') };

        case 'scale':
            return { scaleX: value?.scaleX ?? 1, scaleY: value?.scaleY ?? 1, transformOrigin: '50% 50%' };

        case 'skew':
            return { skewX: value?.skewX ?? 0, skewY: value?.skewY ?? 0 };

        default:
            return { [propName]: value };
    }
}

function getSelector(objectId: string, property: string): string {
    const isGroupTransform = [
        'position', 'left', 'top',
        'rotate', 'rotation',
        'scale', 'skew',
    ].includes(property);
    return isGroupTransform ? `#fcv-${objectId}` : `#fcv-${objectId} path`;
}

export function compileToGsapCode(
    animatedObjects: AnimatedObject[],
    triggerType: string = 'auto',
    scrollOptions?: { start?: string },
    enableLoop: boolean = true,
): string {
    const lines: string[] = [];

    const useScrollTrigger = triggerType === 'scroll';

    const tlConfig: Record<string, any> = {};

    if (useScrollTrigger) {
        tlConfig.scrollTrigger = {
            trigger: '#animation-svg',
            start: scrollOptions?.start || 'top 20%',
            toggleActions: 'play none none reverse',
            markers: true,
        };
    } else if (triggerType === 'hover' || triggerType === 'click') {
        tlConfig.paused = true;
    }

    if (enableLoop && triggerType !== 'scroll') {
        tlConfig.repeat = -1;
    }

    const tlConfigStr = toJsLiteral(tlConfig);

    lines.push(`const tl = gsap.timeline(${tlConfigStr});`);
    lines.push('');

    for (const ao of animatedObjects) {
        if (!ao.tracks) continue;

        for (const track of ao.tracks) {
            if (!track.enabled || track.keyframes.length < 2) continue;

            const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);
            const selector = getSelector(ao.id, track.property);

            lines.push(`// ${ao.objectName} — ${track.property}`);

            for (let i = 0; i < sorted.length - 1; i++) {
                const curr = sorted[i];
                const next = sorted[i + 1];
                const segDuration = +(next.time - curr.time).toFixed(2);
                if (segDuration <= 0) continue;

                const props = mapKeyframeToGsapProps(track.property, next.value);
                props.duration = segDuration;
                props.ease = next.easing || 'power2.out';

                const varsStr = toJsLiteral(props);
                const startTime = curr.time.toFixed(2);

                lines.push(`tl.to("${selector}", ${varsStr}, ${startTime});`);
            }
        }
    }

    return lines.join('\n');
}
