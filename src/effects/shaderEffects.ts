// --- ASCIIFORGE GPU Shader Pipeline ---
import { Settings } from '../types';

export const VERTEX_SHADER_SRC = `#version 300 es
in vec2 position;
out vec2 v_texCoord;
void main() {
  // Map [-1, 1] position to [0, 1] texture coordinate
  v_texCoord = position * 0.5 + 0.5;
  // Flip Y for standard image orientation
  v_texCoord.y = 1.0 - v_texCoord.y;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Helper: Compile individual shaders
export function compileShader(gl: WebGL2RenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${log}`);
  }
  return shader;
}

// Helper: Create WebGL Program
export function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, vsSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fsSrc, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

// Map Hex colors to float RGB arrays
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return [r, g, b];
}

// Standard WebGL 2 Shader filters
export const SHADER_EFFECTS: Record<string, string> = {
  // BASE PASSTHROUGH & GLOBAL SLIDERS
  base: `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

// Global settings
uniform float u_brightness; // -1.0 to 1.0
uniform float u_contrast;   // -1.0 to 1.0
uniform float u_gamma;      // 0.5 to 2.5
uniform float u_sharpen;    // 0.0 to 5.0
uniform int u_invert;       // 0 or 1
uniform int u_grayscale;    // 0 or 1

// Color controls
uniform int u_colorMode;    // 0: original, 1: mono, 2: gradient
uniform vec3 u_monoFg;
uniform vec3 u_monoBg;
uniform vec3 u_gradStart;
uniform vec3 u_gradEnd;

// Chromatic parameters
uniform float u_chromatic;   // offset distance
uniform float u_scanlines;   // intensity
uniform float u_grain;       // intensity
uniform float u_vignette;    // intensity
uniform float u_time;

// Random number generator
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 applyColorGrading(vec3 color) {
  // Brightness
  color += u_brightness;
  
  // Contrast
  color = (color - 0.5) * (1.0 + u_contrast) + 0.5;
  
  // Gamma
  color = pow(max(color, vec3(0.0)), vec3(1.0 / u_gamma));
  
  // Grayscale
  if (u_grayscale == 1) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = vec3(luma);
  }
  
  // Invert
  if (u_invert == 1) {
    color = 1.0 - color;
  }
  
  return clamp(color, 0.0, 1.0);
}

vec3 applyColorMode(vec3 color) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  
  if (u_colorMode == 1) { // Mono
    return mix(u_monoBg, u_monoFg, luma);
  } else if (u_colorMode == 2) { // Gradient Map
    return mix(u_gradStart, u_gradEnd, luma);
  }
  return color;
}

void main() {
  vec2 uv = v_texCoord;
  vec3 color = vec3(0.0);

  // Sharpen convolver kernel
  if (u_sharpen > 0.0) {
    vec2 step = 1.0 / u_resolution;
    vec3 center = texture(u_texture, uv).rgb;
    vec3 top    = texture(u_texture, uv + vec2(0.0, step.y)).rgb;
    vec3 bottom = texture(u_texture, uv - vec2(0.0, step.y)).rgb;
    vec3 left   = texture(u_texture, uv - vec2(step.x, 0.0)).rgb;
    vec3 right  = texture(u_texture, uv + vec2(step.x, 0.0)).rgb;
    
    vec3 sharpColor = center + u_sharpen * (center * 4.0 - top - bottom - left - right);
    color = sharpColor;
  } else {
    // Chromatic Aberration
    if (u_chromatic > 0.0) {
      vec2 offset = vec2(u_chromatic / u_resolution.x, 0.0);
      color.r = texture(u_texture, uv - offset).r;
      color.g = texture(u_texture, uv).g;
      color.b = texture(u_texture, uv + offset).b;
    } else {
      color = texture(u_texture, uv).rgb;
    }
  }

  // Base adjustments
  color = applyColorGrading(color);

  // Color Mapping
  color = applyColorMode(color);

  // Scanlines
  if (u_scanlines > 0.0) {
    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
    color = mix(color, color * (1.0 - u_scanlines * 0.4), scanline);
  }

  // Film Grain
  if (u_grain > 0.0) {
    float noise = rand(uv + fract(u_time));
    color = mix(color, color + (noise - 0.5) * 0.25, u_grain);
  }

  // Vignette
  if (u_vignette > 0.0) {
    vec2 distVec = uv - 0.5;
    float dist = dot(distVec, distVec);
    color *= clamp(1.0 - dist * u_vignette, 0.0, 1.0);
  }

  fragColor = vec4(color, 1.0);
}
`,

  // 1. CMYK HALFTONE DOTS
  'halftone-dots': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blockSize; // Density scale
uniform float u_brightness;
uniform float u_contrast;
uniform int u_dotShape; // 0: circle, 1: square, 2: oval, 3: diamond

void main() {
  vec2 uv = v_texCoord;
  float size = max(u_blockSize, 4.0);
  vec2 grid = uv * u_resolution;
  vec2 center = (floor(grid / size) + 0.5) * size;
  vec2 sampleUV = center / u_resolution;
  
  vec3 color = texture(u_texture, sampleUV).rgb;
  color += u_brightness;
  color = (color - 0.5) * (1.0 + u_contrast) + 0.5;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  
  // Normalize grid offset inside the cell to [-1.0, 1.0]
  vec2 cellOffset = (grid - center) / (size / 2.0);
  
  float distVal = 0.0;
  if (u_dotShape == 1) {
    // Square
    distVal = max(abs(cellOffset.x), abs(cellOffset.y));
  } else if (u_dotShape == 2) {
    // Oval
    distVal = length(cellOffset * vec2(1.0, 1.6));
  } else if (u_dotShape == 3) {
    // Diamond
    distVal = abs(cellOffset.x) + abs(cellOffset.y);
  } else {
    // Circle
    distVal = length(cellOffset);
  }

  vec3 finalColor = vec3(0.0);
  if (distVal < luma) {
    finalColor = color;
  } else {
    finalColor = vec3(0.05); // near black grid back
  }

  fragColor = vec4(finalColor, 1.0);
}
`,

  // 2. HALFTONE LINES
  'halftone-lines': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blockSize;
uniform float u_brightness;
uniform float u_contrast;

void main() {
  vec2 uv = v_texCoord;
  float size = max(u_blockSize, 4.0);
  
  vec3 color = texture(u_texture, uv).rgb;
  color += u_brightness;
  color = (color - 0.5) * (1.0 + u_contrast) + 0.5;
  
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  
  // Create line grid
  float linePattern = sin((uv.x + uv.y) * u_resolution.x * (3.14159 / size)) * 0.5 + 0.5;
  
  vec3 finalColor = vec3(0.05);
  if (linePattern < luma) {
    finalColor = color;
  }
  
  fragColor = vec4(finalColor, 1.0);
}
`,

  // 3. SOBEL EDGE DETECTION
  'contour-edges': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_edgeStrength;

void main() {
  vec2 step = 1.0 / u_resolution;
  vec2 uv = v_texCoord;

  // Neighbor sampling
  float t   = dot(texture(u_texture, uv + vec2(0.0, step.y)).rgb, vec3(0.299, 0.587, 0.114));
  float b   = dot(texture(u_texture, uv - vec2(0.0, step.y)).rgb, vec3(0.299, 0.587, 0.114));
  float l   = dot(texture(u_texture, uv - vec2(step.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float r   = dot(texture(u_texture, uv + vec2(step.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float tl  = dot(texture(u_texture, uv + vec2(-step.x, step.y)).rgb, vec3(0.299, 0.587, 0.114));
  float tr  = dot(texture(u_texture, uv + vec2(step.x, step.y)).rgb, vec3(0.299, 0.587, 0.114));
  float bl  = dot(texture(u_texture, uv + vec2(-step.x, -step.y)).rgb, vec3(0.299, 0.587, 0.114));
  float br  = dot(texture(u_texture, uv + vec2(step.x, -step.y)).rgb, vec3(0.299, 0.587, 0.114));

  // Sobel convolution
  float gX = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gY = -tl - 2.0*t - tr + bl + 2.0*b + br;
  
  float edge = sqrt(gX * gX + gY * gY) * u_edgeStrength;
  
  vec3 finalColor = vec3(edge);
  // Add green tint
  finalColor *= vec3(0.0, 1.0, 0.53);

  fragColor = vec4(finalColor, 1.0);
}
`,

  // 4. MATRIX RAIN EFFECT
  'matrix-rain': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_matrixSpeed;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  float columnSize = 12.0; // character column width
  
  // Calculate coordinates in column grids
  vec2 pixelPos = uv * u_resolution;
  float col = floor(pixelPos.x / columnSize);
  float row = floor(pixelPos.y / columnSize);
  
  // Rain falling animation
  float speed = u_matrixSpeed * (0.8 + 0.4 * sin(col * 3.11));
  float flow = fract(u_time * 0.1 * speed - col * 0.15);
  
  // Matrix falling rain fade out
  float glyphPos = mod(row - flow * (u_resolution.y / columnSize), u_resolution.y / columnSize);
  float intensity = clamp(1.0 - (glyphPos / 15.0), 0.0, 1.0);
  
  // Mix in original image colors or green
  vec3 source = texture(u_texture, uv).rgb;
  float brightness = dot(source, vec3(0.299, 0.587, 0.114));
  
  vec3 greenRain = vec3(0.0, intensity * (brightness + 0.3), 0.0);
  // Bright lead character glow
  if (glyphPos < 1.0 && glyphPos > 0.0) {
    greenRain = vec3(0.8, 1.0, 0.8) * intensity;
  }

  fragColor = vec4(greenRain, 1.0);
}
`,

  // 5. VHS GLITCH
  'vhs-glitch': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_vhsJitter;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  
  // Dynamic VHS Jitter lines
  float jitter = sin(u_time * 10.0 + uv.y * 30.0) * 0.003 * u_vhsJitter;
  if (rand(vec2(floor(u_time * 8.0), uv.y)) > 0.95 - (u_vhsJitter * 0.05)) {
    jitter += (rand(vec2(uv.y, u_time)) - 0.5) * 0.03 * u_vhsJitter;
  }
  
  vec2 glitchUv = vec2(uv.x + jitter, uv.y);
  
  // Chromatic dispersion
  vec3 color = vec3(0.0);
  color.r = texture(u_texture, glitchUv + vec2(0.005 * u_vhsJitter, 0.0)).r;
  color.g = texture(u_texture, glitchUv).g;
  color.b = texture(u_texture, glitchUv - vec2(0.005 * u_vhsJitter, 0.0)).b;
  
  // Tape artifacts
  float artifact = sin(uv.y * 400.0 + u_time * 5.0) * 0.02 * u_vhsJitter;
  color += vec3(artifact);
  
  fragColor = vec4(color, 1.0);
}
`,

  // 6. KUWAHARA — painterly edge-preserving quadrant filter
  'kuwahara': `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_kuwaharaRadius;

void main() {
  vec2 texel = 1.0 / u_resolution;
  int r = max(1, int(u_kuwaharaRadius));

  // Sample 4 quadrant windows: TL, TR, BL, BR
  vec3 mean[4];
  float var_[4];
  for (int q = 0; q < 4; q++) {
    int dx = (q == 1 || q == 3) ? 1 : -1;
    int dy = (q == 2 || q == 3) ? 1 : -1;
    vec3 sum = vec3(0.0);
    vec3 sum2 = vec3(0.0);
    float count = 0.0;
    for (int j = 0; j <= r; j++) {
      for (int i = 0; i <= r; i++) {
        vec2 off = vec2(float(i * dx), float(j * dy)) * texel;
        vec3 c = texture(u_texture, v_texCoord + off).rgb;
        sum  += c;
        sum2 += c * c;
        count += 1.0;
      }
    }
    mean[q] = sum / count;
    vec3 v = sum2 / count - mean[q] * mean[q];
    var_[q] = dot(v, vec3(0.2126, 0.7152, 0.0722)); // luminance-weighted variance
  }

  // Pick quadrant with minimum variance (smoothest)
  vec3 result = mean[0];
  float minVar = var_[0];
  for (int q = 1; q < 4; q++) {
    if (var_[q] < minVar) { minVar = var_[q]; result = mean[q]; }
  }
  fragColor = vec4(result, 1.0);
}
`
};

export class WebGLProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programMap: Map<string, WebGLProgram> = new Map();
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    // Force discrete/high-performance GPU — critical for real-time shader rendering
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      desynchronized: true,
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not supported by your browser.');
    }
    this.gl = gl;
    this.initBuffers();
  }

  private initBuffers() {
    const gl = this.gl;
    // Simple square covering the screen
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private getOrCreateProgram(effectId: string): WebGLProgram {
    if (this.programMap.has(effectId)) {
      return this.programMap.get(effectId)!;
    }

    const fsSrc = SHADER_EFFECTS[effectId] || SHADER_EFFECTS['base'];
    const program = createProgram(this.gl, VERTEX_SHADER_SRC, fsSrc);
    this.programMap.set(effectId, program);
    return program;
  }

  public process(
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    settings: Settings,
    effectId: string,
    time: number,
    isExportingOrRecording: boolean = false
  ): HTMLCanvasElement {
    const gl = this.gl;
    
    // Set offscreen canvas dimension to match source width/height scaled down
    const sourceWidth = (source as any).videoWidth || (source as any).naturalWidth || source.width || 600;
    const sourceHeight = (source as any).videoHeight || (source as any).naturalHeight || source.height || 400;
    const renderWidth = Math.floor(sourceWidth * settings.resolutionScale);
    const renderHeight = Math.floor(sourceHeight * settings.resolutionScale);

    if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
      this.canvas.width = renderWidth;
      this.canvas.height = renderHeight;
    }

    const program = this.getOrCreateProgram(effectId);
    
    // Resize viewport to match canvas aspect ratio
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    // Setup input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Upload image data to GPU
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Set standard uniforms
    const uTexture = gl.getUniformLocation(program, 'u_texture');
    gl.uniform1i(uTexture, 0);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(uResolution, gl.canvas.width, gl.canvas.height);

    const uTime = gl.getUniformLocation(program, 'u_time');
    gl.uniform1f(uTime, time);

    // Set Global sliders with export dynamic range compensation
    const contrastComp = isExportingOrRecording ? 1.15 : 1.0;
    const brightnessComp = isExportingOrRecording ? 0.04 : 0.0;
    const activeGamma = isExportingOrRecording ? (settings.gamma || 1.0) * 0.90 : (settings.gamma || 1.0);

    const uBrightness = gl.getUniformLocation(program, 'u_brightness');
    if (uBrightness) gl.uniform1f(uBrightness, (settings.brightness / 100) + brightnessComp);

    const uContrast = gl.getUniformLocation(program, 'u_contrast');
    if (uContrast) gl.uniform1f(uContrast, (settings.contrast / 100) * contrastComp);

    const uGamma = gl.getUniformLocation(program, 'u_gamma');
    if (uGamma) gl.uniform1f(uGamma, activeGamma);

    const uSharpen = gl.getUniformLocation(program, 'u_sharpen');
    if (uSharpen) gl.uniform1f(uSharpen, settings.sharpen);

    const uInvert = gl.getUniformLocation(program, 'u_invert');
    if (uInvert) gl.uniform1i(uInvert, settings.invert ? 1 : 0);

    const uGrayscale = gl.getUniformLocation(program, 'u_grayscale');
    if (uGrayscale) gl.uniform1i(uGrayscale, settings.grayscale ? 1 : 0);

    // Set color modes
    const uColorMode = gl.getUniformLocation(program, 'u_colorMode');
    if (uColorMode) {
      let mode = 0; // original
      if (settings.colorMode === 'mono') mode = 1;
      else if (settings.colorMode === 'gradient') mode = 2;
      gl.uniform1i(uColorMode, mode);
    }

    const uMonoFg = gl.getUniformLocation(program, 'u_monoFg');
    if (uMonoFg) gl.uniform3fv(uMonoFg, hexToRgb(settings.monoFg));

    const uMonoBg = gl.getUniformLocation(program, 'u_monoBg');
    if (uMonoBg) gl.uniform3fv(uMonoBg, hexToRgb(settings.monoBg));

    const uGradStart = gl.getUniformLocation(program, 'u_gradStart');
    if (uGradStart) gl.uniform3fv(uGradStart, hexToRgb(settings.gradientStart));

    const uGradEnd = gl.getUniformLocation(program, 'u_gradEnd');
    if (uGradEnd) gl.uniform3fv(uGradEnd, hexToRgb(settings.gradientEnd));

    // Chromatic adjustments
    const uChromatic = gl.getUniformLocation(program, 'u_chromatic');
    if (uChromatic) gl.uniform1f(uChromatic, settings.chromaticAberration);

    const uScanlines = gl.getUniformLocation(program, 'u_scanlines');
    if (uScanlines) gl.uniform1f(uScanlines, settings.scanlines / 100);

    const uGrain = gl.getUniformLocation(program, 'u_grain');
    if (uGrain) gl.uniform1f(uGrain, settings.filmGrain / 100);

    const uVignette = gl.getUniformLocation(program, 'u_vignette');
    if (uVignette) gl.uniform1f(uVignette, settings.vignette / 100);

    // Effect specific parameters
    const uBlockSize = gl.getUniformLocation(program, 'u_blockSize');
    if (uBlockSize) gl.uniform1f(uBlockSize, settings.blockSize);

    const uDotShape = gl.getUniformLocation(program, 'u_dotShape');
    if (uDotShape !== null) {
      let shapeInt = 0; // circle
      if (settings.dotShape === 'square') shapeInt = 1;
      else if (settings.dotShape === 'oval') shapeInt = 2;
      else if (settings.dotShape === 'diamond') shapeInt = 3;
      gl.uniform1i(uDotShape, shapeInt);
    }

    const uEdgeStrength = gl.getUniformLocation(program, 'u_edgeStrength');
    if (uEdgeStrength) gl.uniform1f(uEdgeStrength, settings.edgeStrength);

    const uVhsJitter = gl.getUniformLocation(program, 'u_vhsJitter');
    if (uVhsJitter) gl.uniform1f(uVhsJitter, settings.vhsJitter);

    const uKuwahara = gl.getUniformLocation(program, 'u_kuwaharaRadius');
    if (uKuwahara) gl.uniform1f(uKuwahara, settings.kuwaharaRadius ?? 4);

    // Setup input attributes
    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw frame quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  public destroy() {
    const gl = this.gl;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.texture) gl.deleteTexture(this.texture);
    for (const program of this.programMap.values()) {
      gl.deleteProgram(program);
    }
    this.programMap.clear();
  }
}
