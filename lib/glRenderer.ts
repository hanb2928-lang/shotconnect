/**
 * WebGL2 GPU acceleration for canvas pixel operations.
 *
 * Replaces CPU-side getImageData/putImageData loops with fragment shaders
 * that run on the GPU, keeping the main thread free for UI rendering.
 * Falls back to Canvas 2D when WebGL2 is unavailable.
 */
import { Platform } from 'react-native';
import { getAdaptiveRenderParams, computeScaledDimensions, setMemoryPressure, detectRuntimePressure } from '@/lib/devicePerformance';
import { logError, addBreadcrumb } from '@/lib/errorLogger';

export interface GLContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  scale: number;
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

interface GLContextState {
  programs: Map<string, WebGLProgram>;
  quadBuffer: WebGLBuffer | null;
}

let contextLostCount = 0;
let glContextLostGlobal = false;
// Set to true when the app goes background — all pooled GL contexts are
// considered dead (the WebView may purge their canvas nodes and GL
// contexts at any time). Any GL method call on a purged context causes
// a native SIGSEGV that try-catch cannot intercept, so this flag must
// be checked BEFORE any gl.* call. Cleared on foreground return so
// new contexts can be created from scratch.
let contextsPurgedForBackground = false;
const contextState = new WeakMap<WebGL2RenderingContext, GLContextState>();

/**
 * Purge all pooled GL contexts without calling any GL methods.
 *
 * Called on visibilitychange → hidden. The WebView may purge canvas
 * DOM nodes and GL contexts while the app is backgrounded. Calling
 * any GL method (isContextLost, deleteProgram, loseContext, etc.) on
 * a purged context triggers a native SIGSEGV that kills the process
 * before try-catch can intervene. This function only clears the JS
 * references — the GPU resources are already gone or will be cleaned
 * up by the browser.
 */
export function purgeGLContextsForBackground(): void {
  contextsPurgedForBackground = true;
  glContextLostGlobal = true;
  contextPool.length = 0;
}

/**
 * Reset the background-purge flag on foreground return so new GL
 * contexts can be created. Old contexts are already gone — callers
 * must create fresh ones via getGLCanvas.
 */
export function restoreGLContextsAfterForeground(): void {
  contextsPurgedForBackground = false;
  glContextLostGlobal = false;
}

// Module-level visibility listener: purge GL contexts on background
// before the WebView purges the canvas nodes. This is the critical
// defense against the SIGSEGV that occurs when JavaScript tries to
// call methods on a purged GL context after foreground return.
if (typeof document !== 'undefined' && Platform.OS === 'web') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      purgeGLContextsForBackground();
    } else {
      restoreGLContextsAfterForeground();
    }
  });
}

/**
 * WebGL context pool — prevents exceeding the iOS/Safari limit (~16 concurrent
 * contexts) by tracking all active contexts and evicting the least recently
 * used ones when the pool is at capacity. Each transient render context
 * (created by getGLCanvas) is registered here and released after the render
 * completes. Contexts that are explicitly retained (via retainGLContext) stay
 * in the pool until released.
 */
const MAX_GL_CONTEXTS = 12;

interface PooledContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  retained: boolean;
  lastUsed: number;
}

const contextPool: PooledContext[] = [];

function registerContext(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement): void {
  contextPool.push({ gl, canvas, retained: false, lastUsed: Date.now() });
  if (contextPool.length > MAX_GL_CONTEXTS) {
    evictOldestContext();
  }
}

function evictOldestContext(): void {
  for (let i = 0; i < contextPool.length; i++) {
    const entry = contextPool[i];
    if (entry.retained) continue;
    if (isGLContextLost(entry.gl)) {
      invalidateContext(entry.gl);
      contextPool.splice(i, 1);
      i--;
      return;
    }
    invalidateContext(entry.gl);
    try {
      const ext = entry.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    } catch {}
    contextPool.splice(i, 1);
    addBreadcrumb('gl', `Context pool evicted oldest (pool size was ${contextPool.length + 1})`, 'warning');
    return;
  }
}

