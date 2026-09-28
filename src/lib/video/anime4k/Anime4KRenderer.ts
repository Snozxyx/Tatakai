// Anime4KRenderer — a faithful WebGL2 port of the Anime4K MPV user-shaders.
//
// This runs bloc97's Anime4K CNN GLSL shaders (https://github.com/bloc97/Anime4K,
// MIT) directly in a WebGL2 context by emulating the MPV "user shader" hook
// pipeline: each `.glsl` file is a chain of passes, every pass renders a
// full-screen quad into an offscreen float texture (or back into MAIN), and
// intermediate passes read the textures saved by earlier passes.
//
// The GLSL bodies are used verbatim; this module only generates the per-pass
// header (version, precision, samplers, size uniforms, and the `*_texOff` /
// `*_tex` / `*_pos` accessor macros) and a `void main()` footer that calls the
// shader's own `vec4 hook()`.
//
// Nothing here touches the React/video layers — construct it with a <video> and
// a <canvas>, call setMode()/start()/stop()/destroy().

import { parseMpvShader, evalSizeExpr, type Pass, type TexSize } from "./mpvShaderParser";

import restoreCnnS from "./shaders/Anime4K_Restore_CNN_S.glsl?raw";
import restoreCnnM from "./shaders/Anime4K_Restore_CNN_M.glsl?raw";
import upscaleCnnX2S from "./shaders/Anime4K_Upscale_CNN_x2_S.glsl?raw";
import upscaleCnnX2M from "./shaders/Anime4K_Upscale_CNN_x2_M.glsl?raw";

export type Anime4KMode = "off" | "light" | "standard" | "high";

/** Preset -> ordered list of shader-file sources whose passes are concatenated. */
const PRESET_SOURCES: Record<Exclude<Anime4KMode, "off">, readonly string[]> = {
  light: [restoreCnnS],
  standard: [restoreCnnM, upscaleCnnX2S],
  high: [restoreCnnM, upscaleCnnX2M],
};

const MAIN = "MAIN";

/** A pass compiled into a linked GL program plus its cached uniform locations. */
interface CompiledPass {
  readonly pass: Pass;
  readonly program: WebGLProgram;
  /** Per-bound-texture uniform locations (sampler + size + pt). */
  readonly binds: ReadonlyArray<{
    readonly name: string;
    readonly sampler: WebGLUniformLocation | null;
    readonly size: WebGLUniformLocation | null;
    readonly pt: WebGLUniformLocation | null;
  }>;
}

/** An offscreen render target: an RGBA16F texture wrapped in a framebuffer. */
interface RenderTarget {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

const VERTEX_SHADER = `#version 300 es
// Attribute-less full-screen triangle. v_texCoord spans [0,1] with (0,0) at the
// texel that maps to NDC (-1,-1); this keeps texture space y-up-consistent with
// the uploaded frame across every pass.
out vec2 v_texCoord;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_texCoord = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Passthrough used for 'off' mode and the final blit to the canvas. The video /
// intermediate textures store row 0 = image top; the canvas' NDC is y-up, so we
// flip v here to present the image right-way-up.
const PASSTHROUGH_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_tex;
void main() {
  fragColor = texture(u_tex, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
}
`;

export class Anime4KRenderer {
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;

  private mode: Anime4KMode = "off";
  private running = false;

  // Compiled chain for the active (non-off) mode.
  private chain: CompiledPass[] = [];
  private buildFailed = false;

  // Permanently disabled (e.g. the <video> is CORS-tainted and can never be
  // sampled by WebGL). Unlike buildFailed, this stops the loop entirely and is
  // reported to the consumer so it can hide the (now useless) canvas overlay.
  private disabled = false;
  private disabledReason: string | null = null;
  private onDisabled: ((reason: string) => void) | null = null;

  // Shared GL objects.
  private vao: WebGLVertexArrayObject | null = null;
  private passthroughProgram: WebGLProgram | null = null;
  private passthroughTexLoc: WebGLUniformLocation | null = null;

  // The uploaded video frame (RGBA8), sampled as MAIN by the first passes.
  private inputTex: WebGLTexture | null = null;
  private inputW = 0;
  private inputH = 0;

  // Ping-pong pair of RGBA16F targets used whenever a pass saves to MAIN.
  private mainFloat: [RenderTarget | null, RenderTarget | null] = [null, null];
  // Named intermediate targets (conv2d_tf, conv2d_last_tf, ...).
  private named = new Map<string, RenderTarget>();

