# ASCIIFORGE Creative Suite Implementation Plan

## Current Abstraction & UI Pitfalls
1. **WebGL Canvas Lock**: The main viewport canvas was obtaining a `'2d'` context first, which permanently locked the canvas context type, preventing GPU shaders (`webgl2` context) from initializing.
2. **Web Worker Thread Flooding**: Off-thread filters (like Bayer, Floyd, Atkinson, Pixel Sort) were sent every animation frame (60fps) during video playback without throttle gates, causing crashes.
3. **Muted Autoplay Policies**: Modern browsers block unmuted `<video>` or webcam feeds from starting automatically, meaning our video loaders would silent-crash.
4. **Brutalist Clutter**: The layout needs to shift to a gorgeous, glassmorphic, monochromatic B&W creative suite with three discrete control tiers: Simple, Advanced, and Custom.

---

## 🛠️ 3-Agent Brainstorm Solutions

### 1. Architect: WebGL Offscreen & Worker Throttling
* **WebGL Offscreen Pipeline**: Modify `WebGLProcessor` to hold its own private offscreen `<canvas>` context initialized with `'webgl2'`. The main output viewport canvas remains a 2D canvas. We compile and render WebGL effects offscreen, then copy the result onto the main canvas with a highly-optimized `ctx.drawImage` call.
* **Worker Throttle Gate**: Implement a `workerBusyRef = useRef(false)` block in the `App.tsx` render loop. During video/webcam loops, skip posting a new frame if the worker is still processing the previous one. This maintains full UI responsiveness under load.
* **Video Autoplay Fix**: Explicitly force loaded videos and webcam captures to be muted (`video.muted = true`) to bypass browser blocklists, and track playback state reactively.

### 2. Designer: Monochromatic Glassmorphic System
* **Rounded Glassmorphism**: Remove `border-radius: 0 !important` constraints. Replace with smooth `border-radius: 12px` panels, borders, and input fields.
* **Glass Theme**: Frosted translucent panel backgrounds with heavy backdrop blurs (`backdrop-filter: blur(20px)`), delicate B&W glowing white margins, crisp mono fonts, and sleek layout spacing.
* **Monochromatic Accents**: Pure high-contrast white `#ffffff` accents, charcoal overlays, and soft white halos (`box-shadow: 0 0 15px rgba(255, 255, 255, 0.12)`).

### 3. Performance Lead: Resolution Gating & Canvas Re-use
* Ensure offscreen temporary canvases are cached or instantiated once to avoid garbage collection loops.
* Leverage resolution scaling (0.25x - 2.0x) to throttle large frames on the fly.

---

## 📋 Checklist & Chunking Plan

### Chunk 1: Architectural Fixes
- [x] Refactor `WebGLProcessor` in `src/effects/shaderEffects.ts` to use a private offscreen WebGL canvas and return the rendered element.
- [x] Refactor `render` and video loop in `src/App.tsx` to handle the WebGL offscreen copy, worker throttle gate (`workerBusyRef`), and muted autoplay attributes.

### Chunk 2: Three-tiered Modes & Panel Restructuring
- [x] Add `uiMode: 'simple' | 'advanced' | 'custom'` to global state in `src/App.tsx`.
- [x] Restructure `SidebarRight.tsx` with a premium segmented B&W switch: `[ SIMPLE ] [ ADVANCED ] [ CUSTOM ]` and filter panel parameters accordingly.

### Chunk 3: Black-and-White Glassmorphic Redesign
- [x] Rewrite `src/index.css` with a high-end glass theme, rounded corners, soft frosted drop-shadows, and micro-animations.
- [x] Refactor presets, default color values (switch off `#00FF88` green to `#ffffff` / monochromatic palette tones).
