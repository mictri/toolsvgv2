/**
 * Animation types hiện đã được định nghĩa trong editorStore.ts.
 * - AnimatedObject: chứa mảng PropertyTrack[]
 * - PropertyTrack: mỗi track quản lý một thuộc tính (position/scale/rotation/opacity/...)
 * - Keyframe: giá trị + thời gian + easing
 *
 * Actions mới:
 * - addPropertyTrack, removePropertyTrack
 * - addKeyframeToTrack, updateKeyframeInTrack, removeKeyframeFromTrack
 * - toggleTrackEnabled, setAnimatedObjectExpanded
 */
export {};
