// --- ASCIIFORGE CPU Algorithms ---
import { Settings } from '../types';

// ── Charset Definitions ───────────────────────────────────────────────────────
export const CHARSETS = {
  classic:  ' .:-=+*#%@',
  dense:    ' _.,-:=+*#%@WMB8&$',
  blocks:   '░▒▓█▄▀■□',
  // NEW: density-sorted for accurate LUT mapping
  shade:    ' ·:!|({}+%#@█',
  katakana: 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ',
  math:     ' ·∙∘○◎●∞∑∆πΩ√∫≈×÷±≡∈∉⊂⊃∧∨¬',
  binary:   '01',
  morse:    ' .-',
  emojis:   ['🌑', '🌒', '🌓', '🌔', '🌕']
};

// ── BT.709 Perceptual Luminance (replaces BT.601 across all new effects) ──────
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mapLumaLUT(luma: number, charset: string, density: number[]): string {
  for (let i = density.length - 1; i >= 0; i--) {
    if (luma >= density[i]) return charset[i] || charset[charset.length - 1];
  }
  return charset[0];
}

// Map luminance to characters (original BT.601 — kept for legacy effects)
export function mapLuminanceToChar(luma: number, charset: string): string {
  const index = Math.floor((luma / 255) * (charset.length - 1));
  return charset[index] || ' ';
}

// Convert 2x4 pixel grid to Braille unicode character
export function getBrailleChar(grid: boolean[][]): string {
  // Braille dots layout:
  // [0,0]: dot1 (0x01), [0,1]: dot2 (0x02), [0,2]: dot3 (0x04)
  // [1,0]: dot4 (0x08), [1,1]: dot5 (0x10), [1,2]: dot6 (0x20)
  // [0,3]: dot7 (0x40), [1,3]: dot8 (0x80)
  let code = 0;
  if (grid[0]?.[0]) code |= 0x01;
  if (grid[0]?.[1]) code |= 0x02;
  if (grid[0]?.[2]) code |= 0x04;
  if (grid[1]?.[0]) code |= 0x08;
  if (grid[1]?.[1]) code |= 0x10;
  if (grid[1]?.[2]) code |= 0x20;
  if (grid[0]?.[3]) code |= 0x40;
  if (grid[1]?.[3]) code |= 0x80;
  
  return String.fromCharCode(0x2800 + code);
}

// Global pixel color adjustments (Brightness, Contrast, Grayscale, Invert)
export function adjustPixels(
  data: Uint8ClampedArray,
  _width: number,
  _height: number,
  settings: Settings
) {
  const b = settings.brightness / 100 * 255;
  const c = 1.0 + (settings.contrast / 100);
  const g = settings.gamma;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let gVal = data[i+1];
    let bVal = data[i+2];

    // Brightness
    r += b;
    gVal += b;
    bVal += b;

    // Contrast
    r = (r - 128) * c + 128;
    gVal = (gVal - 128) * c + 128;
    bVal = (bVal - 128) * c + 128;

    // Gamma
    if (g !== 1.0) {
      r = 255 * Math.pow(Math.max(r, 0) / 255, 1 / g);
      gVal = 255 * Math.pow(Math.max(gVal, 0) / 255, 1 / g);
      bVal = 255 * Math.pow(Math.max(bVal, 0) / 255, 1 / g);
    }

    // Grayscale
    if (settings.grayscale) {
      const luma = 0.299 * r + 0.587 * gVal + 0.114 * bVal;
      r = luma;
      gVal = luma;
      bVal = luma;
    }

    // Invert
    if (settings.invert) {
      r = 255 - r;
      gVal = 255 - gVal;
      bVal = 255 - bVal;
    }

    data[i] = Math.min(255, Math.max(0, r));
    data[i+1] = Math.min(255, Math.max(0, gVal));
    data[i+2] = Math.min(255, Math.max(0, bVal));
  }
}

