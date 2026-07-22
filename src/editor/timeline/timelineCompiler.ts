import { fabric } from 'fabric';
import { globalGsapTimeline } from './gsapInstance';
import { KeyframeNode, useEditorStore } from '../../store/editorStore';

/**
 * compileTimeline: Xây dựng GSAP timeline từ danh sách KeyframeNode.
 *
 * THAY ĐỔI QUAN TRỌNG:
 *   - KHÔNG dùng targetObj.set() để gán trạng thái đầu (vì sẽ ghi đè trạng thái
 *     chỉnh sửa hiện tại của object trên Canvas).
 *   - Thay vào đó, dùng globalGsapTimeline.set() (tương đương to() với duration=0)
 *     để GSAP biết trạng thái tại time=0 mà không động đến object thật.
 *   - Kết quả: người dùng có thể chỉnh màu/vị trí/scale... trên Canvas ngay lập tức,
 *     và khi Play thì GSAP chạy từ keyframe đầu tiên.
 *   - Sau khi rebuild, seek GSAP timeline về currentTime để đồng bộ playhead.
 */
export const compileTimeline = (keyframes: KeyframeNode[], fabricCanvas: fabric.Canvas | null) => {
    if (!fabricCanvas) return;

    // 1. Reset timeline hiện tại
    globalGsapTimeline.clear();

    // 2. Lấy danh sách các Layer có dữ liệu Keyframe
    const uniqueLayerIds = Array.from(new Set(keyframes.map((k) => k.layerId)));

    uniqueLayerIds.forEach((layerId) => {
        const targetObj = fabricCanvas.getObjects().find((obj) => obj.data?.id === layerId);
        if (!targetObj) return;

        // Lọc và sắp xếp các keyframe của layer này theo mốc thời gian tăng dần
        const layerKfs = keyframes
            .filter((k) => k.layerId === layerId)
            .sort((a, b) => a.time - b.time);

        if (layerKfs.length === 0) return;

        // 3. Đặt trạng thái tại time=0 bằng GSAP.set() (không động đến object thật)
        const firstKf = layerKfs[0];
        globalGsapTimeline.set(targetObj, {
            left: firstKf.transform.left,
            top: firstKf.transform.top,
            angle: firstKf.transform.angle,
            scaleX: firstKf.transform.scaleX,
            scaleY: firstKf.transform.scaleY,
            skewX: firstKf.transform.skewX,
            skewY: firstKf.transform.skewY,
            opacity: firstKf.transform.opacity,
            fill: firstKf.transform.fill,
            stroke: firstKf.transform.stroke,
        }, 0);

        // 4. Xây dựng chuỗi chuyển động liên hoàn (Tweening Chain)
        for (let i = 0; i < layerKfs.length - 1; i++) {
            const currentKf = layerKfs[i];
            const nextKf = layerKfs[i + 1];
            const segmentDuration = nextKf.time - currentKf.time;

            if (segmentDuration <= 0) continue;

            globalGsapTimeline.to(targetObj, {
                left: nextKf.transform.left,
                top: nextKf.transform.top,
                angle: nextKf.transform.angle,
                scaleX: nextKf.transform.scaleX,
                scaleY: nextKf.transform.scaleY,
                skewX: nextKf.transform.skewX,
                skewY: nextKf.transform.skewY,
                opacity: nextKf.transform.opacity,
                fill: nextKf.transform.fill,
                stroke: nextKf.transform.stroke,
                duration: segmentDuration,
                ease: nextKf.easing === 'none' ? 'none' : nextKf.easing,
                onUpdate: () => {
                    fabricCanvas.renderAll();
                },
            }, currentKf.time);
        }
    });

    // 5. Seek về currentTime để GSAP timeline đồng bộ với playhead hiện tại
    //    (compileTimeline có thể được gọi trong lúc đang edit tại một vị trí thời gian nhất định)
    const currentTime = useEditorStore.getState().currentTime;
    globalGsapTimeline.time(currentTime);
    fabricCanvas.renderAll();
};