function releaseContext(gl: WebGL2RenderingContext): void {
  const idx = contextPool.findIndex((e) => e.gl === gl);
  if (idx === -1) return;
  const entry = contextPool[idx];
  if (entry.retained) return;
  invalidateContext(gl);
  try {
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  } catch {}
  contextPool.splice(idx, 1);
}

export function retainGLContext(gl: WebGL2RenderingContext): void {
  const entry = contextPool.find((e) => e.gl === gl);
  if (entry) entry.retained = true;
}

export function releaseRetainedContext(gl: WebGL2RenderingContext): void {
  const entry = contextPool.find((e) => e.gl === gl);
  if (entry) entry.retained = false;
}

export function getActiveContextCount(): number {
  return contextPool.length;
}

export function releaseAllGLContexts(): void {
  // If contexts were purged for background, the GL objects are already
  // dead — calling any GL method on them will SIGSEGV. Just clear the pool.
  if (contextsPurgedForBackground) {
    contextPool.length = 0;
    return;
  }
  for (const entry of contextPool) {
    invalidateContext(entry.gl);
    try {
      const ext = entry.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    } catch {}
  }
  contextPool.length = 0;
}

function isGLContextLost(gl: WebGL2RenderingContext): boolean {
  // Check the background-purge flag FIRST — if the app was backgrounded,
  // the GL context may have been purged by the WebView and calling
  // gl.isContextLost() on it will SIGSEGV before this try-catch can help.
  if (contextsPurgedForBackground) return true;
  if (glContextLostGlobal) return true;
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

function getContextState(gl: WebGL2RenderingContext): GLContextState {
  let state = contextState.get(gl);
  if (!state) {
    state = { programs: new Map(), quadBuffer: null };
    contextState.set(gl, state);
  }
  return state;
}

function ensureQuad(gl: WebGL2RenderingContext): WebGLBuffer {
  const state = getContextState(gl);
  if (state.quadBuffer) return state.quadBuffer;
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before buffer creation');
  const buf = gl.createBuffer();
  if (!buf) throw new Error('WebGL context lost: createBuffer returned null');
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  state.quadBuffer = buf;
  return buf;
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
    const adaptive = getAdaptiveRenderParams();
    const { width: scaledW, height: scaledH, scale } =
      computeScaledDimensions(w, h, adaptive.maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = scaledW;
    canvas.height = scaledH;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    if (isGLContextLost(gl)) {
      try { const ext = gl.getExtension('WEBGL_lose_context'); ext?.loseContext(); } catch {}
      return null;
    }
    registerContext(gl, canvas);
    if (scale < 1) {
      addBreadcrumb('gl', `Canvas downscaled ${w}x${h} → ${scaledW}x${scaledH}`, 'warning', { reason: adaptive.reason });
    }
    return { gl, canvas, scale };
  } catch {
    return null;
  }
}

function getProgram(gl: WebGL2RenderingContext, key: string, fragSrc: string): WebGLProgram {
  if (isGLContextLost(gl)) throw new Error('WebGL context lost before program creation');
  const state = getContextState(gl);
  let program = state.programs.get(key);
  if (!program) {
    program = createProgram(gl, fragSrc);
    state.programs.set(key, program);
  }
  return program;
}

type GLRenderResult = { canvas: HTMLCanvasElement } | null;

function safeGLRender(
  ctx: GLContext | null,
  fn: (gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) => void,
): GLRenderResult {
  if (!ctx) return null;
  const { gl, canvas } = ctx;

  // Check purge flag before any GL method call — isGLContextLost calls
  // gl.isContextLost() which SIGSEGVs on a purged context.
  if (contextsPurgedForBackground || glContextLostGlobal || isGLContextLost(gl)) {
    invalidateContext(gl);
    releaseContext(gl);
    return null;
  }

  try {
    fn(gl, canvas);

    if (isGLContextLost(gl)) {
      invalidateContext(gl);
      releaseContext(gl);
      return null;
    }

    const result = { canvas };
    releaseContext(gl);
    return result;
  } catch (err) {
    invalidateContext(gl);
    releaseContext(gl);
    contextLostCount++;
    setMemoryPressure('severe', 'gl-context-loss');
    logError(err, { component: 'glRenderer', action: 'safeGLRender' });
    if (contextLostCount <= 3) {
      addBreadcrumb('gl', `WebGL render failed (count: ${contextLostCount})`, 'error');
    }
    return null;
  }
}

function invalidateContext(gl: WebGL2RenderingContext): void {
  const state = contextState.get(gl);
  if (state) {
    for (const program of state.programs.values()) {
      try { gl.deleteProgram(program); } catch {}
    }
    state.programs.clear();
    if (state.quadBuffer) {
      try { gl.deleteBuffer(state.quadBuffer); } catch {}
      state.quadBuffer = null;
    }
    contextState.delete(gl);
  }
}

export function glBuildMask(
  imageCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  threshold = 0.5,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
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
    gl.viewport(0, 0, canvas.width, canvas.height);
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

export function glApplyAlphaMask(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
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

export function glCheckerAlphaMask(
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const ctx = getGLCanvas(width, height);
  return safeGLRender(ctx, (gl, canvas) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = getProgram(gl, 'checkerAlpha', CHECKER_ALPHA_FRAG);
    const maskTex = createTexture(gl, maskCanvas, width, height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_mask'), 0);
    drawQuad(gl, program);
    gl.deleteTexture(maskTex);
  })?.canvas ?? null;
}

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
    gl.viewport(0, 0, canvas.width, canvas.height);
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
 * Tile height for chunked CPU fallback rendering.
 * Processing in 256-row strips keeps each getImageData/putImageData call
 * small enough that the browser can composite intermediate results,
 * eliminating the 1-2 frame jank that occurs when the full image is
 * processed in a single synchronous pass after GPU context loss.
 */
const CHUNK_TILE_HEIGHT = 256;

/**
 * Processes a canvas pixel operation in horizontal tile strips.
 * Each strip gets its own getImageData/putImageData cycle, which is
 * faster than one massive call on large images and lets the browser
 * composite partial results between strips.
 *
 * The `processStrip` callback receives a Uint8ClampedArray for the
 * current strip and should mutate it in place.
 */
export function cpuChunkedProcess(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  processStrip: (data: Uint8ClampedArray, stripY: number, stripH: number) => void,
): HTMLCanvasElement | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  const ctx = source.getContext('2d');
  if (!ctx) return null;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;

  for (let y = 0; y < height; y += CHUNK_TILE_HEIGHT) {
    // OOM guard: check memory pressure between tile strips. On a large
    // image, the accumulated ImageData buffers can exceed the JS heap
    // limit mid-loop, crashing the tab. Abort and return null so the
    // caller can fall back to a lower-resolution path.
    if (detectRuntimePressure() === 'severe') {
      addBreadcrumb('gl', `cpuChunkedProcess aborted at y=${y}/${height} due to severe memory pressure`, 'error');
      return null;
    }
    const stripH = Math.min(CHUNK_TILE_HEIGHT, height - y);
    const imageData = ctx.getImageData(0, y, width, stripH);
    processStrip(imageData.data, y, stripH);
    outCtx.putImageData(imageData, 0, y);
  }

  return out;
}

/**
 * Chunked CPU fallback for mask building (alpha → black/white threshold).
 * Replaces the full-image for-loop with per-tile processing.
 */
export function cpuBuildMask(
  alphaCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  threshold = 0.5,
): HTMLCanvasElement | null {
  const thresholdByte = threshold * 255;
  return cpuChunkedProcess(alphaCanvas, width, height, (data) => {
    for (let i = 0; i < data.length; i += 4) {
      const keep = data[i + 3] >= thresholdByte ? 255 : 0;
      data[i] = keep;
      data[i + 1] = keep;
      data[i + 2] = keep;
      data[i + 3] = 255;
    }
  });
}

/**
 * Chunked CPU fallback for overlay composite (red tint on removed areas).
 */
export function cpuOverlayComposite(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  overlayColor: [number, number, number],
  overlayAlpha: number,
): HTMLCanvasElement | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  const imgCtx = imageCanvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  if (!imgCtx || !maskCtx) return null;

  const [r, g, b] = overlayColor;
  const alphaByte = Math.round(overlayAlpha * 255);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;

  for (let y = 0; y < height; y += CHUNK_TILE_HEIGHT) {
    const stripH = Math.min(CHUNK_TILE_HEIGHT, height - y);
    const imgData = imgCtx.getImageData(0, y, width, stripH);
    const maskData = maskCtx.getImageData(0, y, width, stripH);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const isRemoved = maskData.data[i] < 128;
      if (isRemoved) {
        imgData.data[i] = Math.round(r * 255);
        imgData.data[i + 1] = Math.round(g * 255);
        imgData.data[i + 2] = Math.round(b * 255);
        imgData.data[i + 3] = alphaByte;
      }
    }
    outCtx.putImageData(imgData, 0, y);
  }

  return out;
}

