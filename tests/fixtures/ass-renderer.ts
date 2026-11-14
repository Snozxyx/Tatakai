import { createAssRenderer, type AssRendererHandle } from '../../src/core/player/ass-renderer';
let renderer: AssRendererHandle;
let script: string;
Object.assign(window,{assCheck:{
  async load() {
    script=await (await fetch('/fixture.ass')).text();
    renderer=await createAssRenderer({host:document.getElementById('stage')!,content:script,assetBase:new URL('/assets/libass/',location.href).href,fonts:[new URL('/assets/libass/default.woff2',location.href).href]});
    await this.frame(0);
  },
  async frame(time:number) { await renderer.render(time,640,360); },
  async offset(seconds:number,time:number) {renderer.setOffset(seconds);await this.frame(time);},
  async clear() {renderer.destroy();},
  async packets() {
    renderer.destroy();
    const header=script.slice(0,script.indexOf('Dialogue:'));
    renderer=await createAssRenderer({host:document.getElementById('stage')!,content:header,assetBase:new URL('/assets/libass/',location.href).href,fonts:[new URL('/assets/libass/default.woff2',location.href).href]});
    await renderer.setTrack(script);await this.frame(2);
  },
}});
