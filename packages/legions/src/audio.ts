// The page's one audio context, shared by the board's sounds and the app's own
// (phones allow audio only after a tap resumes it, so one context is resumed once).
let ctx: AudioContext | null = null;
export function audioContext() {
  ctx ??= new AudioContext();
  return ctx;
}
