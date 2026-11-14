import { createAssRenderer, type AssRendererHandle } from './ass-renderer';
declare global { interface Window {
  TatakaiAss: { load(content: string, fonts?: string[]): Promise<void>; append(packet: string): void; frame(time: number, width: number, height: number, playing?: boolean, rate?: number): void; clear(): void };
  AssBridge?: { ready(): void; error(message: string): void };
} }
let renderer: AssRendererHandle | undefined;
let request: AbortController | undefined;
let script = ''; const packets = new Set<string>();
let scheduled = 0;
let frame = { time:0, width:1920, height:1080, playing:false, rate:1, at:performance.now() };
let anim = 0;
const draw = () => {
  const time = frame.time + (frame.playing ? (performance.now()-frame.at)/1000 * frame.rate : 0);
  void renderer?.render(time, frame.width, frame.height).catch(error => window.AssBridge?.error(String(error)));
  anim = frame.playing ? requestAnimationFrame(draw) : 0;
};
window.TatakaiAss = {
  async load(content, fonts = []) {
    this.clear(); script = content;
    const controller = request = new AbortController();
    try {
      const next = await createAssRenderer({ host: document.getElementById('ass')!, content, fonts,
        assetBase: new URL('./', location.href).href, signal: controller.signal });
      if (controller.signal.aborted) { next.destroy(); return; }
      renderer = next;
      await renderer.setTrack(script + [...packets].join('\n'));
      if (!anim) draw();
    } catch (error) { if (!controller.signal.aborted) window.AssBridge?.error(String(error)); }
  },
  append(packet) {
    if (packets.has(packet)) return;
    packets.add(packet);
    if (!scheduled) scheduled = window.setTimeout(() => { scheduled=0; void renderer?.setTrack(script+'\n'+[...packets].join('\n')); }, 40);
  },
  frame(time, width, height, playing=false, rate=1) {
    frame = {time,width,height,playing,rate,at:performance.now()};
    if (!anim) draw();
  },
  clear() { request?.abort(); renderer?.destroy(); renderer=undefined; packets.clear(); script=''; clearTimeout(scheduled);scheduled=0;cancelAnimationFrame(anim);anim=0;document.getElementById('ass')!.replaceChildren(); },
};
window.AssBridge?.ready();
