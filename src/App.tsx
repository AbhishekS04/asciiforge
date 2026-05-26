import { useState, useEffect, useRef, useCallback } from 'react';
import { EffectId, Settings, Preset, HistoryStep } from './types';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { WorkspaceCenter } from './components/WorkspaceCenter';
import { ShortcutsModal, BatchProcessModal } from './components/Modals';
import { WebGLProcessor } from './effects/shaderEffects';
import {
  CHARSETS, mapLuminanceToChar, getBrailleChar,
  luma709
} from './effects/cpuEffects';

const lerpColor = (c1: string, c2: string, f: number) => {
  const hex1 = c1.startsWith('#') ? c1 : '#ffffff';
  const hex2 = c2.startsWith('#') ? c2 : '#000000';
  const r1 = parseInt(hex1.slice(1, 3), 16) || 255;
  const g1 = parseInt(hex1.slice(3, 5), 16) || 255;
  const b1 = parseInt(hex1.slice(5, 7), 16) || 255;
  const r2 = parseInt(hex2.slice(1, 3), 16) || 0;
  const g2 = parseInt(hex2.slice(3, 5), 16) || 0;
  const b2 = parseInt(hex2.slice(5, 7), 16) || 0;
  const r = Math.round(r1 + (r2 - r1) * f);
  const g = Math.round(g1 + (g2 - g1) * f);
  const b = Math.round(b1 + (b2 - b1) * f);
  return `rgb(${r},${g},${b})`;
};

const getPaletteColor = (r: number, g: number, b: number, size: number) => {
  const steps = size === 2 ? 1 : size === 4 ? 3 : size === 8 ? 7 : 15;
  const qr = Math.round(r / 255 * steps) * (255 / steps);
  const qg = Math.round(g / 255 * steps) * (255 / steps);
  const qb = Math.round(b / 255 * steps) * (255 / steps);
  return `rgb(${qr},${qg},${qb})`;
};

const boostColorVibrance = (r: number, g: number, b: number, boostAmount: number) => {
  if (boostAmount <= 0) return { r, g, b };
  
  const factor = boostAmount / 100; // 0.0 to 1.0
  
  // Convert to HSL
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break;
      case gf: h = (bf - rf) / d + 2; break;
      case bf: h = (rf - gf) / d + 4; break;
    }
    h /= 6;
  }
  
  // 1. SATURATION VIBRANCE: Boost lower-saturated colors more to balance the image without over-saturating
  const satBoost = factor * (1.0 - s);
  s = Math.min(1.0, s + satBoost * 1.5);
  
  // 2. LIGHTNESS GAMMA COMPENSATOR: monospaced characters lose ~50-70% light due to character boundaries
  // A non-linear midtone lift preserves the dark details while making active pixels significantly brighter!
  if (l > 0.05) {
    l = Math.pow(l, 1.0 - (factor * 0.45));
  }
  
  // HSL to RGB conversion
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let rResult = l, gResult = l, bResult = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rResult = hue2rgb(p, q, h + 1/3);
    gResult = hue2rgb(p, q, h);
    bResult = hue2rgb(p, q, h - 1/3);
  }
  
  // 3. COLOR POP ENHANCEMENT: Increase contrast of channels against average luminance to avoid dull wash out
  let br = Math.round(rResult * 255);
  let bg = Math.round(gResult * 255);
  let bb = Math.round(bResult * 255);
  
  // Apply dynamic channel pop
  const lumaVal = 0.299 * br + 0.587 * bg + 0.114 * bb;
  br = Math.min(255, Math.max(0, br + (br - lumaVal) * factor * 0.4));
  bg = Math.min(255, Math.max(0, bg + (bg - lumaVal) * factor * 0.4));
  bb = Math.min(255, Math.max(0, bb + (bb - lumaVal) * factor * 0.4));
  
  // Boost overall brightness to counter text fill blackness loss
  const extraLuminance = factor * 30;
  br = Math.min(255, br + extraLuminance);
  bg = Math.min(255, bg + extraLuminance);
  bb = Math.min(255, bb + extraLuminance);
  
  return {
    r: Math.round(br),
    g: Math.round(bg),
    b: Math.round(bb)
  };
};

const INITIAL_SETTINGS: Settings = {
  resolutionScale: 1.0,
  brightness: 15,
  contrast: 15,
  gamma: 1.0,
  sharpen: 0.0,
  invert: false,
  grayscale: false,
  // Accuracy improvements (on by default)
  aspectCorrection: true,
  useLuminanceLUT: true,
  colorMode: 'original',
  monoFg: '#ffffff',
  monoBg: '#09090b',
  paletteSize: 4,
  gradientStart: '#ffffff',
  gradientEnd: '#000000',
  chromaticAberration: 0,
  scanlines: 0,
  filmGrain: 0,
  vignette: 0,
  fps: 30,
  loop: true,
  reverse: false,
  charset: ' .:-=+*#%@',
  blockSize: 8,
  thresholdValue: 128,
  edgeStrength: 2.0,
  sortThreshold: 100,
  waveCount: 40,
  voronoiCells: 300,
  noiseScale: 100,
  vhsJitter: 1.0,
  paintRadius: 3,
  dotShape: 'circle',
  kuwaharaRadius: 4,
  useCustomColumns: false,
  targetColumns: 80,
  colorBoost: 35,
  aspectRatio: 'original'
};

