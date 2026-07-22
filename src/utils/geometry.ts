/**
 * geometry.js — Các hàm tiện ích hình học.
 * Tính toán khoảng cách, góc, bounding box, snap-to-grid.
 */

/** Điểm 2D */
export interface Point {
    x: number;
    y: number;
}

/** Hình chữ nhật */
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Tính khoảng cách giữa 2 điểm.
 */
export function distance(a: Point, b: Point): number {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Tính góc (radians) giữa 2 điểm.
 */
export function angle(a: Point, b: Point): number {
    return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Snap giá trị tới grid.
 * @param value Giá trị cần snap
 * @param gridSize Kích thước grid (mặc định 10px)
 */
export function snapToGrid(value: number, gridSize = 10): number {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Kiểm tra 2 hình chữ nhật có giao nhau không.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
    return !(a.left + a.width < b.left || b.left + b.width < a.left ||
        a.top + a.height < b.top || b.top + b.height < a.top);
}