// 1. FLOYD-STEINBERG DITHERING
export function applyFloydDither(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx+1];
      const oldB = data[idx+2];

      const newR = oldR < 128 ? 0 : 255;
      const newG = oldG < 128 ? 0 : 255;
      const newB = oldB < 128 ? 0 : 255;

      data[idx] = newR;
      data[idx+1] = newG;
      data[idx+2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // Distribute error to neighbors
      // Right (x+1, y) : 7/16
      distributeError(data, width, height, x + 1, y, errR, errG, errB, 7 / 16);
      // Bottom-Left (x-1, y+1) : 3/16
      distributeError(data, width, height, x - 1, y + 1, errR, errG, errB, 3 / 16);
      // Bottom (x, y+1) : 5/16
      distributeError(data, width, height, x, y + 1, errR, errG, errB, 5 / 16);
      // Bottom-Right (x+1, y+1) : 1/16
      distributeError(data, width, height, x + 1, y + 1, errR, errG, errB, 1 / 16);
    }
  }
}

// 2. ATKINSON DITHERING
export function applyAtkinsonDither(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx+1];
      const oldB = data[idx+2];

      const newR = oldR < 128 ? 0 : 255;
      const newG = oldG < 128 ? 0 : 255;
      const newB = oldB < 128 ? 0 : 255;

      data[idx] = newR;
      data[idx+1] = newG;
      data[idx+2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // Atkinson distributes error to 6 neighbors: 1/8 each
      const weight = 1 / 8;
      distributeError(data, width, height, x + 1, y, errR, errG, errB, weight);
      distributeError(data, width, height, x + 2, y, errR, errG, errB, weight);
      distributeError(data, width, height, x - 1, y + 1, errR, errG, errB, weight);
      distributeError(data, width, height, x, y + 1, errR, errG, errB, weight);
      distributeError(data, width, height, x + 1, y + 1, errR, errG, errB, weight);
      distributeError(data, width, height, x, y + 2, errR, errG, errB, weight);
    }
  }
}

function distributeError(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  errR: number,
  errG: number,
  errB: number,
  weight: number
) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  data[idx] = Math.min(255, Math.max(0, data[idx] + errR * weight));
  data[idx+1] = Math.min(255, Math.max(0, data[idx+1] + errG * weight));
  data[idx+2] = Math.min(255, Math.max(0, data[idx+2] + errB * weight));
}

// 3. BAYER ORDERED DITHERING
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];
export function applyBayerDither(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const bayerVal = BAYER_4X4[y % 4][x % 4] * 16; // Map 0-15 to 0-240
      
      const val = luma > bayerVal ? 255 : 0;
      data[idx] = val;
      data[idx+1] = val;
      data[idx+2] = val;
    }
  }
}

// 4. PIXEL SORT
export function applyPixelSort(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
) {
  // Sort rows horizontally based on brightness threshold
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      // Find start of sortable segment
      while (x < width) {
        const idx = (y * width + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
        if (luma > threshold) break;
        x++;
      }

      let startX = x;
      // Find end of segment
      while (x < width) {
        const idx = (y * width + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
        if (luma < threshold) break;
        x++;
      }
      let endX = x;

      if (startX < endX) {
        sortRowSegment(data, width, y, startX, endX);
      }
    }
  }
}

function sortRowSegment(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  start: number,
  end: number
) {
  const pixels: { r: number; g: number; b: number; luma: number }[] = [];
  for (let x = start; x < end; x++) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx+1];
    const b = data[idx+2];
    pixels.push({
      r, g, b,
      luma: 0.299 * r + 0.587 * g + 0.114 * b
    });
  }

  // Sort by luminance
  pixels.sort((a, b) => a.luma - b.luma);

  // Write back
  let index = 0;
  for (let x = start; x < end; x++) {
    const idx = (y * width + x) * 4;
    data[idx] = pixels[index].r;
    data[idx+1] = pixels[index].g;
    data[idx+2] = pixels[index].b;
    index++;
  }
}

