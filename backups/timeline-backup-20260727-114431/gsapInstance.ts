import gsap from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';

gsap.registerPlugin(MorphSVGPlugin);

// Khởi tạo thực thể duy nhất tại đây để bóc tách luồng dữ liệu
export const globalGsapTimeline = gsap.timeline({ paused: true });