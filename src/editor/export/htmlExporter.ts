import type { AnimatedObject } from '../../types';
export interface ExportOptions {
    format: 'complete' | 'snippet';
    triggerType: 'auto' | 'scroll' | 'hover' | 'click';
    scrollStart?: string;
    loop?: boolean;
    minify?: boolean;
    bgColor?: string;
    width?: number;
}

/**
 * Bảng ánh xạ ID độc lập cho từng lớp layer
 */
export interface IdMapEntry {
    dataId: string;       // ID gốc của đối tượng (dành cho Position)
    transformId: string;  // Unique ID độc lập cho Transform (Rotate, Scale, Skew)
}

function minifyCode(code: string): string {
    return code
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .replace(/^\s+/gm, '')
        .trim();
}

function cleanSvg(svg: string): string {
    return svg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<desc>[\s\S]*?<\/desc>/gi, '')
        .trim();
}

/**
 * Hàm sinh Unique ID ngắn gọn/độc lập
 */
function generateUniqueId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Tự động chèn ID với tiền tố "fcv-" chuẩn xác cho SVG DOM:
 * - Cấp Cha (Position): id="fcv-{dataId}"
 * - Cấp Transform (Rotate/Scale/Skew): id="fcv-tr-{uniqueId}"
 * - Cấp Inner (Path/Shape): giữ nguyên thẻ con
 */
export function injectSvgIdsAndBuildMap(
    svgString: string,
    idMapping: { dataId: string }[],
    animatedObjects: AnimatedObject[] = []
): { processedSvg: string; idMap: IdMapEntry[] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const resultIdMap: IdMapEntry[] = [];

    for (const m of idMapping) {
        if (!m.dataId) continue;
        const rawId = m.dataId;
        const cleanDataId = rawId.replace(/^fcv-/, '');
        const targetPosId = `fcv-${cleanDataId}`;

        // Tìm element tương ứng trong SVG
        let element = doc.querySelector(`[data-id="${cleanDataId}"]`) || 
                      doc.querySelector(`[data-id="${rawId}"]`) ||
                      doc.querySelector(`[id="${cleanDataId}"]`) ||
                      doc.querySelector(`[id="${rawId}"]`);

        if (element) {
            element.setAttribute('id', targetPosId);
            element.setAttribute('data-id', cleanDataId);

            // Kiểm tra các animation gán vào object này
            const animObj = animatedObjects.find(
                a => (a.id || a.dataId) === cleanDataId || (a.id || a.dataId) === rawId
            );

            // Xác định xem có cần thẻ <g id="fcv-tr-..."> riêng hay không
            // Nếu chỉ có 1 animation (Animate, Morph, Scale, Skew, ...) thì KHÔNG tạo thẻ dư
            // const hasMultipleTransforms = animObj && animObj.tracks && animObj.tracks.length > 1;
            const hasMultipleTransforms = animObj && animObj.tracks && animObj.tracks.length > 1;

if (hasMultipleTransforms) {
    const transformUniqueId = `fcv-tr-${generateUniqueId()}`;
    
    // Tạo thẻ <g id="fcv-tr-...">
    const transformGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('id', transformUniqueId);

    // Chuyển toàn bộ element con vào transformGroup
    while (element.firstChild) {
        transformGroup.appendChild(element.firstChild);
    }
    element.appendChild(transformGroup);

    resultIdMap.push({
        dataId: cleanDataId,
        transformId: transformUniqueId,
    });
} else {
    resultIdMap.push({
        dataId: cleanDataId,
        transformId: targetPosId,
    });
}
        }
    }

    const serializer = new XMLSerializer();
    return {
        processedSvg: serializer.serializeToString(doc.documentElement),
        idMap: resultIdMap,
    };
}

function wrapSvg(svg: string): string {
    const indented = svg.split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');
    return `<div id="animation-svg" class="wrapper">\n  ${indented}\n</div>`;
}