export default function App() {
  const [activeEffect, setActiveEffect] = useState<EffectId>('ascii-classic');
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  
  // Media States
  const [webcamActive, setWebcamActive] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareOffset, setCompareOffset] = useState(50);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exportFps, setExportFps] = useState<number>(30);
  const [detectedAspect, setDetectedAspect] = useState<string>('original');
  const detectedAspectRef = useRef<string>('original');

  // Custom Presets State
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);

  // History State
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Modal States
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // Panels Collapsed States
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Mobile detection — collapse both sidebars on small screens by default
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
    };
    handler(mq); // run once
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  // UI Simplicity Tier Mode
  const [uiMode, setUiMode] = useState<'simple' | 'advanced' | 'custom'>('simple');

  // Text Outputs
  const [textOutput, setTextOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Video Recording States
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // Offline Video Rendering Progress State
  const [renderingVideoProgress, setRenderingVideoProgress] = useState<{ active: boolean; currentFrame: number; totalFrames: number; renderedFrames: number; currentTime?: number; duration?: number } | null>(null);
  const renderingVideoProgressRef = useRef<{ active: boolean } | null>(null);

  // References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenImageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const webglProcessorRef = useRef<WebGLProcessor | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false);
  const isExportingRef = useRef<boolean>(false);

  // Local state reference to bypass rendering cycle closure lags
  const settingsRef = useRef<Settings>(settings);
  const activeEffectRef = useRef<EffectId>(activeEffect);
  const compareOffsetRef = useRef<number>(compareOffset);
  settingsRef.current = settings;
  activeEffectRef.current = activeEffect;
  compareOffsetRef.current = compareOffset;

  // Video Recording Timer Hook
  useEffect(() => {
    let intervalId: any;
    if (recording) {
      intervalId = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [recording]);

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/effectWorker.ts', import.meta.url), {
      type: 'module'
    });

    // Load custom presets
    const saved = localStorage.getItem('asciiforge_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to load presets', err);
      }
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Set theme data attribute on body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Main rendering engine
  // Main rendering engine
  const render = useCallback(() => {
    return new Promise<void>(async (resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve();
        return;
      }

      let source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null = null;

      if (webcamActive && videoRef.current && videoRef.current.readyState >= 2) {
        source = videoRef.current;
      } else if (videoRef.current && videoRef.current.src && videoRef.current.readyState >= 2) {
        source = videoRef.current;
      } else if (originalImage && offscreenImageRef.current && offscreenImageRef.current.complete) {
        source = offscreenImageRef.current;
      }

      if (!source) {
        resolve();
        return;
      }

      const currentSettings = settingsRef.current;
      const currentEffect = activeEffectRef.current;

      // Standard viewport dimensions
      let sourceWidth = (source as any).videoWidth || (source as any).naturalWidth || source.width || 600;
      let sourceHeight = (source as any).videoHeight || (source as any).naturalHeight || source.height || 400;

      // Auto-detect Aspect Ratio to display in the UI
      if (sourceWidth && sourceHeight) {
        const ratio = sourceWidth / sourceHeight;
        let detected = 'original';
        if (Math.abs(ratio - 16/9) < 0.05) detected = '16:9';
        else if (Math.abs(ratio - 9/16) < 0.05) detected = '9:16';
        else if (Math.abs(ratio - 1/1) < 0.05) detected = '1:1';
        else if (Math.abs(ratio - 4/3) < 0.05) detected = '4:3';
        else if (Math.abs(ratio - 21/9) < 0.05) detected = '21:9';
        else {
          detected = `${sourceWidth}:${sourceHeight}`;
        }
        if (detectedAspectRef.current !== detected) {
          detectedAspectRef.current = detected;
          setDetectedAspect(detected);
        }
      }

      // Process custom Aspect Ratio cropping if requested
      const selectedAspect = currentSettings.aspectRatio || 'original';
      let finalSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = source;
      if (selectedAspect !== 'original') {
        let targetRatio = 1.0;
        if (selectedAspect === '16:9') targetRatio = 16 / 9;
        else if (selectedAspect === '9:16') targetRatio = 9 / 16;
        else if (selectedAspect === '1:1') targetRatio = 1.0;
        else if (selectedAspect === '4:3') targetRatio = 4 / 3;
        else if (selectedAspect === '21:9') targetRatio = 21 / 9;

        let sw = sourceWidth;
        let sh = sourceHeight;
        let sx = 0;
        let sy = 0;

        const currentRatio = sourceWidth / sourceHeight;
        if (currentRatio > targetRatio) {
          // Source is wider than target -> crop left/right
          sw = sourceHeight * targetRatio;
          sx = (sourceWidth - sw) / 2;
        } else {
          // Source is taller than target -> crop top/bottom
          sh = sourceWidth / targetRatio;
          sy = (sourceHeight - sh) / 2;
        }

        // Draw crop area onto an offscreen canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = sw;
        cropCanvas.height = sh;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
          finalSource = cropCanvas;
          sourceWidth = sw;
          sourceHeight = sh;
        }
      }
      source = finalSource;

      // Resolution downscaling
      const renderWidth = Math.floor(sourceWidth * currentSettings.resolutionScale);
      const renderHeight = Math.floor(sourceHeight * currentSettings.resolutionScale);

      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve();
        return;
      }

      // High performance split comparison drawing helper
      const drawComparisonSplit = (targetCtx: CanvasRenderingContext2D) => {
        if (isExportingRef.current) return;
        if (!compareMode) return;
        const currentCompareOffset = compareOffsetRef.current;
        const splitX = (currentCompareOffset / 100) * renderWidth;
        const sourceCropWidth = (currentCompareOffset / 100) * sourceWidth;
        
        targetCtx.save();
        if (sourceCropWidth > 0 && splitX > 0) {
          targetCtx.drawImage(
            source!,
            0, 0, sourceCropWidth, sourceHeight,
            0, 0, splitX, renderHeight
          );
        }
        
        // Draw subtle vertical demarcation line
        targetCtx.strokeStyle = '#ffffff';
        targetCtx.lineWidth = 1.5;
        targetCtx.beginPath();
        targetCtx.moveTo(splitX, 0);
        targetCtx.lineTo(splitX, renderHeight);
        targetCtx.stroke();
        targetCtx.restore();
      };

      // Group 1: WebGL GPU Shaders
      const isGPU = [
        'halftone-dots', 'halftone-lines', 'crosshatch', 'contour-edges',
        'vhs-glitch', 'stained-glass', 'kuwahara'
      ].includes(currentEffect);

      if (isGPU) {
        try {
          setIsProcessing(true);
          if (!webglProcessorRef.current) {
            webglProcessorRef.current = new WebGLProcessor();
          }
          const offscreenWebGL = webglProcessorRef.current.process(
            source,
            currentSettings,
            currentEffect,
            performance.now() / 1000,
            isExportingRef.current || recording
          );
          ctx.drawImage(offscreenWebGL, 0, 0);
          drawComparisonSplit(ctx);
          resolve();
        } catch (err) {
          console.error('WebGL Process Error', err);
          reject(err);
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      // Group 2: ASCII Character Grid Rendering (2D Canvas Drawing)
      const isASCII = [
        'ascii-classic', 'ascii-dense', 'ascii-blocks', 'ascii-braille',
        'ascii-emoji', 'ascii-custom', 'ascii-color', 'typewriter',
        // New styles
        'ascii-shade', 'ascii-halfblock', 'ascii-edge', 'ascii-box',
        'ascii-katakana', 'ascii-math', 'ascii-binary', 'ascii-morse'
      ].includes(currentEffect);

      if (isASCII) {
        setIsProcessing(true);
        const useCustom = !!currentSettings.useCustomColumns;
        const targetCols = currentSettings.targetColumns || 80;
        const cols = useCustom 
          ? Math.max(10, targetCols) 
          : Math.max(10, Math.floor(renderWidth / currentSettings.blockSize));
        
        const blockSize = useCustom ? (renderWidth / cols) : currentSettings.blockSize;
        const rows = useCustom
          ? Math.max(10, Math.round(renderHeight / blockSize))
          : Math.max(10, Math.floor(renderHeight / currentSettings.blockSize));

        // For halfblock we need 2× vertical resolution
        const srcH = currentEffect === 'ascii-halfblock' ? rows * 2 : rows;


        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cols;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          // Draw source at correct aspect — stretch horizontally by 1/aspectW
          tempCtx.drawImage(source, 0, 0, cols, srcH);
          const imgData = tempCtx.getImageData(0, 0, cols, srcH);
          const pixels = imgData.data;

          // Apply brightness/contrast/gamma pre-adjustments off-screen with video export dynamic range compensation
          const isCompensated = isExportingRef.current || recording;
          const exportContrastComp = isCompensated ? 1.15 : 1.0;
          const exportBrightnessComp = isCompensated ? 10.0 : 0.0;
          
          const brightness = (currentSettings.brightness / 100 * 255) + exportBrightnessComp;
          const contrast = (1.0 + (currentSettings.contrast / 100)) * exportContrastComp;
          const gamma = isCompensated ? (currentSettings.gamma || 1.0) * 0.90 : (currentSettings.gamma || 1.0);
          const invGamma = 1.0 / gamma;
          
          for (let i = 0; i < pixels.length; i += 4) {
            let rVal = (pixels[i] + brightness - 128) * contrast + 128;
            let gVal = (pixels[i+1] + brightness - 128) * contrast + 128;
            let bVal = (pixels[i+2] + brightness - 128) * contrast + 128;
            
            rVal = Math.min(255, Math.max(0, rVal));
            gVal = Math.min(255, Math.max(0, gVal));
            bVal = Math.min(255, Math.max(0, bVal));
            
            if (gamma !== 1.0) {
              rVal = Math.pow(rVal / 255, invGamma) * 255;
              gVal = Math.pow(gVal / 255, invGamma) * 255;
              bVal = Math.pow(bVal / 255, invGamma) * 255;
            }
            
            pixels[i]   = Math.min(255, Math.max(0, rVal));
            pixels[i+1] = Math.min(255, Math.max(0, gVal));
            pixels[i+2] = Math.min(255, Math.max(0, bVal));
          }

          // Apply high-performance 3x3 convolution edge sharpen filter
          const sharpenAmount = currentSettings.sharpen || 0;
          if (sharpenAmount > 0) {
            const original = new Uint8ClampedArray(pixels);
            const w = cols;
            const h = srcH;
            
            for (let y = 1; y < h - 1; y++) {
              for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                for (let c = 0; c < 3; c++) {
                  const val = original[idx + c];
                  const top  = original[((y - 1) * w + x) * 4 + c];
                  const bot  = original[((y + 1) * w + x) * 4 + c];
                  const left = original[(y * w + (x - 1)) * 4 + c];
                  const right = original[(y * w + (x + 1)) * 4 + c];
                  
                  const sharpened = val + sharpenAmount * (4 * val - top - bot - left - right);
                  pixels[idx + c] = Math.min(255, Math.max(0, sharpened));
                }
              }
            }
          }

          let charset = CHARSETS.classic;
          if (currentEffect === 'ascii-dense') charset = CHARSETS.dense;
          else if (currentEffect === 'ascii-blocks') charset = CHARSETS.blocks;
          else if (currentEffect === 'ascii-custom') charset = currentSettings.charset || ' .:-=+*#%@';

          let compiledText = '';
          
          // Fill canvas background
          ctx.fillStyle = currentSettings.colorMode === 'mono' ? currentSettings.monoBg : '#000000';
          ctx.fillRect(0, 0, renderWidth, renderHeight);

          ctx.font = `bold ${blockSize}px 'Courier Prime', 'JetBrains Mono', monospace`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          let lastStyle = '';
          
          if (currentSettings.colorMode === 'mono') {
            ctx.fillStyle = currentSettings.monoFg;
            lastStyle = currentSettings.monoFg;
          }

          for (let y = 0; y < rows; y++) {
            let line = '';
            
            if (currentSettings.colorMode === 'gradient') {
              const gradStyle = lerpColor(currentSettings.gradientStart, currentSettings.gradientEnd, y / (rows - 1 || 1));
              ctx.fillStyle = gradStyle;
              lastStyle = gradStyle;
            }

            for (let x = 0; x < cols; x++) {
              const idx = (y * cols + x) * 4;
              let r = pixels[idx];
              let g = pixels[idx+1];
              let b = pixels[idx+2];
              
              let activeBoost = currentSettings.colorBoost || 0;
              if (isCompensated) {
                activeBoost = Math.max(25, Math.min(100, activeBoost + 25));
              }
              if (activeBoost > 0) {
                const boosted = boostColorVibrance(r, g, b, activeBoost);
                r = boosted.r;
                g = boosted.g;
                b = boosted.b;
              }
              
              const luma = 0.299 * r + 0.587 * g + 0.114 * b;

              // Character choosing based on currentEffect
              let charStr = ' ';
              if (currentEffect === 'ascii-classic') {
                charStr = mapLuminanceToChar(luma, CHARSETS.classic);
              } else if (currentEffect === 'ascii-dense') {
                charStr = mapLuminanceToChar(luma, CHARSETS.dense);
              } else if (currentEffect === 'ascii-blocks') {
                charStr = mapLuminanceToChar(luma, CHARSETS.blocks);
              } else if (currentEffect === 'ascii-custom') {
                charStr = mapLuminanceToChar(luma, currentSettings.charset || ' .:-=+*#%@');
              } else if (currentEffect === 'ascii-emoji') {
                const emojiIndex = Math.floor((luma / 255) * (CHARSETS.emojis.length - 1));
                charStr = CHARSETS.emojis[emojiIndex] || '🌑';
              } else if (currentEffect === 'ascii-braille') {
                const sampleDot = (dx: number, dy: number): boolean => {
                  const nx = Math.min(cols - 1, Math.max(0, Math.round(x + dx * 0.4)));
                  const ny = Math.min(srcH - 1, Math.max(0, Math.round(y - 1.5 + dy * 0.8)));
                  const ni = (ny * cols + nx) * 4;
                  const nl = luma709(pixels[ni], pixels[ni+1], pixels[ni+2]);
                  return nl > currentSettings.thresholdValue;
                };
                charStr = getBrailleChar([
                  [sampleDot(0,0), sampleDot(0,1), sampleDot(0,2), sampleDot(0,3)],
                  [sampleDot(1,0), sampleDot(1,1), sampleDot(1,2), sampleDot(1,3)]
                ]);
              } else if (currentEffect === 'ascii-halfblock') {
                const idxT = ((y * 2) * cols + x) * 4;
                const idxB = ((y * 2 + 1) * cols + x) * 4;
                const topOn = luma709(pixels[idxT], pixels[idxT+1], pixels[idxT+2]) > currentSettings.thresholdValue;
                const botOn = luma709(pixels[idxB], pixels[idxB+1], pixels[idxB+2]) > currentSettings.thresholdValue;
                charStr = (topOn && botOn) ? '█' : topOn ? '▀' : botOn ? '▄' : ' ';
              } else if (currentEffect === 'ascii-shade') {
                const SHADE_DENSITY = [0, 8, 28, 52, 80, 108, 135, 162, 188, 210, 232, 248, 255];
                let sIdx = 0;
                while (sIdx < SHADE_DENSITY.length - 1 && luma > SHADE_DENSITY[sIdx + 1]) {
                  sIdx++;
                }
                charStr = CHARSETS.shade[sIdx] || ' ';
              } else if (currentEffect === 'ascii-katakana') {
                charStr = mapLuminanceToChar(luma, CHARSETS.katakana);
              } else if (currentEffect === 'ascii-math') {
                charStr = mapLuminanceToChar(luma, CHARSETS.math);
              } else if (currentEffect === 'ascii-binary') {
                charStr = luma > currentSettings.thresholdValue ? '1' : '0';
              } else if (currentEffect === 'ascii-morse') {
                charStr = luma < 60 ? ' ' : luma < 160 ? '·' : '-';
              } else if (currentEffect === 'ascii-edge') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < currentSettings.thresholdValue * 0.8) {
                  charStr = lm(x, y) > currentSettings.thresholdValue ? '·' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '─';
                  else if (angle < 67.5) charStr = '/';
                  else if (angle < 112.5) charStr = '│';
                  else charStr = '\\';
                }
              } else if (currentEffect === 'ascii-box') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < currentSettings.thresholdValue * 0.7) {
                  const base = lm(x, y);
                  charStr = base > 200 ? '█' : base > 130 ? '▓' : base > 70 ? '▒' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '═';
                  else if (angle < 67.5) charStr = '╝';
                  else if (angle < 112.5) charStr = '║';
                  else charStr = '╚';
                }
              } else {
                charStr = mapLuminanceToChar(luma, charset);
              }
              
              line += charStr;

              // Only render non-empty characters on the canvas
              if (charStr !== ' ' && charStr !== ' ') {
                if (currentSettings.colorMode === 'original') {
                  const style = `rgb(${r},${g},${b})`;
                  if (style !== lastStyle) {
                    ctx.fillStyle = style;
                    lastStyle = style;
                  }
                } else if (currentSettings.colorMode === 'palette') {
                  const style = getPaletteColor(r, g, b, currentSettings.paletteSize);
                  if (style !== lastStyle) {
                    ctx.fillStyle = style;
                    lastStyle = style;
                  }
                }

                ctx.fillText(charStr, x * blockSize, y * blockSize);
              }
            }
            compiledText += line + '\n';
          }

          setTextOutput(compiledText);
          drawComparisonSplit(ctx);
        }
        setIsProcessing(false);
        resolve();
        return;
      }

      // Group 3: Off-thread Worker CPU Filters
      if (workerRef.current) {
        if (workerBusyRef.current) {
          resolve();
          return;
        }
        workerBusyRef.current = true;
        setIsProcessing(true);

        // Grab direct frames from canvas
        ctx.drawImage(source, 0, 0, renderWidth, renderHeight);
        const imgData = ctx.getImageData(0, 0, renderWidth, renderHeight);
        const buffer = imgData.data.buffer;

        // Transferable postMessage
        workerRef.current.postMessage({
          id: Date.now(),
          buffer,
          width: renderWidth,
          height: renderHeight,
          settings: currentSettings,
          effectId: currentEffect
        }, [buffer]);

        workerRef.current.onmessage = (e: MessageEvent) => {
          workerBusyRef.current = false;
          const { success, buffer: resultBuffer, error } = e.data;
          if (success && resultBuffer) {
            const resultData = new Uint8ClampedArray(resultBuffer);

            // ── Apply color mode remapping AFTER worker returns ─────────────
            // Worker returns raw pixel data (often B&W). Remap to selected color mode.
            const cMode = currentSettings.colorMode;
            if (cMode === 'mono') {
              // Parse mono colors once
              const fgHex = currentSettings.monoFg.replace('#', '');
              const bgHex = currentSettings.monoBg.replace('#', '');
              const fgR = parseInt(fgHex.slice(0,2),16)||255;
              const fgG = parseInt(fgHex.slice(2,4),16)||255;
              const fgB = parseInt(fgHex.slice(4,6),16)||255;
              const bgR = parseInt(bgHex.slice(0,2),16)||9;
              const bgG = parseInt(bgHex.slice(2,4),16)||9;
              const bgB = parseInt(bgHex.slice(4,6),16)||11;
              for (let i = 0; i < resultData.length; i += 4) {
                const luma = 0.299*resultData[i] + 0.587*resultData[i+1] + 0.114*resultData[i+2];
                const t = luma / 255;
                resultData[i]   = Math.round(bgR + (fgR - bgR) * t);
                resultData[i+1] = Math.round(bgG + (fgG - bgG) * t);
                resultData[i+2] = Math.round(bgB + (fgB - bgB) * t);
              }
            } else if (cMode === 'gradient') {
              const gs = currentSettings.gradientStart.replace('#','');
              const ge = currentSettings.gradientEnd.replace('#','');
              const gsR = parseInt(gs.slice(0,2),16)||255, gsG = parseInt(gs.slice(2,4),16)||255, gsB = parseInt(gs.slice(4,6),16)||255;
              const geR = parseInt(ge.slice(0,2),16)||0,   geG = parseInt(ge.slice(2,4),16)||0,   geB = parseInt(ge.slice(4,6),16)||0;
              for (let row = 0; row < renderHeight; row++) {
                const t = row / (renderHeight - 1 || 1);
                const mr = Math.round(gsR + (geR - gsR) * t);
                const mg = Math.round(gsG + (geG - gsG) * t);
                const mb = Math.round(gsB + (geB - gsB) * t);
                for (let col = 0; col < renderWidth; col++) {
                  const i = (row * renderWidth + col) * 4;
                  const luma = 0.299*resultData[i] + 0.587*resultData[i+1] + 0.114*resultData[i+2];
                  const f = luma / 255;
                  resultData[i]   = Math.round(f * mr);
                  resultData[i+1] = Math.round(f * mg);
                  resultData[i+2] = Math.round(f * mb);
                }
              }
            }
            // 'original' and 'palette' keep raw worker output
            // ────────────────────────────────────────────────────────────────

            const finalImgData = new ImageData(resultData, renderWidth, renderHeight);
            ctx.putImageData(finalImgData, 0, 0);
            drawComparisonSplit(ctx);
            resolve();
          } else {
            console.error('Worker failed frame', error);
            reject(error);
          }
          setIsProcessing(false);
        };
      } else {
        resolve();
      }
    });
  }, [webcamActive, originalImage, videoElement, compareMode]);

  // Video / Webcam Playback Rendering Loop
  useEffect(() => {
    let animationFrameId: number;
    let active = true;

    const loop = async () => {
      if (!active) return;

      const isPlaying = webcamActive || (videoElement && !videoElement.paused) || renderingVideoProgressRef.current?.active;

      if (isPlaying && !isExportingRef.current) {
        try {
          await render();
        } catch (err) {
          console.error('Frame loop error:', err);
        }
        if (active) {
          animationFrameId = requestAnimationFrame(loop);
        }
      }
    };

    const isPlaying = webcamActive || (videoElement && !videoElement.paused) || renderingVideoProgressRef.current?.active;

    if (isPlaying && !isExportingRef.current) {
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [webcamActive, videoElement, render]);

  // Static render once on settings change or comparison adjustment when paused
  useEffect(() => {
    const isPlaying = webcamActive || (videoElement && !videoElement.paused) || renderingVideoProgressRef.current?.active;
    if (!isPlaying && !isExportingRef.current) {
      render();
    }
  }, [settings, activeEffect, compareMode, compareOffset, webcamActive, videoElement, render]);


  // Undo/Redo tracking
  const pushHistory = (newSettings: Settings, newEffect: EffectId) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ settings: newSettings, effectId: newEffect });
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevStep = history[historyIndex - 1];
      setSettings(prevStep.settings);
      setActiveEffect(prevStep.effectId);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextStep = history[historyIndex + 1];
      setSettings(nextStep.settings);
      setActiveEffect(nextStep.effectId);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Preset Controls
  const applyPreset = (preset: Preset) => {
    const nextSettings = { ...settings, ...preset.settings };
    setSettings(nextSettings);
    setActiveEffect(preset.effectId);
    pushHistory(nextSettings, preset.effectId);
  };

  const saveCustomPreset = (name: string) => {
    const newPreset: Preset = {
      id: Math.random().toString(36).substring(7),
      name: name.toUpperCase(),
      effectId: activeEffect,
      settings: { ...settings },
      isCustom: true
    };
    const nextPresets = [...customPresets, newPreset];
    setCustomPresets(nextPresets);
    localStorage.setItem('asciiforge_presets', JSON.stringify(nextPresets));
  };

  const deleteCustomPreset = (id: string) => {
    const nextPresets = customPresets.filter((p: Preset) => p.id !== id);
    setCustomPresets(nextPresets);
    localStorage.setItem('asciiforge_presets', JSON.stringify(nextPresets));
  };

  const exportCustomPresets = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customPresets));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "asciiforge_presets.json");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const importCustomPresets = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          const nextPresets = [...customPresets, ...imported];
          setCustomPresets(nextPresets);
          localStorage.setItem('asciiforge_presets', JSON.stringify(nextPresets));
        }
      } catch (err) {
        alert('Invalid JSON preset file.');
      }
    };
    reader.readAsText(file);
  };

  // Settings modification
  const updateSettings = (newSettings: Partial<Settings>) => {
    const nextSettings = { ...settings, ...newSettings };
    setSettings(nextSettings);
    // Debounce/push to history selectively
    pushHistory(nextSettings, activeEffect);
  };

  // Webcam stream handlers
  const startWebcam = async () => {
    try {
      stopWebcam();
      setOriginalImage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      webcamStreamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.addEventListener('loadedmetadata', () => {
        video.play();
        setWebcamActive(true);
      });
      videoRef.current = video;
      setVideoElement(video);
    } catch (err) {
      alert('Unable to load webcam. Grant permissions in browser.');
    }
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    webcamStreamRef.current = null;
    setWebcamActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoElement(null);
  };

  const loadVideo = (file: File) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.autoplay = true;
    video.muted = true;
    video.loop = settings.loop;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => {
      video.play();
      videoRef.current = video;
      setVideoElement(video);
      setOriginalImage('video_loaded');
    });
  };

  // Batch pipeline simulation processor
  const processSingleImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const renderWidth = Math.floor(img.width * settings.resolutionScale);
          const renderHeight = Math.floor(img.height * settings.resolutionScale);
          canvas.width = renderWidth;
          canvas.height = renderHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject('Canvas context not available');
            return;
          }

          // Pass to offscreen rendering dither logic
          ctx.drawImage(img, 0, 0, renderWidth, renderHeight);
          // Return simulated filtered PNG
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject('Image load failed');
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject('FileReader failed');
      reader.readAsDataURL(file);
    });
  };

  // Audio buffer to high-quality WAV PCM encoder (downloaded with .mp3 extension)
  const bufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels: Float32Array[] = [];
    let i: number;
    let sample: number;
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // chunk length
    setUint16(1); // sample format (raw PCM)
    setUint16(numOfChan); // channel count
    setUint32(buffer.sampleRate); // sample rate
    setUint32(buffer.sampleRate * numOfChan * 2); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // scale
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArr], { type: 'audio/mp3' });
  };

  // Multi-format Downloader
  const exportResult = (format: 'text' | 'html' | 'ansi' | 'svg' | 'png' | 'webp' | 'gif' | 'video' | 'mp3') => {
    if (!canvasRef.current) return;

    if (format === 'ansi' || format === 'svg') {
      const useCustom = !!settings.useCustomColumns;
      const targetCols = settings.targetColumns || 80;
      const cols = useCustom 
        ? Math.max(10, targetCols) 
        : Math.max(10, Math.floor(canvasRef.current.width / settings.blockSize));
      
      const blockSize = useCustom ? (canvasRef.current.width / cols) : settings.blockSize;
      const rows = useCustom
        ? Math.max(10, Math.round(canvasRef.current.height / blockSize))
        : Math.max(10, Math.floor(canvasRef.current.height / settings.blockSize));

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cols;
      const srcH = activeEffect === 'ascii-halfblock' ? rows * 2 : rows;
      tempCanvas.height = srcH;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      const drawSourceAndExport = (sourceObj: HTMLImageElement | HTMLVideoElement) => {
        tempCtx.drawImage(sourceObj, 0, 0, cols, srcH);
        const imgData = tempCtx.getImageData(0, 0, cols, srcH);
        const pixels = imgData.data;

        // Apply brightness/contrast/gamma pre-adjustments off-screen
        const brightness = settings.brightness / 100 * 255;
        const contrast = 1.0 + (settings.contrast / 100);
        const gamma = settings.gamma || 1.0;
        const invGamma = 1.0 / gamma;
        
        for (let i = 0; i < pixels.length; i += 4) {
          let rVal = (pixels[i] + brightness - 128) * contrast + 128;
          let gVal = (pixels[i+1] + brightness - 128) * contrast + 128;
          let bVal = (pixels[i+2] + brightness - 128) * contrast + 128;
          
          rVal = Math.min(255, Math.max(0, rVal));
          gVal = Math.min(255, Math.max(0, gVal));
          bVal = Math.min(255, Math.max(0, bVal));
          
          if (gamma !== 1.0) {
            rVal = Math.pow(rVal / 255, invGamma) * 255;
            gVal = Math.pow(gVal / 255, invGamma) * 255;
            bVal = Math.pow(bVal / 255, invGamma) * 255;
          }
          
          pixels[i]   = Math.min(255, Math.max(0, rVal));
          pixels[i+1] = Math.min(255, Math.max(0, gVal));
          pixels[i+2] = Math.min(255, Math.max(0, bVal));
        }

        // Apply high-performance 3x3 convolution edge sharpen filter
        const sharpenAmount = settings.sharpen || 0;
        if (sharpenAmount > 0) {
          const original = new Uint8ClampedArray(pixels);
          const w = cols;
          const h = srcH;
          
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;
              for (let c = 0; c < 3; c++) {
                const val = original[idx + c];
                const top  = original[((y - 1) * w + x) * 4 + c];
                const bot  = original[((y + 1) * w + x) * 4 + c];
                const left = original[(y * w + (x - 1)) * 4 + c];
                const right = original[(y * w + (x + 1)) * 4 + c];
                
                const sharpened = val + sharpenAmount * (4 * val - top - bot - left - right);
                pixels[idx + c] = Math.min(255, Math.max(0, sharpened));
              }
            }
          }
        }

        let charset = CHARSETS.classic;
        if (activeEffect === 'ascii-dense') charset = CHARSETS.dense;
        else if (activeEffect === 'ascii-blocks') charset = CHARSETS.blocks;
        else if (activeEffect === 'ascii-custom') charset = settings.charset || ' .:-=+*#%@';

        if (format === 'ansi') {
          let ansiText = '';
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = (y * cols + x) * 4;
              let r = pixels[idx];
              let g = pixels[idx+1];
              let b = pixels[idx+2];
              
              if (settings.colorBoost && settings.colorBoost > 0) {
                const boosted = boostColorVibrance(r, g, b, settings.colorBoost);
                r = boosted.r;
                g = boosted.g;
                b = boosted.b;
              }
              
              const luma = 0.299 * r + 0.587 * g + 0.114 * b;

              let charStr = ' ';
              if (activeEffect === 'ascii-classic') {
                charStr = mapLuminanceToChar(luma, CHARSETS.classic);
              } else if (activeEffect === 'ascii-dense') {
                charStr = mapLuminanceToChar(luma, CHARSETS.dense);
              } else if (activeEffect === 'ascii-blocks') {
                charStr = mapLuminanceToChar(luma, CHARSETS.blocks);
              } else if (activeEffect === 'ascii-custom') {
                charStr = mapLuminanceToChar(luma, settings.charset || ' .:-=+*#%@');
              } else if (activeEffect === 'ascii-emoji') {
                const emojiIndex = Math.floor((luma / 255) * (CHARSETS.emojis.length - 1));
                charStr = CHARSETS.emojis[emojiIndex] || '🌑';
              } else if (activeEffect === 'ascii-braille') {
                const sampleDot = (dx: number, dy: number): boolean => {
                  const nx = Math.min(cols - 1, Math.max(0, Math.round(x + dx * 0.4)));
                  const ny = Math.min(srcH - 1, Math.max(0, Math.round(y - 1.5 + dy * 0.8)));
                  const ni = (ny * cols + nx) * 4;
                  const nl = luma709(pixels[ni], pixels[ni+1], pixels[ni+2]);
                  return nl > settings.thresholdValue;
                };
                charStr = getBrailleChar([
                  [sampleDot(0,0), sampleDot(0,1), sampleDot(0,2), sampleDot(0,3)],
                  [sampleDot(1,0), sampleDot(1,1), sampleDot(1,2), sampleDot(1,3)]
                ]);
              } else if (activeEffect === 'ascii-halfblock') {
                const idxT = ((y * 2) * cols + x) * 4;
                const idxB = ((y * 2 + 1) * cols + x) * 4;
                const topOn = luma709(pixels[idxT], pixels[idxT+1], pixels[idxT+2]) > settings.thresholdValue;
                const botOn = luma709(pixels[idxB], pixels[idxB+1], pixels[idxB+2]) > settings.thresholdValue;
                charStr = (topOn && botOn) ? '█' : topOn ? '▀' : botOn ? '▄' : ' ';
              } else if (activeEffect === 'ascii-shade') {
                const SHADE_DENSITY = [0, 8, 28, 52, 80, 108, 135, 162, 188, 210, 232, 248, 255];
                let sIdx = 0;
                while (sIdx < SHADE_DENSITY.length - 1 && luma > SHADE_DENSITY[sIdx + 1]) {
                  sIdx++;
                }
                charStr = CHARSETS.shade[sIdx] || ' ';
              } else if (activeEffect === 'ascii-katakana') {
                charStr = mapLuminanceToChar(luma, CHARSETS.katakana);
              } else if (activeEffect === 'ascii-math') {
                charStr = mapLuminanceToChar(luma, CHARSETS.math);
              } else if (activeEffect === 'ascii-binary') {
                charStr = luma > settings.thresholdValue ? '1' : '0';
              } else if (activeEffect === 'ascii-morse') {
                charStr = luma < 60 ? ' ' : luma < 160 ? '·' : '-';
              } else if (activeEffect === 'ascii-edge') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < settings.thresholdValue * 0.8) {
                  charStr = lm(x, y) > settings.thresholdValue ? '·' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '─';
                  else if (angle < 67.5) charStr = '/';
                  else if (angle < 112.5) charStr = '│';
                  else charStr = '\\';
                }
              } else if (activeEffect === 'ascii-box') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < settings.thresholdValue * 0.7) {
                  const base = lm(x, y);
                  charStr = base > 200 ? '█' : base > 130 ? '▓' : base > 70 ? '▒' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '═';
                  else if (angle < 67.5) charStr = '╝';
                  else if (angle < 112.5) charStr = '║';
                  else charStr = '╚';
                }
              } else {
                charStr = mapLuminanceToChar(luma, charset);
              }

              // Truecolor ANSI escape sequence
              ansiText += `\x1b[38;2;${r};${g};${b}m${charStr}`;
            }
            ansiText += '\x1b[0m\n';
          }

          const blob = new Blob([ansiText], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'asciiforge.ansi';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        if (format === 'svg') {
          const bg = settings.colorMode === 'mono' ? settings.monoBg : '#000000';
          let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * 8} ${rows * 12}" width="${cols * 8}" height="${rows * 12}" style="background: ${bg}">\n`;
          svgContent += `  <style>\n    .ascii { font-family: 'Courier Prime', monospace; font-size: 10px; font-weight: bold; }\n  </style>\n`;
          
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = (y * cols + x) * 4;
              let r = pixels[idx];
              let g = pixels[idx+1];
              let b = pixels[idx+2];
              
              if (settings.colorBoost && settings.colorBoost > 0) {
                const boosted = boostColorVibrance(r, g, b, settings.colorBoost);
                r = boosted.r;
                g = boosted.g;
                b = boosted.b;
              }
              
              const luma = 0.299 * r + 0.587 * g + 0.114 * b;

              let charStr = ' ';
              if (activeEffect === 'ascii-classic') {
                charStr = mapLuminanceToChar(luma, CHARSETS.classic);
              } else if (activeEffect === 'ascii-dense') {
                charStr = mapLuminanceToChar(luma, CHARSETS.dense);
              } else if (activeEffect === 'ascii-blocks') {
                charStr = mapLuminanceToChar(luma, CHARSETS.blocks);
              } else if (activeEffect === 'ascii-custom') {
                charStr = mapLuminanceToChar(luma, settings.charset || ' .:-=+*#%@');
              } else if (activeEffect === 'ascii-emoji') {
                const emojiIndex = Math.floor((luma / 255) * (CHARSETS.emojis.length - 1));
                charStr = CHARSETS.emojis[emojiIndex] || '🌑';
              } else if (activeEffect === 'ascii-braille') {
                const sampleDot = (dx: number, dy: number): boolean => {
                  const nx = Math.min(cols - 1, Math.max(0, Math.round(x + dx * 0.4)));
                  const ny = Math.min(srcH - 1, Math.max(0, Math.round(y - 1.5 + dy * 0.8)));
                  const ni = (ny * cols + nx) * 4;
                  const nl = luma709(pixels[ni], pixels[ni+1], pixels[ni+2]);
                  return nl > settings.thresholdValue;
                };
                charStr = getBrailleChar([
                  [sampleDot(0,0), sampleDot(0,1), sampleDot(0,2), sampleDot(0,3)],
                  [sampleDot(1,0), sampleDot(1,1), sampleDot(1,2), sampleDot(1,3)]
                ]);
              } else if (activeEffect === 'ascii-halfblock') {
                const idxT = ((y * 2) * cols + x) * 4;
                const idxB = ((y * 2 + 1) * cols + x) * 4;
                const topOn = luma709(pixels[idxT], pixels[idxT+1], pixels[idxT+2]) > settings.thresholdValue;
                const botOn = luma709(pixels[idxB], pixels[idxB+1], pixels[idxB+2]) > settings.thresholdValue;
                charStr = (topOn && botOn) ? '█' : topOn ? '▀' : botOn ? '▄' : ' ';
              } else if (activeEffect === 'ascii-shade') {
                const SHADE_DENSITY = [0, 8, 28, 52, 80, 108, 135, 162, 188, 210, 232, 248, 255];
                let sIdx = 0;
                while (sIdx < SHADE_DENSITY.length - 1 && luma > SHADE_DENSITY[sIdx + 1]) {
                  sIdx++;
                }
                charStr = CHARSETS.shade[sIdx] || ' ';
              } else if (activeEffect === 'ascii-katakana') {
                charStr = mapLuminanceToChar(luma, CHARSETS.katakana);
              } else if (activeEffect === 'ascii-math') {
                charStr = mapLuminanceToChar(luma, CHARSETS.math);
              } else if (activeEffect === 'ascii-binary') {
                charStr = luma > settings.thresholdValue ? '1' : '0';
              } else if (activeEffect === 'ascii-morse') {
                charStr = luma < 60 ? ' ' : luma < 160 ? '·' : '-';
              } else if (activeEffect === 'ascii-edge') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < settings.thresholdValue * 0.8) {
                  charStr = lm(x, y) > settings.thresholdValue ? '·' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '─';
                  else if (angle < 67.5) charStr = '/';
                  else if (angle < 112.5) charStr = '│';
                  else charStr = '\\';
                }
              } else if (activeEffect === 'ascii-box') {
                const lm = (cx: number, cy: number) => {
                  const pxIdx = (Math.min(rows-1, Math.max(0, cy)) * cols + Math.min(cols-1, Math.max(0, cx))) * 4;
                  return luma709(pixels[pxIdx], pixels[pxIdx+1], pixels[pxIdx+2]);
                };
                const gx = (-lm(x-1,y-1) + lm(x+1,y-1) - 2*lm(x-1,y) + 2*lm(x+1,y) - lm(x-1,y+1) + lm(x+1,y+1));
                const gy = (-lm(x-1,y-1) - 2*lm(x,y-1) - lm(x+1,y-1) + lm(x-1,y+1) + 2*lm(x,y+1) + lm(x+1,y+1));
                const mag = Math.sqrt(gx*gx + gy*gy);
                if (mag < settings.thresholdValue * 0.7) {
                  const base = lm(x, y);
                  charStr = base > 200 ? '█' : base > 130 ? '▓' : base > 70 ? '▒' : ' ';
                } else {
                  const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
                  if (angle < 22.5 || angle >= 157.5) charStr = '═';
                  else if (angle < 67.5) charStr = '╝';
                  else if (angle < 112.5) charStr = '║';
                  else charStr = '╚';
                }
              } else {
                charStr = mapLuminanceToChar(luma, charset);
              }

              if (charStr === ' ' || charStr === '') continue;

              const fill = settings.colorMode === 'mono' ? settings.monoFg : `rgb(${r},${g},${b})`;
              const escapedChar = charStr === '&' ? '&amp;' : charStr === '<' ? '&lt;' : charStr === '>' ? '&gt;' : charStr;
              svgContent += `  <text x="${x * 8}" y="${y * 12 + 10}" fill="${fill}" class="ascii">${escapedChar}</text>\n`;
            }
          }
          svgContent += `</svg>`;

          const blob = new Blob([svgContent], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'asciiforge.svg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      };

      if (originalImage) {
        const imageObj = new Image();
        imageObj.onload = () => drawSourceAndExport(imageObj);
        imageObj.src = originalImage;
      } else if (videoElement) {
        drawSourceAndExport(videoElement);
      }
      return;
    }

    if (format === 'mp3') {
      if (!videoElement || !videoElement.src || webcamActive) {
        alert('Please load a video file first to export its audio.');
        return;
      }

      const runAudioExport = async () => {
        try {
          const response = await fetch(videoElement.src);
          const arrayBuffer = await response.arrayBuffer();
          
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          
          const blob = bufferToWav(audioBuffer);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `asciiforge_audio_${Date.now()}.mp3`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Audio extraction failed', err);
          alert('Could not extract audio track from video.');
        }
      };

      runAudioExport();
      return;
    }

    if (format === 'png' || format === 'webp') {
      const dataUrl = canvasRef.current.toDataURL(`image/${format}`);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `asciiforge.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (format === 'text') {
      navigator.clipboard.writeText(textOutput);
      alert('ASCII matrix copied to clipboard!');
      return;
    }

    if (format === 'html') {
      const isMono = settings.colorMode === 'mono';
      const bg = isMono ? settings.monoBg : '#000000';
      let bodyContent = '';
      
      if (isMono) {
        bodyContent = `<pre style="color: ${settings.monoFg}; margin: 0; line-height: 1.1; font-weight: bold; letter-spacing: 0px;">${textOutput}</pre>`;
      } else {
        const useCustom = !!settings.useCustomColumns;
        const targetCols = settings.targetColumns || 80;
        const cols = useCustom 
          ? Math.max(10, targetCols) 
          : Math.max(10, Math.floor(canvasRef.current.width / settings.blockSize));
        
        const blockSize = useCustom ? (canvasRef.current.width / cols) : settings.blockSize;
        const rows = useCustom
          ? Math.max(10, Math.round(canvasRef.current.height / blockSize))
          : Math.max(10, Math.floor(canvasRef.current.height / settings.blockSize));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cols;
        const srcH = activeEffect === 'ascii-halfblock' ? rows * 2 : rows;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          let sourceObj: HTMLImageElement | HTMLVideoElement | null = null;
          if (webcamActive && videoElement) sourceObj = videoElement;
          else if (videoElement && videoElement.src && !videoElement.paused) sourceObj = videoElement;
          else if (originalImage && offscreenImageRef.current) sourceObj = offscreenImageRef.current;
          
          if (sourceObj) {
            tempCtx.drawImage(sourceObj, 0, 0, cols, srcH);
            const imgData = tempCtx.getImageData(0, 0, cols, srcH);
            const pixels = imgData.data;

            // Apply pre-adjustments
            const brightness = settings.brightness / 100 * 255;
            const contrast = 1.0 + (settings.contrast / 100);
            const gamma = settings.gamma || 1.0;
            const invGamma = 1.0 / gamma;
            for (let i = 0; i < pixels.length; i += 4) {
              let rVal = (pixels[i] + brightness - 128) * contrast + 128;
              let gVal = (pixels[i+1] + brightness - 128) * contrast + 128;
              let bVal = (pixels[i+2] + brightness - 128) * contrast + 128;
              
              rVal = Math.min(255, Math.max(0, rVal));
              gVal = Math.min(255, Math.max(0, gVal));
              bVal = Math.min(255, Math.max(0, bVal));
              
              if (gamma !== 1.0) {
                rVal = Math.pow(rVal / 255, invGamma) * 255;
                gVal = Math.pow(gVal / 255, invGamma) * 255;
                bVal = Math.pow(bVal / 255, invGamma) * 255;
              }
              
              pixels[i]   = Math.min(255, Math.max(0, rVal));
              pixels[i+1] = Math.min(255, Math.max(0, gVal));
              pixels[i+2] = Math.min(255, Math.max(0, bVal));
            }

            // Apply sharpen
            const sharpenAmount = settings.sharpen || 0;
            if (sharpenAmount > 0) {
              const original = new Uint8ClampedArray(pixels);
              for (let y = 1; y < srcH - 1; y++) {
                for (let x = 1; x < cols - 1; x++) {
                  const idx = (y * cols + x) * 4;
                  for (let c = 0; c < 3; c++) {
                    const val = original[idx + c];
                    const top  = original[((y - 1) * cols + x) * 4 + c];
                    const bot  = original[((y + 1) * cols + x) * 4 + c];
                    const left = original[(y * cols + (x - 1)) * 4 + c];
                    const right = original[(y * cols + (x + 1)) * 4 + c];
                    
                    const sharpened = val + sharpenAmount * (4 * val - top - bot - left - right);
                    pixels[idx + c] = Math.min(255, Math.max(0, sharpened));
                  }
                }
              }
            }

            bodyContent += '<pre style="margin: 0; line-height: 1.1; font-weight: bold; letter-spacing: 0px;">';
            for (let y = 0; y < rows; y++) {
              let rowHtml = '';
              for (let x = 0; x < cols; x++) {
                const idx = (y * cols + x) * 4;
                let r = pixels[idx];
                let g = pixels[idx+1];
                let b = pixels[idx+2];
                
                if (settings.colorBoost && settings.colorBoost > 0) {
                  const boosted = boostColorVibrance(r, g, b, settings.colorBoost);
                  r = boosted.r;
                  g = boosted.g;
                  b = boosted.b;
                }
                
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;

                let charStr = ' ';
                if (activeEffect === 'ascii-classic') {
                  charStr = mapLuminanceToChar(luma, CHARSETS.classic);
                } else if (activeEffect === 'ascii-dense') {
                  charStr = mapLuminanceToChar(luma, CHARSETS.dense);
                } else if (activeEffect === 'ascii-blocks') {
                  charStr = mapLuminanceToChar(luma, CHARSETS.blocks);
                } else if (activeEffect === 'ascii-custom') {
                  charStr = mapLuminanceToChar(luma, settings.charset || ' .:-=+*#%@');
                } else if (activeEffect === 'ascii-emoji') {
                  const emojiIndex = Math.floor((luma / 255) * (CHARSETS.emojis.length - 1));
                  charStr = CHARSETS.emojis[emojiIndex] || '🌑';
                } else if (activeEffect === 'ascii-halfblock') {
                  const idxT = ((y * 2) * cols + x) * 4;
                  const idxB = ((y * 2 + 1) * cols + x) * 4;
                  const topOn = luma709(pixels[idxT], pixels[idxT+1], pixels[idxT+2]) > settings.thresholdValue;
                  const botOn = luma709(pixels[idxB], pixels[idxB+1], pixels[idxB+2]) > settings.thresholdValue;
                  charStr = (topOn && botOn) ? '█' : topOn ? '▀' : botOn ? '▄' : ' ';
                } else {
                  charStr = mapLuminanceToChar(luma, CHARSETS.classic);
                }

                // Escape characters for HTML
                const escapedChar = charStr === '&' ? '&amp;' : charStr === '<' ? '&lt;' : charStr === '>' ? '&gt;' : charStr === '"' ? '&quot;' : charStr;

                let fill = `rgb(${r},${g},${b})`;
                if (settings.colorMode === 'palette') {
                  fill = getPaletteColor(r, g, b, settings.paletteSize);
                } else if (settings.colorMode === 'gradient') {
                  fill = lerpColor(settings.gradientStart, settings.gradientEnd, y / (rows - 1 || 1));
                }

                rowHtml += `<span style="color: ${fill}">${escapedChar}</span>`;
              }
              bodyContent += rowHtml + '\n';
            }
            bodyContent += '</pre>';
          }
        }
      }

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ASCIIForge Masterpiece</title>
<style>
  body {
    background-color: ${bg};
    font-family: 'Courier Prime', 'JetBrains Mono', monospace;
    font-size: 10px;
    white-space: pre;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
    box-sizing: border-box;
  }
</style>
</head>
<body>
${bodyContent}
</body>
</html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'asciiforge.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    if (format === 'video') {
      const isVideoFile = videoElement && videoElement.src && !webcamActive;

      if (isVideoFile) {
        const runAutomaticRender = async () => {
          let originalLoop = false;
          try {
            const wasPaused = videoElement.paused;
            const originalTime = videoElement.currentTime;
            originalLoop = videoElement.loop;
            videoElement.loop = false;
            
            // Go to beginning
            videoElement.currentTime = 0;
            videoElement.pause();

            const canvas = canvasRef.current;
            if (!canvas) return;

            const originalCompareMode = compareMode;
            setCompareMode(false);

            const fps = exportFps;
            const duration = videoElement.duration || 5;

            const stream = (canvas as any).captureStream ? (canvas as any).captureStream(fps) : (canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(fps) : null;
            if (!stream) {
              alert('Canvas recording is not supported in this browser.');
              setCompareMode(originalCompareMode);
              return;
            }

            // Capture the audio track from the video element playback using browser capabilities
            let combinedStream = stream;
            try {
              const videoStream = (videoElement as any).captureStream ? (videoElement as any).captureStream() : (videoElement as any).mozCaptureStream ? (videoElement as any).mozCaptureStream() : null;
              if (videoStream) {
                const audioTrack = videoStream.getAudioTracks()[0];
                if (audioTrack) {
                  combinedStream = new MediaStream([
                    ...stream.getVideoTracks(),
                    audioTrack
                  ]);
                }
              }
            } catch (audioErr) {
              console.warn('Could not capture audio stream:', audioErr);
            }

            let options = {
              mimeType: 'video/mp4;codecs=h264',
              videoBitsPerSecond: 50000000
            };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: 'video/mp4', videoBitsPerSecond: 50000000 };
            }
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 50000000 };
            }
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: 'video/webm', videoBitsPerSecond: 50000000 };
            }

            const recorder = new MediaRecorder(combinedStream, options);
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
              const blob = new Blob(chunks, { type: options.mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
              a.download = `asciiforge_processed_${Date.now()}.${ext}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              isExportingRef.current = false;
              setCompareMode(originalCompareMode);
              setRenderingVideoProgress(null);
              renderingVideoProgressRef.current = null;
              videoElement.currentTime = originalTime;
              videoElement.loop = originalLoop;
              if (wasPaused) {
                videoElement.pause();
              } else {
                videoElement.play();
              }
            };

            isExportingRef.current = true;

            const totalFrames = Math.ceil(duration * fps);
            const progressState = { active: true, currentFrame: 0, totalFrames, renderedFrames: 0, currentTime: 0, duration };
            setRenderingVideoProgress(progressState);
            renderingVideoProgressRef.current = progressState;

            recorder.start();
            videoElement.play();

            // Background-safe rendering loop — tracks ACTUAL frames rendered
            let renderedFrameCount = 0;
            const exportInterval = setInterval(() => {
              render();
              renderedFrameCount++;

              const current = videoElement.currentTime;
              const currentFrameNum = Math.min(totalFrames, Math.ceil(current * fps));
              const progressState = {
                active: true,
                currentFrame: currentFrameNum,
                totalFrames,
                renderedFrames: renderedFrameCount,
                currentTime: current,
                duration
              };
              setRenderingVideoProgress(progressState);
              renderingVideoProgressRef.current = progressState;

              if (videoElement.ended || current >= duration) {
                clearInterval(exportInterval);
                isExportingRef.current = false;
                videoElement.pause();
                recorder.stop();
              }
            }, 1000 / fps);

          } catch (err) {
            console.error('Automatic render failed', err);
            alert('An error occurred during video rendering.');
            setRenderingVideoProgress(null);
            renderingVideoProgressRef.current = null;
            videoElement.loop = originalLoop;
          }
        };

        runAutomaticRender();
        return;
      } else {
        if (recording) {
          stopVideoRecording();
          return;
        }
        
        const canvas = canvasRef.current;
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : (canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(30) : null;
        if (!stream) {
          alert('Canvas recording is not supported in this browser.');
          return;
        }

        let options = { mimeType: 'video/mp4;codecs=h264', videoBitsPerSecond: 50000000 };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4', videoBitsPerSecond: 50000000 };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 50000000 };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm', videoBitsPerSecond: 50000000 };
        }

        try {
          const recorder = new MediaRecorder(stream, options);
          recordedChunksRef.current = [];
          
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
            a.download = `asciiforge_render.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setRecording(false);
            setRecordingTime(0);
          };

          recorder.start(100);
          mediaRecorderRef.current = recorder;
          setRecording(true);
          setRecordingTime(0);
        } catch (err) {
          console.error('Failed to start MediaRecorder', err);
          alert('Could not start video recorder.');
        }
      }
    }
  };

  return (
    <div className="app-container">
      {/* Brutalist Monospace Header */}
      <header>
        <div className="logo-container">
          <span className="logo-accent">▲ ASCIIFORGE</span>
          <span className="tagline">Brutalist Terminal Suite</span>
        </div>

        <div className="header-controls">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
            className="header-btn"
          >
            {theme === 'dark' ? '☀ LIGHT MODE' : '☾ DARK MODE'}
          </button>
          
          <button 
            onClick={() => setBatchOpen(true)} 
            className="header-btn primary"
          >
            📦 BATCH PIPELINE
          </button>

          <button 
            onClick={undo} 
            disabled={historyIndex <= 0} 
            className="header-icon-btn" 
            title="Undo (Ctrl+Z)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="nav-svg-icon">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          <button 
            onClick={redo} 
            disabled={historyIndex >= history.length - 1} 
            className="header-icon-btn" 
            title="Redo (Ctrl+Y)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="nav-svg-icon">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>

          <button 
            onClick={() => setShortcutsOpen(true)} 
            className="header-btn"
            title="Keyboard Shortcuts Console"
          >
            ⌨️ HELP
          </button>
        </div>
      </header>

      {/* Main Framework panels */}
      <div className="main-workspace">
        <SidebarLeft
          activeEffect={activeEffect}
          setActiveEffect={(id: EffectId) => {
            setActiveEffect(id);
            pushHistory(settings, id);
          }}
          settings={settings}
          applyPreset={applyPreset}
          customPresets={customPresets}
          saveCustomPreset={saveCustomPreset}
          deleteCustomPreset={deleteCustomPreset}
          exportCustomPresets={exportCustomPresets}
          importCustomPresets={importCustomPresets}
          collapsed={leftCollapsed}
          setCollapsed={setLeftCollapsed}
        />

        <WorkspaceCenter
          activeEffect={activeEffect}
          settings={settings}
          originalImage={originalImage}
          setOriginalImage={(url: string | null) => {
            setOriginalImage(url);
            if (url) pushHistory(settings, activeEffect);
          }}
          videoElement={videoElement}
          webcamActive={webcamActive}
          startWebcam={startWebcam}
          stopWebcam={stopWebcam}
          loadVideo={loadVideo}
          canvasRef={canvasRef}
          textOutput={textOutput}
          isProcessing={isProcessing}
          compareMode={compareMode}
          setCompareMode={setCompareMode}
          compareOffset={compareOffset}
          setCompareOffset={setCompareOffset}
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
        />

        <SidebarRight
          activeEffect={activeEffect}
          settings={settings}
          updateSettings={updateSettings}
          collapsed={rightCollapsed}
          setCollapsed={setRightCollapsed}
          uiMode={uiMode}
          setUiMode={setUiMode}
          originalImage={originalImage}
          videoElement={videoElement}
          webcamActive={webcamActive}
          exportResult={exportResult}
          recording={recording}
          recordingTime={recordingTime}
          stopVideoRecording={stopVideoRecording}
          exportFps={exportFps}
          setExportFps={setExportFps}
          detectedAspect={detectedAspect}
        />
      </div>

      {/* Mobile drawer backdrop — tapping closes open drawer */}
      {(!leftCollapsed || !rightCollapsed) && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => {
            setLeftCollapsed(true);
            setRightCollapsed(true);
          }}
        />
      )}

      {/* Mobile Bottom Navigation Tab Bar */}
      <nav className="mobile-bottom-nav">
        <button
          id="mobile-nav-fx"
          className={`mobile-nav-btn${!leftCollapsed ? ' active' : ''}`}
          onClick={() => {
            const opening = leftCollapsed;
            setLeftCollapsed(!leftCollapsed);
            if (opening) setRightCollapsed(true); // close other drawer
          }}
        >
          <span className="nav-icon">⚡</span>
          FX
        </button>
        <button
          id="mobile-nav-canvas"
          className="mobile-nav-btn"
          onClick={() => {
            setLeftCollapsed(true);
            setRightCollapsed(true);
          }}
        >
          <span className="nav-icon">◉</span>
          CANVAS
        </button>
        <button
          id="mobile-nav-settings"
          className={`mobile-nav-btn${!rightCollapsed ? ' active' : ''}`}
          onClick={() => {
            const opening = rightCollapsed;
            setRightCollapsed(!rightCollapsed);
            if (opening) setLeftCollapsed(true); // close other drawer
          }}
        >
          <span className="nav-icon">⚙</span>
          SETTINGS
        </button>
      </nav>
      {originalImage && originalImage !== 'video_loaded' && (
        <img
          ref={offscreenImageRef}
          src={originalImage}
          crossOrigin="anonymous"
          alt="Offscreen loading cache"
          style={{ display: 'none' }}
          onLoad={() => render()}
        />
      )}

      {/* Shortcuts Help Modal */}
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Batch Renderer Modal */}
      <BatchProcessModal
        isOpen={batchOpen}
        onClose={() => setBatchOpen(false)}
        activeEffect={activeEffect}
        settings={settings}
        processSingleImage={processSingleImage}
      />

      {/* High-Quality Offline Video Render Overlay */}
      {/* High-Quality Video Render Overlay */}
      {renderingVideoProgress && renderingVideoProgress.active && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(5, 5, 5, 0.75)',
          backdropFilter: 'blur(20px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#ffffff',
          fontFamily: "'JetBrains Mono', 'Courier Prime', monospace"
        }}>
          <div style={{
            width: '480px',
            padding: '40px',
            backgroundColor: 'rgba(10, 10, 10, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            outline: '4px solid rgba(255, 255, 255, 0.05)',
            boxShadow: '0 20px 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 255, 255, 0.05)',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Blinking Red Recording Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#ff3b30',
                borderRadius: '50%',
                display: 'inline-block',
                boxShadow: '0 0 8px #ff3b30',
                animation: 'pulse 1s infinite alternate'
              }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', color: '#ff3b30' }}>
                LIVE EXPORT RECORDING
              </span>
            </div>

            <h2 style={{ fontSize: '18px', letterSpacing: '3px', margin: '0 0 10px 0', textTransform: 'uppercase', fontWeight: 'bold' }}>
              ▲ EXPORT STUDIO
            </h2>
            <div style={{ height: '1px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.1)', marginBottom: '20px' }} />

            {/* Frame Counter — main focus */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '20px',
              gap: '4px'
            }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '2px' }}>Rendering Frame</div>
              <div style={{
                fontSize: '52px',
                fontWeight: 'bold',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '-2px',
                color: '#ffffff',
                lineHeight: 1
              }}>
                {String(renderingVideoProgress.currentFrame).padStart(String(renderingVideoProgress.totalFrames).length, '0')}
              </div>
              <div style={{ fontSize: '13px', color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                of <span style={{ color: '#aaa', fontWeight: 'bold' }}>{renderingVideoProgress.totalFrames}</span> total frames
              </div>
            </div>

            {/* Dynamic Progress Bar */}
            <div style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              marginBottom: '16px',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '3px'
            }}>
              <div style={{
                width: `${(renderingVideoProgress.currentFrame / Math.max(renderingVideoProgress.totalFrames, 1)) * 100}%`,
                height: '100%',
                backgroundColor: '#ffffff',
                transition: 'width 0.08s ease-out',
                borderRadius: '3px'
              }} />
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px', fontSize: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#555', display: 'block', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '1px', marginBottom: '3px' }}>Captured</span>
                <span style={{ fontWeight: 'bold', color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{renderingVideoProgress.renderedFrames ?? 0}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#555', display: 'block', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '1px', marginBottom: '3px' }}>FPS Target</span>
                <span style={{ fontWeight: 'bold', color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{exportFps}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#555', display: 'block', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '1px', marginBottom: '3px' }}>Progress</span>
                <span style={{ fontWeight: 'bold', color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                  {Math.round((renderingVideoProgress.currentFrame / Math.max(renderingVideoProgress.totalFrames, 1)) * 100)}%
                </span>
              </div>
            </div>

            {renderingVideoProgress.currentTime !== undefined && renderingVideoProgress.duration !== undefined && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: '#555',
                marginBottom: '20px',
                fontFamily: "'JetBrains Mono', monospace",
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: '12px'
              }}>
                <div>TIME <span style={{ color: '#aaa', fontWeight: 'bold' }}>{renderingVideoProgress.currentTime.toFixed(2)}s</span></div>
                <div>DURATION <span style={{ color: '#aaa', fontWeight: 'bold' }}>{renderingVideoProgress.duration.toFixed(2)}s</span></div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '10px', color: '#444' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '1.5px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>WebGL GPU Encoding + Audio Sync Active</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
