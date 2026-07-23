# PRO SVG ANIMATOR — Progress Day 3

## ✅ Hoàn thành hôm nay

### 1. Property-Based Animation System (kiến trúc mới)

Thay thế hệ thống keyframes flat cũ (`keyframes: KeyframeNode[]`) bằng per-object, per-property tracks:

| Type | Mô tả |
|------|-------|
| `AnimatableProperty` | 13 property types: `position`, `scale`, `rotate`, `opacity`, `skew`, `morph`, `fillColor`, `fillOpacity`, `strokeColor`, `strokeOpacity`, `strokeWidth`, `strokeOffset`, `strokeDashes` |
| `Keyframe` | `{ id, time, value, easing }` — value là giá trị tương ứng property |
| `PropertyTrack` | `{ property, keyframes[], enabled }` — một track cho một thuộc tính |
| `AnimatedObject` | `{ id, objectName, tracks[], expanded }` — một object có thể có nhiều track |

Store actions mới:
| Action | Mô tả |
|--------|-------|
| `addPropertyTrack(layerId, property)` | Thêm track mới cho object + property |
| `removePropertyTrack(layerId, property)` | Xóa track |
| `toggleTrackEnabled(layerId, property)` | Bật/tắt track |
| `addKeyframeToTrack(layerId, property, time, value, easing?)` | Thêm keyframe vào track |
| `updateKeyframeInTrack(layerId, property, kfId, updates)` | Sửa keyframe |
| `removeKeyframeFromTrack(layerId, property, kfId)` | Xóa keyframe |
| `ensureAnimatedObject(layerId, objectName)` | Tự động tạo AnimatedObject nếu chưa có |

### 2. Timeline Compiler (`src/editor/timeline/timelineCompiler.ts`)

- Viết lại hoàn toàn: duyệt qua `AnimatedObject[]`, mỗi object → mỗi track → mỗi cặp keyframe liên tiếp
- Composite tất cả vào `globalGsapTimeline` duy nhất
- GSAP property mapping cho tất cả 13 property types
- `trackValueToGSAP()` ánh xạ giá trị từ store → GSAP tween vars

### 3. Timeline UI Tree-View (`src/editor/timeline/Timeline.tsx`)

- **Layer rows** — hiển thị object có animation, expand/collapse ▶▼, click để select
- **Property sub-track rows** — lồng bên dưới layer, hiển thị icon + tên property + số keyframe
- **Keyframe diamonds** — hình thoi có thể kéo (drag để thay đổi time), click để chọn
- **Easing editor** — footer hiển thị khi chọn keyframe, 24 easing types kèm SVG preview
- **Per-track Presets** (✨) — dropup menu với preset riêng cho từng loại property:
  - Position: Slide In Left/Right/Up/Down
  - Scale: Pulse/Grow/Shrink
  - Rotate: Spin CW/Spin CCW/Swing
  - Opacity: Fade In/Fade Out/Blink/Pulse
  - Stroke Offset: Draw On/Draw Off

### 4. Global +Animate Button

- **Controls bar** — nút `+ Animate` duy nhất ở góc phải timeline header
- **Disabled** khi không có object nào được chọn (`opacity-50 cursor-not-allowed`)
- **Dropup** (mở lên trên) — danh sách 13 property types
- Click property → tạo sub-track + keyframe đầu/cuối cho object đang chọn

### 5. Auto-Keyframe trong RightSidebar

- `handlePropertyChange()` ở `RightSidebar.tsx` tự động `addKeyframeToTrack` khi user thay đổi giá trị
- Mapping: `angle` → `rotate`, `skewX/Y` → `skew`, `fill` → `fillColor`, `stroke` → `strokeColor`
- `autoKeyframe()` tự tạo track nếu chưa có, sau đó thêm keyframe tại `currentTime`

### 6. Add/Remove Node Tool (hoàn thiện)

