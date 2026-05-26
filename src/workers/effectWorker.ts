// --- ASCIIFORGE Offscreen Web Worker ---
import { Settings } from '../types';
import {
  adjustPixels,
  applyFloydDither,
  applyAtkinsonDither,
  applyBayerDither,
  applyPixelSort,
  applyVoronoi,
  applyOilPaint,
  applyBlueNoiseDither
} from '../effects/cpuEffects';

self.onmessage = function (e: MessageEvent) {
  const { id, buffer, width, height, settings, effectId } = e.data as {
    id: number;
    buffer: ArrayBuffer;
    width: number;
    height: number;
    settings: Settings;
    effectId: string;
  };

  const data = new Uint8ClampedArray(buffer);

  try {
    // 1. Global pre-adjustments (brightness, contrast, grayscale, etc.)
    adjustPixels(data, width, height, settings);

    // 2. Route CPU effect
    switch (effectId) {
      case 'dither-floyd':
        applyFloydDither(data, width, height);
        break;
      case 'dither-atkinson':
        applyAtkinsonDither(data, width, height);
        break;
      case 'dither-bayer':
        applyBayerDither(data, width, height);
        break;
      case 'pixel-sort':
        applyPixelSort(data, width, height, settings.sortThreshold);
        break;
      case 'voronoi':
        applyVoronoi(data, width, height, settings.voronoiCells);
        break;
      case 'oil-paint':
        applyOilPaint(data, width, height, settings.paintRadius);
        break;
      case 'dither-blue-noise':
        applyBlueNoiseDither(data, width, height);
        break;
      default:
        // Pass-through if not recognized
        break;
    }

    // 3. Return buffer back using transferable objects
    (self as any).postMessage({ id, buffer: data.buffer, success: true }, [data.buffer]);
  } catch (error: any) {
    (self as any).postMessage({ id, success: false, error: error.message || 'Worker process failed' });
  }
};
