export type EffectId =
  // Group 1: ASCII & Text
  | 'ascii-classic'
  | 'ascii-dense'
  | 'ascii-blocks'
  | 'ascii-braille'
  | 'ascii-halfblock'    // NEW — ▀▄ 2× vertical resolution
  | 'ascii-edge'         // NEW — Sobel-aware char picking (/ \ | - +)
  | 'ascii-shade'        // NEW — density-sorted progressive fill charset
  | 'ascii-box'          // NEW — box-drawing contour characters
  | 'ascii-katakana'     // NEW — Japanese katakana luminance map
  | 'ascii-math'         // NEW — mathematical symbol charset
  | 'ascii-binary'       // NEW — binary 0/1 threshold field
  | 'ascii-morse'        // NEW — dot-dash pattern per row
  | 'ascii-emoji'
  | 'ascii-custom'
  | 'ascii-color'
  | 'typewriter'
  // Group 2: Pixel & Halftone
  | 'halftone-dots'
  | 'halftone-lines'
  | 'crosshatch'
  | 'dither-bayer'
  | 'dither-floyd'
  | 'dither-atkinson'
  | 'dither-blue-noise'  // NEW — perceptually uniform stochastic dither
  | 'pixel-sort'
  | 'blockify'
  | 'threshold'
  // Group 3: Artistic
  | 'contour-edges'
  | 'wave-lines'
  | 'voronoi'
  | 'dots-field'
  | 'noise-field'
  | 'vhs-glitch'
  | 'oil-paint'
  | 'kuwahara'           // NEW — painterly GPU kuwahara filter
  | 'stained-glass';

export type EffectGroup = 'ascii' | 'pixel' | 'artistic';

export interface EffectDefinition {
  id: EffectId;
  name: string;
  group: EffectGroup;
  description: string;
}

export type ColorMode = 'mono' | 'original' | 'palette' | 'gradient';

export interface Settings {
  // Global
  resolutionScale: 0.25 | 0.5 | 1.0 | 2.0;
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  gamma: number; // 0.5 to 2.5
  sharpen: number; // 0 to 5
  invert: boolean;
  grayscale: boolean;

  // Accuracy
  aspectCorrection: boolean; // correct char width:height ratio (~0.55)
  useLuminanceLUT: boolean;  // BT.709 + density-sorted character mapping

  // Color Mode
  colorMode: ColorMode;
  monoFg: string; // Hex color
  monoBg: string; // Hex color
  paletteSize: 2 | 4 | 8 | 16;
  gradientStart: string; // Hex color
  gradientEnd: string; // Hex color

  // Chromatic Effects
  chromaticAberration: number; // 0 to 20
  scanlines: number; // 0 to 100
  filmGrain: number; // 0 to 100
  vignette: number; // 0 to 100

  // Animation
  fps: number; // 1 to 60
  loop: boolean;
  reverse: boolean;

  // Effect Specific Parameters
  charset: string; // for custom ascii
  blockSize: number; // blockify/ascii font scale
  thresholdValue: number; // 0 to 255 for threshold/dither
  edgeStrength: number; // 0 to 10 for Sobel/Canny
  sortThreshold: number; // for pixel sorting brightness threshold
  waveCount: number; // for wave lines
  voronoiCells: number; // cell size or count
  noiseScale: number; // for Perlin field
  vhsJitter: number; // for VHS
  paintRadius: number; // oil paint neighbor scale
  dotShape?: 'circle' | 'square' | 'oval' | 'diamond';
  kuwaharaRadius?: number; // for kuwahara filter size
  useCustomColumns?: boolean; // toggle for explicit width columns
  targetColumns?: number; // exact column width (e.g. 20 to 300)
  colorBoost?: number; // color vibrance / lightness boost (0 to 100)
  aspectRatio?: 'original' | '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
}

export interface Preset {
  id: string;
  name: string;
  effectId: EffectId;
  settings: Partial<Settings>;
  isCustom?: boolean;
}

export interface HistoryStep {
  settings: Settings;
  effectId: EffectId;
}

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  result?: string; // base64 or object URL
}
