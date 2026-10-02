/**
 * WebGL2 GPU acceleration for canvas pixel operations.
 *
 * Replaces CPU-side getImageData/putImageData loops with fragment shaders
 * that run on the GPU, keeping the main thread free for UI rendering.
 * Falls back to Canvas 2D when WebGL2 is unavailable.
 */
import { Platform } from 'react-native';

export interface GLContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const MASK_THRESHOLD_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform float u_threshold;
in vec2 v_uv;
out vec4 frag;
void main() {
  vec4 c = texture(u_image, v_uv);
  float keep = step(u_threshold, c.a);
  frag = vec4(keep, keep, keep, 1.0);
}`;

const OVERLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform vec3 u_overlayColor;
uniform float u_overlayAlpha;
in vec2 v_uv;
out vec4 frag;
void main() {
  vec4 img = texture(u_image, v_uv);
  float maskVal = texture(u_mask, v_uv).r;
  float isRemoved = 1.0 - step(0.5, maskVal);
  frag = mix(img, vec4(u_overlayColor, u_overlayAlpha), isRemoved * u_overlayAlpha);
}`;

const ALPHA_APPLY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
in vec2 v_uv;
out vec4 frag;
void main() {
  vec4 img = texture(u_image, v_uv);
  float maskVal = texture(u_mask, v_uv).r;
  frag = vec4(img.rgb, maskVal);
}`;

const CHECKER_ALPHA_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_mask;
in vec2 v_uv;
out vec4 frag;
void main() {
  float maskVal = texture(u_mask, v_uv).r;
  float isRemoved = 1.0 - step(0.5, maskVal);
  frag = vec4(0.0, 0.0, 0.0, isRemoved);
}`;