  // Loop handles.
  private rafId = 0;
  private rvfcId = 0;
  private useRvfc = false;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.video = video;
    this.canvas = canvas;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      }) as WebGL2RenderingContext | null;
    } catch {
      gl = null;
    }
    this.gl = gl;

    if (gl) {
      // CNN intermediates need float render targets.
      gl.getExtension("EXT_color_buffer_float");
      this.vao = gl.createVertexArray();
      this.passthroughProgram = this.linkProgram(VERTEX_SHADER, PASSTHROUGH_FRAGMENT);
      if (this.passthroughProgram) {
        this.passthroughTexLoc = gl.getUniformLocation(this.passthroughProgram, "u_tex");
      }
      this.useRvfc = typeof (video as unknown as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback === "function";
    }
  }

  /** True when this environment supports the WebGL2 + float-render-target stack. */
  static isSupported(): boolean {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      if (!gl) return false;
      return gl.getExtension("EXT_color_buffer_float") !== null;
    } catch {
      return false;
    }
  }

  /** True when a non-off mode is selected and the loop is running. */
  get active(): boolean {
    return this.mode !== "off" && this.running && !!this.gl;
  }

  /** True once the renderer has permanently disabled itself for this source. */
  get isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Register a callback fired once if the renderer permanently disables itself
   * (e.g. the video frame is cross-origin and WebGL can't sample it). If it is
   * already disabled, the callback fires immediately.
   */
  setDisabledCallback(cb: (reason: string) => void): void {
    this.onDisabled = cb;
    if (this.disabled && this.disabledReason) cb(this.disabledReason);
  }

  /**
   * Clear a permanent-disable so the loop can run again. Called by the consumer
   * on a source change — a new stream may not be CORS-tainted like the last one.
   */
  resetDisabled(): void {
    this.disabled = false;
    this.disabledReason = null;
  }

  /** Rebuild the pass chain for `mode`. 'off' clears the chain (passthrough blit). */
  setMode(mode: Anime4KMode): void {
    if (mode === this.mode && (mode === "off" || this.chain.length > 0 || this.buildFailed)) {
      return;
    }
    this.mode = mode;
    this.disposeChain();
    this.buildFailed = false;

    if (mode === "off" || !this.gl) {
      return;
    }

    const passes = this.buildPassList(mode);
    try {
      this.chain = this.compileChain(passes);
      if (this.chain.length === 0) this.buildFailed = true;
    } catch (err) {
      console.warn("[Anime4K] failed to build pass chain, falling back to passthrough:", err);
      this.disposeChain();
      this.buildFailed = true;
    }
  }

  /** Begin the render loop (requestVideoFrameCallback when available, else rAF). */
  start(): void {
    if (this.running || !this.gl) return;
    this.running = true;
    this.scheduleNext();
  }

  /** Pause the render loop. */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.rvfcId) {
      const cancel = (this.video as unknown as {
        cancelVideoFrameCallback?: (id: number) => void;
      }).cancelVideoFrameCallback;
      if (typeof cancel === "function") cancel.call(this.video, this.rvfcId);
      this.rvfcId = 0;
    }
  }

  /** Delete every GL resource and detach callbacks. Safe to call repeatedly. */
  destroy(): void {
    this.stop();
    const gl = this.gl;
    if (!gl) return;
    this.disposeChain();
    if (this.inputTex) {
      gl.deleteTexture(this.inputTex);
      this.inputTex = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    if (this.passthroughProgram) {
      gl.deleteProgram(this.passthroughProgram);
      this.passthroughProgram = null;
    }
  }

  // --- internal: pass-list assembly ---------------------------------------

  private buildPassList(mode: Exclude<Anime4KMode, "off">): Pass[] {
    const out: Pass[] = [];
    for (const src of PRESET_SOURCES[mode]) {
      for (const p of parseMpvShader(src)) out.push(p);
    }
    return out;
  }

  // --- internal: compilation ----------------------------------------------

  private compileChain(passes: Pass[]): CompiledPass[] {
    const gl = this.gl;
    if (!gl) return [];
    const compiled: CompiledPass[] = [];
    for (const pass of passes) {
      const fragment = this.buildFragmentSource(pass);
      const program = this.linkProgram(VERTEX_SHADER, fragment);
      if (!program) {
        throw new Error(`pass "${pass.desc}" failed to compile/link`);
      }
      const binds = pass.binds.map((name) => ({
        name,
        sampler: gl.getUniformLocation(program, `${name}_sampler`),
        size: gl.getUniformLocation(program, `${name}_size`),
        pt: gl.getUniformLocation(program, `${name}_pt`),
      }));
      compiled.push({ pass, program, binds });
    }
    return compiled;
  }

  /**
   * Assemble the WebGL2 fragment shader for a pass: a generated preamble
   * (samplers + size uniforms + accessor macros, with HOOKED_* aliased to MAIN)
   * followed by the shader's verbatim body and a `main()` that calls hook().
   */
  private buildFragmentSource(pass: Pass): string {
    const header: string[] = [
      "#version 300 es",
      "precision highp float;",
      "precision highp sampler2D;",
      "in vec2 v_texCoord;",
      "out vec4 fragColor;",
    ];

    for (const name of pass.binds) {
      header.push(`uniform sampler2D ${name}_sampler;`);
      header.push(`uniform vec2 ${name}_size;`);
      header.push(`uniform vec2 ${name}_pt;`);
      header.push(`#define ${name}_texOff(off) texture(${name}_sampler, v_texCoord + (off) * ${name}_pt)`);
      header.push(`#define ${name}_tex(p) texture(${name}_sampler, p)`);
      header.push(`#define ${name}_pos v_texCoord`);
    }

    // HOOKED_* is an alias for the hooked texture, which is MAIN for Anime4K.
    if (pass.binds.includes(MAIN)) {
      header.push(`#define HOOKED_texOff(off) MAIN_texOff(off)`);
      header.push(`#define HOOKED_tex(p) MAIN_tex(p)`);
      header.push(`#define HOOKED_pos MAIN_pos`);
      header.push(`#define HOOKED_size MAIN_size`);
      header.push(`#define HOOKED_pt MAIN_pt`);
    }

    return `${header.join("\n")}\n${pass.body}\nvoid main() { fragColor = hook(); }\n`;
  }

  // --- internal: per-frame rendering --------------------------------------

  private renderFrame(): void {
    const gl = this.gl;
    if (!gl || this.disabled) return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0 || this.video.readyState < 2) return;

    this.uploadFrame(vw, vh);
    if (this.disabled) return; // uploadFrame hit a fatal (tainted) frame

    // Passthrough when off, unbuilt, or a build failed — always safe.
    if (this.mode === "off" || this.chain.length === 0 || this.buildFailed) {
      this.blitToCanvas(this.inputTex, vw, vh);
      return;
    }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    // Track current texture sizes so WIDTH/HEIGHT expressions can reference them.
    const sizes: Record<string, TexSize> = { [MAIN]: { w: vw, h: vh } };

    // Current MAIN read source starts as the uploaded video frame.
    let mainReadTex: WebGLTexture | null = this.inputTex;
    let mainReadW = vw;
    let mainReadH = vh;
    let mainFloatIdx = 0; // which ping-pong slot to render into next for a MAIN save.

    for (const cp of this.chain) {
      const { pass } = cp;
      const targetW = evalSizeExpr(pass.width, sizes);
      const targetH = evalSizeExpr(pass.height, sizes);

      // Resolve the render target.
      let target: RenderTarget;
      const savesToMain = pass.save === null || pass.save === MAIN;
      if (savesToMain) {
        // Render into the ping-pong slot that is NOT the current read source.
        target = this.getMainFloat(mainFloatIdx, targetW, targetH);
      } else {
        target = this.getNamed(pass.save as string, targetW, targetH);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
      gl.useProgram(cp.program);

      // Detach any previously-bound samplers to avoid stale feedback bindings.
      for (let u = 0; u < 8; u++) {
        gl.activeTexture(gl.TEXTURE0 + u);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      cp.binds.forEach((b, unit) => {
        let tex: WebGLTexture | null;
        let bw: number;
        let bh: number;
        if (b.name === MAIN) {
          tex = mainReadTex;
          bw = mainReadW;
          bh = mainReadH;
        } else {
          const src = this.named.get(b.name);
          tex = src ? src.tex : null;
          bw = src ? src.w : 1;
          bh = src ? src.h : 1;
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (b.sampler) gl.uniform1i(b.sampler, unit);
        if (b.size) gl.uniform2f(b.size, bw, bh);
        if (b.pt) gl.uniform2f(b.pt, 1 / bw, 1 / bh);
      });

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Record the produced size.
      if (savesToMain) {
        sizes[MAIN] = { w: target.w, h: target.h };
        mainReadTex = target.tex;
        mainReadW = target.w;
        mainReadH = target.h;
        mainFloatIdx = 1 - mainFloatIdx; // next MAIN save uses the other slot.
      } else {
        sizes[pass.save as string] = { w: target.w, h: target.h };
      }
    }

    this.blitToCanvas(mainReadTex, mainReadW, mainReadH);
  }

  private uploadFrame(vw: number, vh: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (!this.inputTex) {
      this.inputTex = gl.createTexture();
      this.inputW = 0;
      this.inputH = 0;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (vw !== this.inputW || vh !== this.inputH) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.inputW = vw;
      this.inputH = vh;
    }
    // texImage2D(video) re-specifies each frame; robust across browsers.
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    } catch (err) {
      // A CORS-tainted <video> throws SecurityError here — and would on every
      // subsequent frame. WebGL simply cannot sample this source, so disable
      // permanently and log once instead of spamming the console per frame.
      if (err instanceof DOMException && err.name === "SecurityError") {
        this.disablePermanently(
          "video frame is cross-origin and cannot be sampled by WebGL",
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Stop the loop and mark the renderer permanently disabled for this source.
   * Logs once and notifies the consumer so it can hide the canvas overlay and
   * let the raw <video> show through.
   */
  private disablePermanently(reason: string): void {
    if (this.disabled) return;
    this.disabled = true;
    this.disabledReason = reason;
    console.warn(`[Anime4K] disabled: ${reason}`);
    this.stop();
    this.onDisabled?.(reason);
  }

  private blitToCanvas(tex: WebGLTexture | null, w: number, h: number): void {
    const gl = this.gl;
    if (!gl || !this.passthroughProgram || !tex) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.passthroughProgram);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.passthroughTexLoc) gl.uniform1i(this.passthroughTexLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // --- internal: render-target management ---------------------------------

  private getMainFloat(idx: number, w: number, h: number): RenderTarget {
    const existing = this.mainFloat[idx];
    if (existing && existing.w === w && existing.h === h) return existing;
    if (existing) this.deleteTarget(existing);
    const rt = this.createTarget(w, h);
    this.mainFloat[idx] = rt;
    return rt;
  }

  private getNamed(name: string, w: number, h: number): RenderTarget {
    const existing = this.named.get(name);
    if (existing && existing.w === w && existing.h === h) return existing;
    if (existing) this.deleteTarget(existing);
    const rt = this.createTarget(w, h);
    this.named.set(name, rt);
    return rt;
  }

  private createTarget(w: number, h: number): RenderTarget {
    const gl = this.gl;
    if (!gl) throw new Error("no GL context");
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // RGBA16F: CNN activations are signed and can exceed [0,1]; 8-bit would clip.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      throw new Error(`framebuffer incomplete (0x${status.toString(16)}) at ${w}x${h}`);
    }
    return { tex: tex as WebGLTexture, fbo: fbo as WebGLFramebuffer, w, h };
  }

  private deleteTarget(rt: RenderTarget): void {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteTexture(rt.tex);
    gl.deleteFramebuffer(rt.fbo);
  }

  private disposeChain(): void {
    const gl = this.gl;
    if (gl) {
      for (const cp of this.chain) gl.deleteProgram(cp.program);
      for (const rt of this.named.values()) this.deleteTarget(rt);
      for (const rt of this.mainFloat) if (rt) this.deleteTarget(rt);
    }
    this.chain = [];
    this.named.clear();
    this.mainFloat = [null, null];
  }

  // --- internal: loop scheduling ------------------------------------------

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.useRvfc) {
      const rvfc = (this.video as unknown as {
        requestVideoFrameCallback: (cb: () => void) => number;
      }).requestVideoFrameCallback;
      this.rvfcId = rvfc.call(this.video, () => this.onFrame());
    } else {
      this.rafId = requestAnimationFrame(() => this.onFrame());
    }
  }

  private onFrame(): void {
    if (!this.running) return;
    try {
      this.renderFrame();
    } catch (err) {
      // Never throw out of the loop; drop to passthrough and keep going.
      console.warn("[Anime4K] render error, falling back to passthrough:", err);
      this.buildFailed = true;
      try {
        this.blitToCanvas(this.inputTex, this.inputW, this.inputH);
      } catch {
        /* ignore */
      }
    }
    this.scheduleNext();
  }

  // --- internal: GL program helpers ---------------------------------------

  private linkProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const gl = this.gl;
    if (!gl) return null;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Shaders can be detached/deleted after link.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[Anime4K] program link failed:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private compileShader(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("[Anime4K] shader compile failed:", gl.getShaderInfoLog(shader), "\n", src);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
