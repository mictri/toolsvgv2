/**
 * color.js — Các hàm tiện ích xử lý màu sắc.
 * Chuyển đổi giữa HEX, RGB, HSL, phân tích độ sáng, tạo màu tương phản.
 */

/**
 * Chuyển HEX string thành RGB object.
 * @example hexToRgb('#6366f1') → { r: 99, g: 102, b: 241 }
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}

/**
 * Chuyển RGB thành HEX string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Tính độ sáng (luminance) của màu. Dùng để chọn màu chữ tương phản.
 */
export function luminance(r: number, g: number, b: number): number {
    const a = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