function buildScriptBlock(gsapCode: string, triggerType: string): string {
    const indent = '      ';
    const indentedJs = gsapCode
        .split('\n')
        .map(l => (l ? `${indent}${l}` : ''))
        .join('\n');

    const isScroll = triggerType === 'scroll';
    const hasPositionEffect = gsapCode.includes('createMatrixString');

    const lines: string[] = [];
    lines.push(`  <script>`);

    if (hasPositionEffect) {
        lines.push(`    function createMatrixString(targetSelector, newX, newY) {`);
        lines.push(`      const el = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;`);
        lines.push(`      if (!el) return "";`);
        lines.push(`      const transformAttr = el.getAttribute("transform") || "";`);
        lines.push(`      const match = transformAttr.match(/matrix\\(([^)]+)\\)/);`);
        lines.push(`      if (match) {`);
        lines.push(`        const values = match[1].trim().split(/[\\s,]+/).map(Number);`);
        lines.push(`        const [a, b, c, d] = values;`);
        lines.push(`        return \`matrix(\${a}, \${b}, \${c}, \${d}, \${newX}, \${newY})\`;`);
        lines.push(`      }`);
        lines.push(`      return \`translate(\${newX}, \${newY})\`;`);
        lines.push(`    }`);
        lines.push(``);
    }

    lines.push(`    document.addEventListener("DOMContentLoaded", function () {`);

    if (isScroll) {
        lines.push(`      if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {`);
        lines.push(`        gsap.registerPlugin(ScrollTrigger);`);
    } else {
        lines.push(`      if (typeof gsap !== "undefined") {`);
    }

    lines.push(`        if (typeof MorphSVGPlugin !== "undefined") gsap.registerPlugin(MorphSVGPlugin);`);
    lines.push(``);
    lines.push(indentedJs);

    if (triggerType === 'hover') {
        lines.push(``);
        lines.push(`        const el = document.querySelector("#animation-svg");`);
        lines.push(`        if (el) {`);
        lines.push(`          el.addEventListener("mouseenter", () => tl.play());`);
        lines.push(`          el.addEventListener("mouseleave", () => tl.reverse());`);
        lines.push(`        }`);
    } else if (triggerType === 'click') {
        lines.push(``);
        lines.push(`        const el = document.querySelector("#animation-svg");`);
        lines.push(`        if (el) {`);
        lines.push(`          el.addEventListener("click", () => {`);
        lines.push(`            if (tl.reversed() || tl.progress() === 1) {`);
        lines.push(`              tl.restart();`);
        lines.push(`            } else {`);
        lines.push(`              tl.reversed() ? tl.play() : tl.reverse();`);
        lines.push(`            }`);
        lines.push(`          });`);
        lines.push(`        }`);
    }

    lines.push(`      }`);
    lines.push(`    });`);
    lines.push(`  </script>`);

    return lines.join('\n');
}

export function generateExportHTML(
    svgString: string,
    gsapCode: string,
    options: ExportOptions,
): string {
    let finalSvg = cleanSvg(svgString);
    const wrappedSvg = wrapSvg(finalSvg);
    const processedJs = options.minify ? minifyCode(gsapCode) : gsapCode;
    const scriptBlock = buildScriptBlock(processedJs, options.triggerType);

    const isScroll = options.triggerType === 'scroll';
    const bg = options.bgColor || '#0f172a';

    if (options.format === 'snippet') {
        if (isScroll) {
            return [
                '<div class="spacer" style="height:100vh;display:flex;justify-content:center;align-items:center;text-align:center;font-size:1.2rem;border-bottom:1px dashed #334155;color:#fff;">',
                '  <p>👇 Cuộn chuột xuống dưới để xem hiệu ứng ScrollTrigger</p>',
                '</div>',
                '',
                wrappedSvg,
                '',
                '<div class="spacer" style="height:100vh;display:flex;justify-content:center;align-items:center;text-align:center;font-size:1.2rem;border-bottom:1px dashed #334155;color:#fff;">',
                '  <p>Cuộn tiếp xuống dưới...</p>',
                '</div>',
                '',
                scriptBlock,
            ].join('\n');
        }
        return [wrappedSvg, '', scriptBlock].join('\n');
    }

if (isScroll) {
        // Scroll layout with spacers
        const html = `<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pro SVG Animation Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: ${bg};
      font-family: system-ui, -apple-system, sans-serif;
      color: #fff;
    }
    .spacer {
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      font-size: 1.2rem;
      border-bottom: 1px dashed #334155;
    }
    #animation-svg {
      width: 100%;
      max-width: ${options.width || 800}px;
      padding: 40px 24px;
      margin: 0 auto;
    }
    #animation-svg svg {
      width: 100%;
      height: auto;
      overflow: visible;
      display: block;
      margin: 0 auto;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/ScrollTrigger.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/MorphSVGPlugin.min.js"></script>
</head>
<body>
  <div class="spacer">
    <p>👇 Cuộn chuột xuống dưới để xem hiệu ứng ScrollTrigger</p>
  </div>

  ${wrappedSvg.replace(/\n/g, '\n  ')}

  <div class="spacer">
    <p>Cuộn tiếp xuống dưới...</p>
  </div>

  ${scriptBlock}
</body>
</html>`;

        if (options.minify) {
            return html
                .replace(/\n\s*/g, '')
                .replace(/>\s+</g, '><')
                .replace(/\/\*[\s\S]*?\*\//g, '');
        }
        return html;
    }

    
    const html = `<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pro SVG Animation Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: ${bg};
      font-family: system-ui, -apple-system, sans-serif;
    }
    #animation-svg {
      width: 100%;
      max-width: ${options.width || 800}px;
      background: rgba(0,0,0,0.2);
    }
    #animation-svg svg {
      width: 100%;
      height: auto;
      overflow: visible;
      display: block;
      margin: 0 auto;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/ScrollTrigger.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/MorphSVGPlugin.min.js"></script>
</head>
<body>
  ${wrappedSvg.replace(/\n/g, '\n  ')}

  ${scriptBlock}
</body>
</html>`;

    if (options.minify) {
        return html
            .replace(/\n\s*/g, '')
            .replace(/>\s+</g, '><')
            .replace(/\/\*[\s\S]*?\*\//g, '');
    }
    return html;
}

export function downloadFile(content: string, filename: string, mimeType: string = 'text/html') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}