/**
 * Chunked CPU fallback for applying mask as alpha channel.
 */
export function cpuApplyAlphaMask(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  const imgCtx = imageCanvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  if (!imgCtx || !maskCtx) return null;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;

  for (let y = 0; y < height; y += CHUNK_TILE_HEIGHT) {
    const stripH = Math.min(CHUNK_TILE_HEIGHT, height - y);
    const imgData = imgCtx.getImageData(0, y, width, stripH);
    const maskData = maskCtx.getImageData(0, y, width, stripH);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i + 3] = maskData.data[i];
    }
    outCtx.putImageData(imgData, 0, y);
  }

  return out;
}

/**
 * Chunked CPU fallback for checker alpha mask (alpha = removed areas).
 */
export function cpuCheckerAlphaMask(
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  return cpuChunkedProcess(maskCanvas, width, height, (data) => {
    for (let i = 0; i < data.length; i += 4) {
      const isRemoved = data[i] < 128;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = isRemoved ? 255 : 0;
    }
  });
}

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

export function isGLContextLostGlobally(): boolean {
  return glContextLostGlobal;
}

export function attachWebGLContextLossHandler(
  canvas: HTMLCanvasElement,
  onRestoreCallback: () => void,
): () => void {
  if (Platform.OS !== 'web') return () => {};

  let restorationTimer: ReturnType<typeof setTimeout> | null = null;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    glContextLostGlobal = true;
    contextLostCount++;
    setMemoryPressure('severe', 'webglcontextlost-event');
    addBreadcrumb('gl', `WebGL context lost (count: ${contextLostCount})`, 'error');
    if (contextLostCount <= 3) {
      logError('WebGL context lost — falling back to CPU rendering', { component: 'glRenderer', action: 'contextLost' });
    }
  };

  const handleContextRestored = () => {
    glContextLostGlobal = false;
    onRestoreCallback();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  // If the browser does not auto-restore within 3 seconds, clear the global
  // flag so new GL contexts can be created. The display canvas's own context
  // is already dead and will be recreated by the caller's onRestoreCallback;
  // blocking all GPU paths permanently (as on many mobile browsers that never
  // fire webglcontextrestored) leaves the app stuck on the CPU path forever.
  const lossListenerWithTimeout = (event: Event) => {
    handleContextLost(event);
    if (restorationTimer) clearTimeout(restorationTimer);
    restorationTimer = setTimeout(() => {
      if (glContextLostGlobal) {
        glContextLostGlobal = false;
        onRestoreCallback();
      }
    }, 3000);
  };

  canvas.removeEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextlost', lossListenerWithTimeout, false);

  return () => {
    if (restorationTimer) clearTimeout(restorationTimer);
    canvas.removeEventListener('webglcontextlost', lossListenerWithTimeout);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  };
}
