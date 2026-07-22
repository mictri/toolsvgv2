# PRO SVG ANIMATOR — Progress Day 1

## Tổng quan

Xây dựng web-based SVG animation editor (giống SVGator.com) bằng **React + TypeScript + Fabric.js 5.3 + GSAP 3.12**.

---

## ✅ Hoàn thành hôm nay

### 1. Sửa lỗi TypeScript & kiến trúc Store

- **Zero TypeScript errors** — toàn bộ dự án build sạch.
- **Zustand Store** (`src/store/editorStore.ts`) chia 3 nhóm rõ ràng:
  - `Canvas` — layers, selectedLayerId
  - `Animation` — isPlaying, currentTime, duration, keyframes, animatedLayerIds
  - `History` — undoStack, redoStack (dual-stack undo/redo)
- **Undo (Ctrl+Z) / Redo (Ctrl+Shift+Z / Ctrl+Y)** — window-level keyboard handlers, snapshot JSON clone.
- Undo/redo chỉ áp dụng cho Canvas layers, **không áp dụng cho keyframe/timeline**.

### 2. Timeline & Playhead

- **Playhead clamping** trong [0, duration] với `playheadPercent = Math.min(100, …)`.
- **Timeline scrub** dùng custom mousedown/mousemove/mouseup trên flex-1 track (không dùng range input).
- **compileTimeline** dùng `gsap.set()` thay vì `targetObj.set()` để không ghi đè canvas editing state.
- Keyframe diamonds có thể kéo thả để thay đổi thời gian.
- Tự động compile lại timeline khi thêm/xóa keyframe.

### 3. Layer & Canvas cơ bản

- **Layer visibility toggle** 👁️ — eye icon bên sidebar trái, đồng bộ với fabric object `visible`.
- **Canvas zoom** — 10%–500%, dùng Ctrl+Wheel + nút −/+ / ↺.
- **Delete layer/keyframe** — phím Delete/Backspace, ưu tiên xóa keyframe trước.
- **Auto-keyframe trên color/stroke** — đã tắt. Người dùng phải bấm ◆ Keyframe thủ công.

### 4. Phase 2: Import / Export

| Tính năng | File | Mô tả |
|-----------|------|-------|
| Import SVG | `src/services/svgParser.ts` | Đọc file SVG → fabric objects + layers |
| Export SVG | `src/services/svgSerializer.ts` | Fabric canvas → string SVG + download |
| Export JSON Project | `src/services/animationExporter.ts` | Layers + keyframes + duration → JSON |

### 5. Phase 3: Editor Tools (gộp cụm + Hand Tool)

#### ToolCluster (`src/editor/toolbar/ToolCluster.tsx`)
- Dropdown button group — mỗi cụm có 1 công cụ mặc định + select option.
- 2 chế độ: `behavior: 'mode'` (bật/tắt, highlight đỏ) và `behavior: 'instant'` (thực thi ngay).

#### Các cụm công cụ trong Canvas toolbar:

| Cụm | Công cụ | Kiểu |
|-----|---------|------|
| **Edit** | Transform ↖, Node ✧, Resize ⤡ | mode |
| **Vector** | Pen ✏️, Pencil ✎, AddNode ⊕, RemoveNode ⊖ | mode |
| **Shape** | Rectangle 🟦, Ellipse ⭕, Polygon ⬡, Star ⭐, Line ➖ | instant |
| **Text** | T Text | instant (nút riêng) |
| **Hand** | ✋ Hand (Pan) | mode (nút riêng) |

#### Hand Tool
- `activeTool === 'hand'`: canvas.selection = false, cursor = grab.
- Kéo thả → cập nhật `viewportTransform[4]` (translateX), `[5]` (translateY).
- Scroll chuột → zoom (không cần Ctrl).
- Phím tắt: `V` → Transform, `H` → Hand, `P` → Pen.

#### Snap Grid
- Nút ⊞ Grid — bật/tắt.
- Pattern background (ô lưới 20px, opacity 0.07).
- `object:moving` snap đến grid point gần nhất.

#### Alignment
- 6 nút: ⇤⇔⇥⇧⇕⇩ (Left/Center/Right/Top/Middle/Bottom).
- Hoạt động với single object và multi-select (activeSelection).

### 6. Sửa lỗi & cải thiện

#### Shape tools không hoạt động lúc đầu
- **Nguyên nhân**: `handleToolSelect` dùng `useCallback` với `[activeTool]`, giữ stale closure của `addShapeToCanvas` (canvas = null).
- **Fix**: Sắp xếp lại thứ tự function + thêm `addShapeToCanvas`, `addTextToCanvas` vào dependency array.