// 5. VORONOI SEGMENTATION
export function applyVoronoi(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  numCells: number
) {
  const points: { x: number; y: number; r: number; g: number; b: number }[] = [];
  
  // Distribute random centroid seeds
  for (let i = 0; i < numCells; i++) {
    const px = Math.floor(Math.random() * width);
    const py = Math.floor(Math.random() * height);
    const idx = (py * width + px) * 4;
    points.push({
      x: px,
      y: py,
      r: data[idx] || 0,
      g: data[idx+1] || 0,
      b: data[idx+2] || 0
    });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let nearestPoint = points[0];

      // Find nearest centroid
      for (const p of points) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = dx * dx + dy * dy; // squared distance is faster
        if (dist < minDist) {
          minDist = dist;
          nearestPoint = p;
        }
      }

      const idx = (y * width + x) * 4;
      data[idx] = nearestPoint.r;
      data[idx+1] = nearestPoint.g;
      data[idx+2] = nearestPoint.b;
    }
  }
}

// 6. OIL PAINT STYLE
export function applyOilPaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
) {
  const original = new Uint8ClampedArray(data);
  const intensityBins = 20;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const counts = new Int32Array(intensityBins);
      const rSums = new Float32Array(intensityBins);
      const gSums = new Float32Array(intensityBins);
      const bSums = new Float32Array(intensityBins);

      // Neighbor sampling
      for (let ny = -radius; ny <= radius; ny++) {
        const sy = y + ny;
        if (sy < 0 || sy >= height) continue;
        
        for (let nx = -radius; nx <= radius; nx++) {
          const sx = x + nx;
          if (sx < 0 || sx >= width) continue;

          const sIdx = (sy * width + sx) * 4;
          const r = original[sIdx];
          const g = original[sIdx+1];
          const b = original[sIdx+2];

          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const bin = Math.floor((luma / 255) * (intensityBins - 1));

          counts[bin]++;
          rSums[bin] += r;
          gSums[bin] += g;
          bSums[bin] += b;
        }
      }

      // Find most frequent intensity bin
      let maxCount = 0;
      let maxBin = 0;
      for (let i = 0; i < intensityBins; i++) {
        if (counts[i] > maxCount) {
          maxCount = counts[i];
          maxBin = i;
        }
      }

      const idx = (y * width + x) * 4;
      data[idx] = rSums[maxBin] / maxCount;
      data[idx+1] = gSums[maxBin] / maxCount;
      data[idx+2] = bSums[maxBin] / maxCount;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NEW EFFECTS
// ════════════════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
}
function lerpHex(a: string, b: string, t: number): string {
  const [ar,ag,ab] = parseHex(a);
  const [br,bg,bb] = parseHex(b);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}

// ── Shared character-grid renderer ───────────────────────────────────────────
export function applyCharGrid(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number,
  settings: Settings,
  charFn: (luma: number) => string
) {
  const px = src.data;
  const { colorMode, monoFg, monoBg } = settings;
  ctx.font = `${blockH}px 'Courier Prime', monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = colorMode === 'mono' ? monoBg : '#09090b';
  ctx.fillRect(0, 0, cols * blockW, rows * blockH);
  let lastStyle = '';
  if (colorMode === 'mono') { ctx.fillStyle = monoFg; lastStyle = monoFg; }

  for (let row = 0; row < rows; row++) {
    if (colorMode === 'gradient') {
      const t = row / (rows - 1 || 1);
      const s = lerpHex(settings.gradientStart, settings.gradientEnd, t);
      if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
    }
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = px[i], g = px[i+1], b = px[i+2];
      const luma = luma709(r, g, b);
      const char = charFn(luma);
      if (char === ' ') continue;
      if (colorMode === 'original') {
        const s = `rgb(${r},${g},${b})`;
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      }
      ctx.fillText(char, col * blockW, row * blockH);
    }
  }
}

// 7. HALF-BLOCK ART — ▀▄ for 2× vertical resolution
export function renderHalfBlock(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  const px = src.data;
  const { colorMode, monoFg, monoBg, thresholdValue } = settings;
  ctx.font = `${blockH}px 'Courier Prime', monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = colorMode === 'mono' ? monoBg : '#09090b';
  ctx.fillRect(0, 0, cols * blockW, rows * blockH);
  let lastStyle = '';
  if (colorMode === 'mono') { ctx.fillStyle = monoFg; lastStyle = monoFg; }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idxT = ((row * 2)     * cols + col) * 4;
      const idxB = ((row * 2 + 1) * cols + col) * 4;
      const rT = px[idxT], gT = px[idxT+1], bT = px[idxT+2];
      const rB = px[idxB], gB = px[idxB+1], bB = px[idxB+2];
      const lumaT = luma709(rT, gT, bT);
      const lumaB = luma709(rB, gB, bB);
      const topOn = lumaT > thresholdValue;
      const botOn = lumaB > thresholdValue;

      let char = ' ';
      if (topOn && botOn)  char = '█';
      else if (topOn)      char = '▀';
      else if (botOn)      char = '▄';
      if (char === ' ') continue;

      if (colorMode === 'original') {
        const s = `rgb(${Math.round((rT+rB)/2)},${Math.round((gT+gB)/2)},${Math.round((bT+bB)/2)})`;
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      } else if (colorMode === 'gradient') {
        const t = row / (rows - 1 || 1);
        const s = lerpHex(settings.gradientStart, settings.gradientEnd, t);
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      }
      ctx.fillText(char, col * blockW, row * blockH);
    }
  }
}

