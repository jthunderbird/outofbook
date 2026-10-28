// Ways of drawing the whole picture, collected as modes (Retro mode's pixel
// look lives in scene.ts with its own camera): Noir, a black-and-white film
// with grain and a vignette; Sketch, pencil lines and hatching on paper. Each
// is one full-screen shader after the scene is drawn, so they cost the same
// on every tribe and court.

/** The modes beside Retro, by id; their names are the app's. */
export const MODES = ["noir", "sketch"] as const;
export type Mode = (typeof MODES)[number];

const VERTEX = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";

export function modeShader(mode: Mode) {
  return {
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, texel: { value: [1 / 1024, 1 / 1024] } },
    vertexShader: VERTEX,
    fragmentShader: mode === "noir" ? NOIR : SKETCH,
  };
}

const NOIR = `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // Hard film contrast, a silver tone, grain that moves and a dark edge.
    l = smoothstep(0.06, 0.9, l);
    l += (hash(vUv * 900.0 + fract(time) * 37.0) - 0.5) * 0.09;
    vec2 d = vUv - 0.5;
    l *= 1.0 - dot(d, d) * 1.5;
    gl_FragColor = vec4(vec3(l) * vec3(1.0, 0.98, 0.93), c.a);
  }`;

const SKETCH = `uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
  float lum(vec2 uv){ return dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114)); }
  void main(){
    // Pencil lines where the picture's light changes sharply (Sobel), hatching where it is dark.
    vec2 t = texel * 1.5;
    float tl = lum(vUv + vec2(-t.x, t.y)), tc = lum(vUv + vec2(0.0, t.y)), tr = lum(vUv + t);
    float ml = lum(vUv - vec2(t.x, 0.0)), mr = lum(vUv + vec2(t.x, 0.0));
    float bl = lum(vUv - t), bc = lum(vUv - vec2(0.0, t.y)), br = lum(vUv + vec2(t.x, -t.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = smoothstep(0.12, 0.45, length(vec2(gx, gy)));
    float l = lum(vUv);
    vec2 p = gl_FragCoord.xy;
    float h1 = step(0.5, fract((p.x + p.y) / 7.0));
    float h2 = step(0.5, fract((p.x - p.y) / 7.0));
    float hatch = (l < 0.42 ? h1 * 0.35 : 0.0) + (l < 0.2 ? h2 * 0.35 : 0.0);
    float ink = clamp(edge + hatch, 0.0, 1.0);
    vec3 paper = vec3(0.96, 0.93, 0.86);
    vec3 graphite = vec3(0.22, 0.22, 0.26);
    gl_FragColor = vec4(mix(paper, graphite, ink), 1.0);
  }`;