#### Pen Tool
- Click điểm đầu → vẽ **dot tròn** màu xanh (`fabric.Circle` r=3).
- Click điểm tiếp → vẽ **segment line** dạng solid giữa 2 điểm.
- Di chuột → **preview line** dashed từ điểm cuối đến cursor.
- Tất cả helper objects được lưu trong `penHelpers[]`, cleanup khi double-click hoặc Escape.

#### Pencil Tool (vẽ tự do)
- `mouse:down` → bắt đầu ghi điểm.
- `mouse:move` → thêm điểm, vẽ preview, tự động **Ramer-Douglas-Peucker** simplify (tolerance=2px).
- `mouse:up` → simplify lần cuối → chuyển thành **fabric.Path** với cubic bezier (`C` commands).
- Giữ được góc nhọn vừa phải nhờ RDP giữ lại corner points + bezier smoothing.

### 7. Layout — Single Screen (không scroll)

```
┌──────────────────────────────────────────────────┐
│  Header Bar (h-14, shrink-0)                     │
├────────┬──────────────────────────┬──────────────┤
│        │                          │              │
│ Left   │  Canvas Container        │ Right        │
│ Sidebar│  (flex-1, overflow-hidden)│ Sidebar      │
│ (w-64) │                          │ (w-80)       │
│        ├──────────────────────────┤              │
│        │  Timeline (100% width)   │              │
├────────┴──────────────────────────┴──────────────┤
│  (h-screen, flex-col, overflow-hidden)           │
└──────────────────────────────────────────────────┘
```

- `h-screen` thay `min-h-screen` — không scroll toàn trang.
- Canvas nằm trong flex-1, `overflow-hidden`.
- Timeline ở bottom, full width.

### 8. Xóa file

- `src/editor/toolbar/ImageUpload.tsx` — đã xóa (không còn dùng).

---

## Kiến trúc thư mục

```
src/
├── editor/
│   ├── canvas/
│   │   └── Canvas.tsx           # Fabric canvas wrapper + toolbar + tool logic
│   ├── timeline/
│   │   ├── Timeline.tsx          # Multi-track timeline + playhead + keyframe diamonds
│   │   ├── timelineCompiler.ts   # GSAP timeline builder
│   │   └── gsapInstance.ts       # GSAP instance singleton
│   ├── sidebar/
│   │   └── RightSidebar.tsx      # Properties inspector (position, scale, rotation, fill, stroke)
│   ├── toolbar/
│   │   ├── ToolCluster.tsx       # Dropdown button group (generic)
│   │   ├── ShapeSelector.tsx     # (cũ, giữ lại nhưng không dùng trực tiếp)
│   │   ├── PenTool.tsx           # (cũ, giữ lại nhưng không dùng trực tiếp)
│   │   └── TextTool.tsx          # (cũ, giữ lại nhưng không dùng trực tiếp)
│   ├── layers/                   # (stub)
│   ├── properties/               # (stub)
│   └── plugins/                  # (stub)
├── store/
│   └── editorStore.ts            # Zustand store (Canvas / Animation / History)
├── services/
│   ├── svgParser.ts              # Import SVG
│   ├── svgSerializer.ts          # Export SVG
│   └── animationExporter.ts      # Export JSON project
├── App.tsx                       # Layout chính
├── main.tsx                      # Entry point
└── index.css                     # Tailwind imports
```

---

## Trạng thái hiện tại

```
Layer type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'path' | 'svg' | 'text' | 'image'
Keyframe easing: 'none' | 'power2.out' | 'bounce.out' | 'back.out'
Zoom range: 10% – 500%
Grid snap: 20px
Undo/Redo: Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y)
```

---

## Tiếp theo (Day 2)

### Phase 4: Animation nâng cao
- [ ] Easing curve editor (UI để chọn/tuỳ chỉnh easing cho từng keyframe)
- [ ] Morph SVG (chuyển đổi shape này → shape khác)
- [ ] Timeline zoom (thu phóng dải thời gian)
- [ ] Loop options (Play once / Loop / Ping-pong)

### Phase 5: Hoàn thiện
- [ ] Node Tool — chỉnh sửa điểm path trực tiếp trên canvas
- [ ] Resize Tool — resize handles
- [ ] Add/Remove Node — thêm/xóa điểm trên path
- [ ] Export GIF / MP4
- [ ] Presets animation (fade in, slide, bounce, ...)
- [ ] Lưu project vào localStorage

### Cần lưu ý
- Khi thêm effect mới, kiểm tra compileTimeline không dùng `targetObj.set()` (dùng `gsap.set()`).
- Khi thêm state mới, cân nhắc có cần snapshot cho undo/redo không.
- Giữ nguyên cấu trúc thư mục, không ghi đè file cũ — tạo file mới.
