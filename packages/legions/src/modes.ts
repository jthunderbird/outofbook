// Skins (modes): ways of drawing the tribes, collected in the Collection.
// Retro draws them as a 16-bit game would (low resolution, a 5-bit palette);
// Noir as a black-and-white film with grain; Sketch in pencil on paper. A skin
// changes the figures only: the board and its scenery stay as they are (each
// skin has its own court to match).
//
// SkinPass draws a frame in three steps: the scene with the figures there for
// shadows but not seen; the world's depth and then the figures alone, into a
// picture of their own (low resolution for Retro); that picture, restyled,
// laid over the scene where the figures are.
import { Color, Material, MeshDepthMaterial, NearestFilter, ShaderMaterial, Vector2, WebGLRenderTarget, HalfFloatType, type Camera, type Light, type Scene, type WebGLRenderer } from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { Fig } from "./figures";

/** The skins beside Retro, by id; their names are the app's. */
export const MODES = ["noir", "sketch"] as const;
export type Mode = (typeof MODES)[number];
export type Skin = Mode | "retro";

/** The layer figures are on (as well as the usual one), for drawing them alone. */
export const FIGURE_LAYER = 1;

const VERTEX = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";

const STYLE: Record<Skin, string> = {
  // Five bits a channel with a light ordered dither, as a 16-bit display would show it.
  retro: `
    float d = (fract(dot(floor(vUv * size), vec2(0.5, 0.25))) - 0.375) / 32.0;
    s = floor((s + d) * 31.0 + 0.5) / 31.0;`,
  // Hard film contrast, a silver tone, grain that moves.
  noir: `
    float l = smoothstep(0.04, 0.85, dot(s, vec3(0.299, 0.587, 0.114)));
    l += (hash(gl_FragCoord.xy + fract(time) * 97.0) - 0.5) * 0.12;
    s = vec3(l) * vec3(1.0, 0.98, 0.93);`,
  // Pencil: lines where the light changes sharply and round the outline, hatching in the shade, on paper.
  sketch: `
    vec2 t = 1.5 / size;
    float tl = lumA(vUv + vec2(-t.x, t.y)), tc = lumA(vUv + vec2(0.0, t.y)), tr = lumA(vUv + t);
    float ml = lumA(vUv - vec2(t.x, 0.0)), mr = lumA(vUv + vec2(t.x, 0.0));
    float bl = lumA(vUv - t), bc = lumA(vUv - vec2(0.0, t.y)), br = lumA(vUv + vec2(t.x, -t.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = smoothstep(0.1, 0.4, length(vec2(gx, gy)));
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    vec2 p = gl_FragCoord.xy;
    float h1 = step(0.5, fract((p.x + p.y) / 6.0));
    float h2 = step(0.5, fract((p.x - p.y) / 6.0));
    float ink = clamp(edge + (l < 0.45 ? h1 * 0.35 : 0.0) + (l < 0.22 ? h2 * 0.35 : 0.0), 0.0, 1.0);
    s = mix(vec3(0.96, 0.93, 0.86), vec3(0.2, 0.2, 0.24), ink);`,
};

function composite(skin: Skin) {
  return new ShaderMaterial({
    uniforms: { tBase: { value: null }, tFig: { value: null }, size: { value: new Vector2(1, 1) }, time: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: `uniform sampler2D tBase; uniform sampler2D tFig; uniform vec2 size; uniform float time; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      // Brightness with the outline counted in (no figure: bright), for the sketch's lines.
      float lumA(vec2 uv){ vec4 c = texture2D(tFig, uv); return dot(pow(max(c.rgb, 0.0), vec3(1.0 / 2.2)), vec3(0.299, 0.587, 0.114)) * c.a + (1.0 - c.a) * 1.5; }
      void main(){
        vec4 base = texture2D(tBase, vUv);
        vec4 f = texture2D(tFig, vUv);
        if (f.a <= 0.001) { gl_FragColor = base; return; }
        // Styled in display terms, then back to the scene's linear light.
        vec3 s = pow(max(f.rgb / max(f.a, 0.001), 0.0), vec3(1.0 / 2.2));
        ${STYLE[skin]}
        gl_FragColor = vec4(mix(base.rgb, pow(s, vec3(2.2)), f.a), base.a);
      }`,
  });
}

/** Draws the scene with a skin on its figures (in place of the composer's RenderPass). */
export class SkinPass extends Pass {
  private rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  private depth = new MeshDepthMaterial();
  private quad: FullScreenQuad;
  private mat: ShaderMaterial;
  private clearWas = new Color(0, 0, 0);

  constructor(
    private scene: Scene,
    private camera: Camera,
    private figs: () => Iterable<Fig>,
    private skin: Skin,
  ) {
    super();
    this.needsSwap = true;
    this.depth.colorWrite = false;
    if (skin === "retro") this.rt.texture.minFilter = this.rt.texture.magFilter = NearestFilter;
    this.mat = composite(skin);
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number) {
    // Retro draws the figures 288 pixels tall, whatever the screen.
    const k = this.skin === "retro" ? Math.min(1, 288 / h) : 1;
    this.rt.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    this.mat.uniforms.size.value.set(this.rt.width, this.rt.height);
  }

  /** Advances the grain. */
  tick(ms: number) {
    this.mat.uniforms.time.value += ms / 1000;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const figs = [...this.figs()];
    const mats = [...new Set<Material>(figs.flatMap((f) => f.mats))];
    const scene = this.scene;
    const bg = scene.background;
    const autoClear = renderer.autoClear;
    const autoShadow = renderer.shadowMap.autoUpdate;
    const mask = this.camera.layers.mask;
    renderer.getClearColor(this.clearWas);
    const alpha = renderer.getClearAlpha();

    // 1. The scene: the figures cast their shadows but are not seen.
    const was = mats.map((m) => [m.colorWrite, m.depthWrite] as const);
    for (const m of mats) {
      m.colorWrite = false;
      m.depthWrite = false;
    }
    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    renderer.render(scene, this.camera);
    mats.forEach((m, i) => ([m.colorWrite, m.depthWrite] = was[i]));

    // 2. The world's depth (what may stand in front of a figure), then the figures alone.
    renderer.shadowMap.autoUpdate = false;
    for (const f of figs) f.root.visible = false;
    scene.background = null;
    scene.overrideMaterial = this.depth;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, this.camera);
    scene.overrideMaterial = null;
    for (const f of figs) f.root.visible = true;
    scene.traverse((o) => {
      if ((o as Light).isLight) o.layers.enable(FIGURE_LAYER);
    });
    this.camera.layers.set(FIGURE_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, this.camera);

    // Put everything back.
    this.camera.layers.mask = mask;
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = autoShadow;
    renderer.setClearColor(this.clearWas, alpha);
    scene.background = bg;

    // 3. The figures' picture, restyled, over the scene.
    this.mat.uniforms.tBase.value = readBuffer.texture;
    this.mat.uniforms.tFig.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.rt.dispose();
    this.depth.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
