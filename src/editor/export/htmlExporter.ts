export interface ExportOptions {
    format: 'complete' | 'snippet';
    triggerType: 'auto' | 'scroll' | 'hover' | 'click';
    scrollStart?: string;
    loop?: boolean;
    minify?: boolean;
    bgColor?: string;
    width?: number;
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

function injectSvgIds(svgString: string, idMapping: { dataId: string }[]): string {
    let result = svgString;

    result = result.replace(/\sid="(?!fcv-)([^"]+)"/gi, (_, idVal) => ` id="fcv-${idVal}"`);

    for (const m of idMapping) {
        if (!m.dataId) continue;
        const escapedId = m.dataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const alreadyHasId = new RegExp(`<[a-zA-Z]+[^>]*?data-id="${escapedId}"[^>]*?id=`, 'i');
        if (alreadyHasId.test(result)) continue;
        const noIdRegex = new RegExp(
            `(<[a-zA-Z]+[^>]*?data-id="${escapedId}")([^>]*?>)`,
            'g',
        );
        result = result.replace(noIdRegex, '$1 id="fcv-' + m.dataId + '"$2');
    }

    return result;
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

    const lines: string[] = [];
    lines.push(`  <script>`);
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

    // Event handlers for hover/click
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
    idMapping?: { dataId: string }[],
): string {
    let finalSvg = cleanSvg(svgString);
    if (idMapping && idMapping.length > 0) {
        finalSvg = injectSvgIds(finalSvg, idMapping);
    }

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

    // ── Complete HTML ──

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

    // Centered layout (auto, hover, click)
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
      padding: 24px;
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