// 8. EDGE-AWARE ASCII — Sobel gradient → direction-aligned chars
export function renderEdgeAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  const px = src.data;
  ctx.font = `${blockH}px 'Courier Prime', monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = settings.colorMode === 'mono' ? settings.monoBg : '#09090b';
  ctx.fillRect(0, 0, cols * blockW, rows * blockH);
  ctx.fillStyle = settings.monoFg || '#ffffff';
  let lastStyle = settings.monoFg || '#ffffff';

  const lm = (col: number, row: number) => {
    const i = (Math.min(rows-1, Math.max(0, row)) * cols + Math.min(cols-1, Math.max(0, col))) * 4;
    return luma709(px[i], px[i+1], px[i+2]);
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = (-lm(col-1,row-1) + lm(col+1,row-1)
                  - 2*lm(col-1,row) + 2*lm(col+1,row)
                  - lm(col-1,row+1) + lm(col+1,row+1));
      const gy = (-lm(col-1,row-1) - 2*lm(col,row-1) - lm(col+1,row-1)
                  + lm(col-1,row+1) + 2*lm(col,row+1) + lm(col+1,row+1));
      const mag = Math.sqrt(gx*gx + gy*gy);

      const thr = settings.thresholdValue * 0.8;
      if (mag < thr) {
        const base = lm(col, row);
        if (base > settings.thresholdValue) ctx.fillText('·', col * blockW, row * blockH);
        continue;
      }
      const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
      let char: string;
      if      (angle < 22.5 || angle >= 157.5) char = '─';
      else if (angle < 67.5)                   char = '/';
      else if (angle < 112.5)                  char = '│';
      else                                     char = '\\';

      if (settings.colorMode === 'original') {
        const i = (row * cols + col) * 4;
        const s = `rgb(${px[i]},${px[i+1]},${px[i+2]})`;
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      }
      ctx.fillText(char, col * blockW, row * blockH);
    }
  }
}

// 8.5. BOX-DRAWING CONTOUR ART
export function renderBoxAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  const px = src.data;
  ctx.font = `${blockH}px 'Courier Prime', monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = settings.colorMode === 'mono' ? settings.monoBg : '#09090b';
  ctx.fillRect(0, 0, cols * blockW, rows * blockH);
  ctx.fillStyle = settings.monoFg || '#ffffff';
  let lastStyle = settings.monoFg || '#ffffff';

  const lm = (col: number, row: number) => {
    const i = (Math.min(rows-1, Math.max(0, row)) * cols + Math.min(cols-1, Math.max(0, col))) * 4;
    return luma709(px[i], px[i+1], px[i+2]);
  };

  const lerpHex = (c1: string, c2: string, f: number) => {
    const r1 = parseInt(c1.substring(1,3), 16);
    const g1 = parseInt(c1.substring(3,5), 16);
    const b1 = parseInt(c1.substring(5,7), 16);
    const r2 = parseInt(c2.substring(1,3), 16);
    const g2 = parseInt(c2.substring(3,5), 16);
    const b2 = parseInt(c2.substring(5,7), 16);
    const r = Math.round(r1 + (r2 - r1) * f);
    const g = Math.round(g1 + (g2 - g1) * f);
    const b = Math.round(b1 + (b2 - b1) * f);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = (-lm(col-1,row-1) + lm(col+1,row-1)
                  - 2*lm(col-1,row) + 2*lm(col+1,row)
                  - lm(col-1,row+1) + lm(col+1,row+1));
      const gy = (-lm(col-1,row-1) - 2*lm(col,row-1) - lm(col+1,row-1)
                  + lm(col-1,row+1) + 2*lm(col,row+1) + lm(col+1,row+1));
      const mag = Math.sqrt(gx*gx + gy*gy);

      const thr = settings.thresholdValue * 0.7;
      let char: string;
      if (mag < thr) {
        const base = lm(col, row);
        if (base > 200) char = '█';
        else if (base > 130) char = '▓';
        else if (base > 70) char = '▒';
        else char = ' ';
      } else {
        const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
        if      (angle < 22.5 || angle >= 157.5) char = '═';
        else if (angle < 67.5)                   char = '╝';
        else if (angle < 112.5)                  char = '║';
        else                                     char = '╚';
      }

      if (settings.colorMode === 'original') {
        const i = (row * cols + col) * 4;
        const s = `rgb(${px[i]},${px[i+1]},${px[i+2]})`;
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      } else if (settings.colorMode === 'gradient') {
        const t = row / (rows - 1 || 1);
        const s = lerpHex(settings.gradientStart, settings.gradientEnd, t);
        if (s !== lastStyle) { ctx.fillStyle = s; lastStyle = s; }
      }
      ctx.fillText(char, col * blockW, row * blockH);
    }
  }
}