const COLOR_FILTER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform float u_hueShift;
uniform float u_satShift;
uniform float u_brightnessShift;
in vec2 v_uv;
out vec4 frag;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 c = texture(u_image, v_uv);
  vec3 hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + u_hueShift);
  hsv.y = clamp(hsv.y + u_satShift, 0.0, 1.0);
  hsv.z = clamp(hsv.z + u_brightnessShift, 0.0, 1.0);
  frag = vec4(hsv2rgb(hsv), c.a);
}`;

let quadBuffer: WebGLBuffer | null = null;
let contextLostCount = 0;
let glContextLostGlobal = false;

/**
 * Check whether a WebGL2 context has been lost and cannot be used.
 * Returns true if the context is lost or in an unrecoverable state.
 */
function isGLContextLost(gl: WebGL2RenderingContext): boolean {
  try {
    return typeof gl.isContextLost === 'function' && gl.isContextLost();
  } catch {
    return true;
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before shader compile');
  const shader = gl.createShader(type)!;
  if (!shader) throw new Error('WebGL context lost: createShader returned null');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile failed: ' + log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, fragSrc: string): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL context lost: createProgram returned null');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

function ensureQuad(gl: WebGL2RenderingContext): WebGLBuffer {
  if (quadBuffer) return quadBuffer;
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before buffer creation');
  quadBuffer = gl.createBuffer();
  if (!quadBuffer) throw new Error('WebGL context lost: createBuffer returned null');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  return quadBuffer;
}

function createTexture(gl: WebGL2RenderingContext, source: TexImageSource, w: number, h: number): WebGLTexture {
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before texture creation');
  const tex = gl.createTexture();
  if (!tex) throw new Error('WebGL context lost: createTexture returned null');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
  return tex;
}

function drawQuad(gl: WebGL2RenderingContext, program: WebGLProgram) {
  gl.useProgram(program);
  const posLoc = gl.getAttribLocation(program, 'a_pos');
  const buf = ensureQuad(gl);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function getGLCanvas(w: number, h: number): GLContext | null {
  if (Platform.OS !== 'web') return null;
  if (typeof document === 'undefined') return null;
  if (glContextLostGlobal) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    // Immediately check for context loss — the driver may have crashed
    // between creating the context and our first use of it.
    if (isGLContextLost(gl)) {
      try { const ext = gl.getExtension('WEBGL_lose_context'); ext?.loseContext(); } catch {}
      return null;
    }
    return { gl, canvas };
  } catch {
    return null;
  }
}

const programCache = new WeakMap<WebGL2RenderingContext, Map<string, WebGLProgram>>();

function getProgram(gl: WebGL2RenderingContext, key: string, fragSrc: string): WebGLProgram {
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before program creation');
  let cache = programCache.get(gl);
  if (!cache) {
    cache = new Map();
    programCache.set(gl, cache);
  }
  let program = cache.get(key);
  if (!program) {
    program = createProgram(gl, fragSrc);
    cache.set(key, program);
  }
  return program;
}

/**
 * Result type for safeGLRender — either a valid canvas or null to signal
 * the caller to fall back to the CPU path.
 */
type GLRenderResult = { canvas: HTMLCanvasElement } | null;

/**
 * Wrap a GL operation with full context-loss resilience.
 *
 * If the WebGL context is lost before, during, or after the operation,
 * this catches the failure and returns null so the caller falls back
 * to the CPU code path. After a context-loss event, the program cache
 * for that context is invalidated (the context is dead anyway).
 */
function safeGLRender(
  ctx: GLContext | null,
  fn: (gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) => void,
): GLRenderResult {
  if (!ctx) return null;
  const { gl, canvas } = ctx;

  // Pre-flight: context already lost (per-context or global)
  if (glContextLostGlobal || isGLContextLost(gl)) {
    invalidateContext(gl);
    return null;
  }

  try {
    fn(gl, canvas);

    // Post-flight: context lost during the operation
    if (isGLContextLost(gl)) {
      invalidateContext(gl);
      return null;
    }

    return { canvas };
  } catch (err) {
    // Context loss manifests as exceptions from GL calls, or null returns
    // from createTexture/createShader/etc. Invalidate and fall back.
    invalidateContext(gl);
    contextLostCount++;
    if (contextLostCount <= 3) {
      console.warn('WebGL context lost, falling back to CPU path:', err);
    }
    return null;
  }
}

/**
 * Invalidate all cached programs for a dead context and attempt to
 * force-release resources. The context itself will be garbage-collected
 * when the canvas is dereferenced.
 */
function invalidateContext(gl: WebGL2RenderingContext): void {
  const cache = programCache.get(gl);
  if (cache) {
    for (const program of cache.values()) {
      try { gl.deleteProgram(program); } catch {}
    }
    cache.clear();
    programCache.delete(gl);
  }
}

/**
 * Build a mask texture from an image's alpha channel on the GPU.
 * Pixels with alpha >= threshold become white (keep), others black (remove).
 * Returns a canvas with the mask, or null if WebGL2 is unavailable.
 */
export function glBuildMask(
  imageCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  threshold = 0.5,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = getProgram(gl, 'mask', MASK_THRESHOLD_FRAG);
    const tex = createTexture(gl, imageCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), threshold);
    drawQuad(gl, program);
    gl.deleteTexture(tex);
  })?.canvas ?? null;
}

/**
 * Composite an overlay color onto removed areas (where mask is black).
 * Returns a canvas with the composited result, or null if WebGL2 is unavailable.
 */
export function glOverlayComposite(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  overlayColor: [number, number, number],
  overlayAlpha: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const program = getProgram(gl, 'overlay', OVERLAY_FRAG);
    const imgTex = createTexture(gl, imageCanvas, width, height);
    gl.activeTexture(gl.TEXTURE1);
    const maskTex = createTexture(gl, maskCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_mask'), 1);
    gl.uniform3f(gl.getUniformLocation(program, 'u_overlayColor'), ...overlayColor);
    gl.uniform1f(gl.getUniformLocation(program, 'u_overlayAlpha'), overlayAlpha);
    drawQuad(gl, program);
    gl.deleteTexture(imgTex);
    gl.deleteTexture(maskTex);
  })?.canvas ?? null;
}

/**
 * Apply a mask as alpha to an image: white mask = opaque, black mask = transparent.
 * Returns a canvas with the result, or null if WebGL2 is unavailable.
 */
export function glApplyAlphaMask(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = getProgram(gl, 'alpha', ALPHA_APPLY_FRAG);
    const imgTex = createTexture(gl, imageCanvas, width, height);
    gl.activeTexture(gl.TEXTURE1);
    const maskTex = createTexture(gl, maskCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_mask'), 1);
    drawQuad(gl, program);
    gl.deleteTexture(imgTex);
    gl.deleteTexture(maskTex);
  })?.canvas ?? null;
}

/**
 * Generate a checker-alpha mask: white where the input mask is black (removed),
 * transparent elsewhere. Used to composite checkerboard only behind removed areas.
 */
export function glCheckerAlphaMask(
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = getProgram(gl, 'checkerAlpha', CHECKER_ALPHA_FRAG);
    const maskTex = createTexture(gl, maskCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_mask'), 0);
    drawQuad(gl, program);
    gl.deleteTexture(maskTex);
  })?.canvas ?? null;
}

/**
 * Apply hue/saturation/brightness shift to an image on the GPU.
 * Falls back to null if WebGL2 is unavailable (caller should use CPU path).
 */
export function glColorFilter(
  imageCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  hueShift: number,
  satShift: number,
  brightnessShift: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = getProgram(gl, 'colorFilter', COLOR_FILTER_FRAG);
    const tex = createTexture(gl, imageCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_hueShift'), hueShift);
    gl.uniform1f(gl.getUniformLocation(program, 'u_satShift'), satShift);
    gl.uniform1f(gl.getUniformLocation(program, 'u_brightnessShift'), brightnessShift);
    drawQuad(gl, program);
    gl.deleteTexture(tex);
  })?.canvas ?? null;
}

/**
 * Check whether WebGL2 is available in the current environment.
 */
export function isWebGL2Available(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof document === 'undefined') return false;
  if (glContextLostGlobal) return false;
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2');
    if (!gl) return false;
    if (isGLContextLost(gl)) return false;
    const loseExt = gl.getExtension('WEBGL_lose_context');
    loseExt?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Global flag set when any WebGL context loss event fires.
 * Cleared on context restore. When true, all GL functions skip
 * the GPU path and return null immediately so callers use CPU fallback.
 */

export function isGLContextLostGlobally(): boolean {
  return glContextLostGlobal;
}

/**
 * Attach WebGL context-loss event listeners to a persistent canvas
 * (e.g. the display canvas in BgRemoveEditor). When the GPU driver
 * crashes or the browser forcibly reclaims the context, this:
 *
 * 1. Prevents the default browser behavior
 * 2. Sets a global flag so all glRenderer functions fall back to CPU
 * 3. Calls onRestoreCallback when the browser auto-restores the context
 *
 * Returns a cleanup function that removes the listeners.
 */
export function attachWebGLContextLossHandler(
  canvas: HTMLCanvasElement,
  onRestoreCallback: () => void,
): () => void {
  if (Platform.OS !== 'web') return () => {};

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    glContextLostGlobal = true;
    contextLostCount++;
    if (contextLostCount <= 3) {
      console.warn('WebGL context lost — falling back to CPU rendering');
    }
  };

  const handleContextRestored = () => {
    glContextLostGlobal = false;
    onRestoreCallback();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  };
}