- **Cursor feedback**: `crosshair` (add), `not-allowed` trên path segments (remove), `grab` (hover node)
- **Anchor dragging**: kéo điểm → cập nhật path → compile timeline
- **Ghost preview**: preview điểm mới (in đậm) + path preview khi add node
- **Auto-convert**: click vào non-path shape → tự convert sang path (dùng fabric `Path.fromObject`)
- **Escape**: cancel draft, xóa point preview
- **Undo snapshot** + `compileTimeline()` sync sau mỗi commit

### 7. Export System (`src/services/animationExporter.ts`)

- Cập nhật từ `KeyframeNode[]` → `AnimatedObject[]`
- Xuất animated objects + tracks ra JSON

---

## Kiến trúc hiện tại

```
src/
├── editor/
│   ├── canvas/Canvas.tsx               # Canvas + toolbar + Node/Resize tool
│   ├── timeline/
│   │   ├── Timeline.tsx                # Tree-view + +Animate + per-track Presets
│   │   ├── timelineCompiler.ts         # GSAP composite engine
│   │   └── gsapInstance.ts             # GSAP singleton
│   ├── sidebar/RightSidebar.tsx        # Transform Inspector + auto-keyframe
│   ├── toolbar/
│   │   └── ToolCluster.tsx             # Dropdown button group
│   └── ...
├── store/editorStore.ts                # Zustand store (AnimatedObject[])
├── services/
│   ├── svgExporter.ts
│   ├── svgParser.ts
│   └── animationExporter.ts            # Export AnimatedObject[]
├── types/index.ts                      # Re-export types
├── App.tsx
└── main.tsx / index.css
```

---

## Trạng thái hiện tại

```
Property types: 13 (position, scale, rotate, opacity, skew, morph, fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWidth, strokeOffset, strokeDashes)
Animation system: property-based tracks (AnimatedObject[])
Timeline: tree-view with expand/collapse, per-track presets, dropup menus
+Animate: global button (disabled when no selection)
Presets: per-property (Position 4, Scale 3, Rotate 3, Opacity 4, Stroke Offset 2)
Auto-keyframe: RightSidebar → angle/left/top/scaleX/opacity/skew/fill/stroke
Easing: 24 options, SVG preview, popup tại footer
Add/Remove Node: cursor feedback, ghost preview, auto-convert, undo support
Export: JSON (AnimatedObject[] + Keyframes)
Build: tsc + vite build ✅
```

---

## Tiếp theo (Day 4)

### Phase 7: Hoàn thiện Timeline & Rig
- [ ] **Per-track expand/collapse** — Ẩn/hiện keyframe diamonds theo track
- [ ] **Right-click context menu** — Delete track, Delete keyframe, Duplicate
- [ ] **Multi-select keyframes** — Shift+click, batch delete/move
- [ ] **Keyframe snapping** — Snap to grid (0.1s, 0.25s, 0.5s) khi kéo
- [ ] **Ripple edit** — thêm/xóa keyframe → đẩy keyframe sau
- [ ] **Track solo/mute** — Alt+click 👁 để solo track
- [ ] **Color coded tracks** — mỗi property type có màu riêng

### Phase 8: Export & Sharing
- [ ] **Export GIF** — gif.js hoặc MediaRecorder
- [ ] **Export MP4** — MediaRecorder API + wasm muxer
- [ ] **Export CSS animation** — chuyển timeline → @keyframes CSS
- [ ] **Export Lottie** — chuyển AnimatedObject[] → Lottie JSON

### Cần lưu ý
- `applyPropertyPreset()` dùng `currentTime`, không dùng `duration` như `applyPreset` cũ
- Khi thêm property type mới, cần cập nhật:
  1. `AnimatableProperty` type union
  2. `PROPERTY_TYPES`, `PROPERTY_LABELS`, `PROPERTY_ICONS` constants
  3. `PROPERTY_PRESETS` (nếu có presets)
  4. `trackValueToGSAP()` trong `timelineCompiler.ts`
  5. `handleAddProperty()` switch-case trong `Timeline.tsx`
  6. `autoKeyframe()` mapping trong `RightSidebar.tsx`
- MorphSVG cần GSAP plugin riêng; track morph hiện tại là inert
- `fillOpacity`/`strokeOpacity` dùng fabric property trực tiếp