// 9. SHADE ASCII — BT.709 + density LUT
export function renderShadeAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  const SHADE_DENSITY = [0, 8, 28, 52, 80, 108, 135, 162, 188, 210, 232, 248, 255];
  applyCharGrid(src, cols, rows, ctx, blockW, blockH, settings,
    (luma) => mapLumaLUT(luma, CHARSETS.shade, SHADE_DENSITY)
  );
}

// 10. KATAKANA
export function renderKatakana(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  applyCharGrid(src, cols, rows, ctx, blockW, blockH, settings,
    (luma) => mapLuminanceToChar(luma, CHARSETS.katakana)
  );
}

// 11. MATH SYMBOLS
export function renderMathAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  applyCharGrid(src, cols, rows, ctx, blockW, blockH, settings,
    (luma) => mapLuminanceToChar(luma, CHARSETS.math)
  );
}

// 12. BINARY FIELD
export function renderBinaryAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  applyCharGrid(src, cols, rows, ctx, blockW, blockH, settings,
    (luma) => luma > settings.thresholdValue ? '1' : '0'
  );
}

// 13. MORSE CODE
export function renderMorseAscii(
  src: ImageData, cols: number, rows: number,
  ctx: CanvasRenderingContext2D, blockW: number, blockH: number, settings: Settings
) {
  applyCharGrid(src, cols, rows, ctx, blockW, blockH, settings, (luma) => {
    if (luma < 60)  return ' ';
    if (luma < 160) return '·';
    return '-';
  });
}

// 14. BLUE NOISE DITHER — interleaved gradient noise approximation (Jimenez 2014)
const BN_SIZE = 64;
const _bnTile: Float32Array = (() => {
  const arr = new Float32Array(BN_SIZE * BN_SIZE);
  for (let y = 0; y < BN_SIZE; y++)
    for (let x = 0; x < BN_SIZE; x++)
      arr[y * BN_SIZE + x] = (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;
  return arr;
})();

export function applyBlueNoiseDither(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = luma709(data[i], data[i+1], data[i+2]);
      const threshold = _bnTile[(y % BN_SIZE) * BN_SIZE + (x % BN_SIZE)] * 255;
      const val = luma > threshold ? 255 : 0;
      data[i] = data[i+1] = data[i+2] = val;
    }
  }
}
