# PRO SVG ANIMATOR — Progress Day 2

## ✅ Hoàn thành hôm nay

### 1. Store mở rộng (`src/store/editorStore.ts`)

| State mới | Kiểu | Mô tả |
|-----------|------|-------|
| `loopMode` | `'none' \| 'loop' \| 'pingpong'` | Chế độ phát lại |
| `timelineZoom` | `number` (20–500) | % thu phóng timeline |
| `duration` | `number` | Có thể chỉnh từ UI |

| Action mới | Mô tả |
|------------|-------|
| `setDuration(s)` | Đặt tổng thời gian (1–60s) |
| `setLoopMode(mode)` | Đổi chế độ phát lại |
| `setTimelineZoom(z)` | Zoom timeline |
| `updateKeyframeEasing(id, easing)` | Đổi easing của keyframe |
| `applyPreset(id, layerId, fabricCanvas)` | Áp dụng animation preset |
| `saveToStorage()` | Lưu project vào localStorage |
| `loadFromStorage()` | Tải project từ localStorage |

### 2. Easing Curve Editor

- **`EASING_OPTIONS`** — danh sách 24 easing types chia 4 nhóm (Linear, Power, Bounce & Elastic, Smooth), mỗi item kèm đường cong SVG để preview trực quan.
- **Easing Picker** — nằm ở footer của Timeline, hiển thị khi chọn 1 keyframe.
  - Button hiện tại hiển thị **mini SVG curve** + tên easing.
  - Click → popup danh sách easing kèm preview curve.
  - Chọn → cập nhật easing ngay + compile lại timeline.
- **`updateKeyframeEasing(id, easing)`** — action mới trong store.

### 3. Timeline Zoom

- **Zoom controls** — nút −/+ ở timeline header, cạnh duration input.
- **`timelineZoom`** state (20%–500%), scale áp dụng lên ruler + track rows qua CSS `zoom`.
- Time markers được tính động dựa trên duration.

### 4. Loop Options

- **3 nút toggle** trong timeline controls:
  - `▶1` — Play Once (mặc định)
  - `🔁` — Loop (quay lại 0s khi kết thúc)
  - `🔃` — Ping Pong (reverse khi đến cuối, play khi về 0)
- Logic trong `updatePlayhead()` xử lý cả 3 chế độ.

### 5. Animation Presets

- **8 presets** trong RightSidebar (dropdown ở đầu panel):
  - `fadeIn`, `fadeOut`, `slideInLeft`, `slideInRight`, `slideInUp`
  - `bounceIn`, `rotateIn`, `pulse`
- Mỗi preset tự động tạo keyframes tương ứng cho layer đang chọn.
- Hoạt động với layer chưa có animation (tự thêm vào animatedLayerIds).

### 6. Node Tool

- **`activeTool === 'node'`** — click chọn path object (Polygon/Polyline).
- Hiển thị **circle handles** (`fabric.Circle` r=4, màu indigo + viền trắng) tại mỗi điểm.
- **Drag handle** → cập nhật tọa độ điểm + `poly.setCoords()`.
- Cleanup handles khi chọn object khác hoặc thoát Node mode.
- Phím tắt: `N` → Node tool.

### 7. Resize Tool

- **`activeTool === 'resize'`** — cursor thành 'move'.
- Cho phép resize object bằng fabric handles mặc định (uniform scaling).
- Phím tắt: chọn từ Edit cluster dropdown.

### 8. localStorage Auto-save/Load

- **Auto-save** trong Timeline — `useEffect` chạy mỗi khi `[layers, keyframes, duration, loopMode]` thay đổi, lưu toàn bộ state (trừ undo/redo stacks) vào `localStorage` key `'pro-svg-animator-project'`.
- **Auto-load** trong App.tsx — `loadFromStorage()` gọi khi component mount.
- Dữ liệu được khôi phục: layers, keyframes, duration, loopMode, animatedLayerIds.

### 9. Morph SVG (nền tảng)

- Các hàm path utility trong Canvas.tsx:
  - `simplifyPath(points, tolerance)` — Ramer-Douglas-Peucker.
  - `pointsToSvgPath(pts)` — chuyển points → SVG path data với cubic bezier.
  - `resamplePath(pts, n)` — tái lấy mẫu path thành n điểm đều.
  - `interpolatePaths(from, to, t)` — nội suy giữa 2 path.
- Có thể mở rộng để tạo morph keyframe chính thức trong Phase 4.

---

## Kiến trúc hiện tại

```
src/
├── editor/
│   ├── canvas/Canvas.tsx           # Canvas + toolbar + Node/Resize tool
│   ├── timeline/
│   │   ├── Timeline.tsx            # Timeline + zoom + loop + easing editor
│   │   ├── timelineCompiler.ts     # GSAP builder
│   │   └── gsapInstance.ts         # GSAP singleton
│   ├── sidebar/RightSidebar.tsx    # Properties + Presets
│   ├── toolbar/
│   │   ├── ToolCluster.tsx         # Dropdown button group
│   │   └── ... (các stub cũ)
│   └── ... (stubs)
├── store/editorStore.ts            # Zustand store mở rộng
├── services/                       # Import/Export SVG + JSON
├── App.tsx                         # Layout + localStorage load
└── main.tsx / index.css
```

---

## Trạng thái hiện tại

```
Easing types: 24 options (Linear, Power 1-4, Bounce, Back, Elastic, Sine, Circ, Expo)
Loop modes: none | loop | pingpong
Timeline zoom: 20% – 500%
Node tool: drag path points (Polygon/Polyline)
Animation presets: 8 presets (fade, slide, bounce, rotate, pulse)
localStorage: auto-save/load project
Keyframe easing: editor visible khi chọn keyframe
```

---

## Tiếp theo (Day 3)

### Phase 6: Hoàn thiện & Nâng cao
- [ ] **Export GIF/MP4** — sử dụng gif.js hoặc MediaRecorder API
- [ ] **Add/Remove Node** — thêm/xóa điểm trên path từ Vector cluster
- [ ] **Morph SVG chính thức** — tạo keyframe morph giữa 2 shape
- [ ] **Path editing** — chuyển đổi Line ↔ Curve trên Node tool
- [ ] **Timeline right-click menu** — xóa keyframe, copy/paste
- [ ] **Multi-select keyframes** — Shift+click để chọn nhiều keyframe
- [ ] **Easing custom curve** — cho phép vẽ cubic-bezier tùy chỉnh
- [ ] **Responsive layout** — các sidebar có thể kéo co

### Cần lưu ý
- Khi thêm effect mới, kiểm tra compileTimeline không dùng `targetObj.set()`.
- Khi thêm state mới, cân nhắc có cần snapshot cho undo/redo không.
- localStorage saveToStorage() đã được tích hợp sẵn trong store.
- Easing options có thể mở rộng bằng cách thêm vào `EASING_OPTIONS` array.
