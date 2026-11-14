import { parseAssEvents, assTimeMilliseconds } from './ass-events';

export interface AssRendererHandle {
  canvas: HTMLCanvasElement;
  setOffset(seconds: number): void;
  setTrack(content: string): Promise<void>;
  render(time: number, width: number, height: number): Promise<void>;
  destroy(): void;
}

/** Both backends use libass, with animation, blur and script styles enabled. */
export async function createAssRenderer(options: {
  host: HTMLElement; content: string; video?: HTMLVideoElement; fonts?: string[];
  offset?: number; assetBase: string; signal?: AbortSignal;
}): Promise<AssRendererHandle> {
  const url = (name: string) => new URL(name, options.assetBase).href;
  let offset=options.offset || 0;
  let lastFrame={mediaTime:0,width:1920,height:1080,expectedDisplayTime:performance.now()};
  const makeCanvas=()=>{
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;pointer-events:none;inset:0;width:100%;height:100%;';
    canvas.setAttribute('aria-hidden','true');options.host.append(canvas);return canvas;
  };
  const events=['seeked','loadedmetadata','pause','ratechange','canplay'];
  let canvas=makeCanvas();
  let modern: import('jassub').default | undefined;
  if(typeof OffscreenCanvas !== 'undefined' && canvas.transferControlToOffscreen){
    try{
      const {default:JASSUB}=await import('jassub');options.signal?.throwIfAborted();
      modern=new JASSUB({canvas,...(options.video?{video:options.video}:{}),subContent:options.content,
        fonts:options.fonts || [],timeOffset:offset,workerUrl:url('worker.js'),
        wasmUrl:url('jassub-worker.wasm'),modernWasmUrl:url('jassub-worker-modern.wasm'),
        wasmWorkerUrl:url('jassub-worker.js'),modernWasmWorkerUrl:url('jassub-worker-modern.js'),
        availableFonts:{'liberation sans':url('default.woff2')},queryFonts:false});
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('ASS renderer initialization timed out')),15000);
        const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
        options.signal?.addEventListener('abort',abort,{once:true});
        modern!.ready.then(()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);resolve();},error=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);reject(error);});
      });
      options.signal?.throwIfAborted();const renderer=modern;
      const repaint=()=>{
        const frame=options.video?{mediaTime:options.video.currentTime,width:options.video.videoWidth||1920,height:options.video.videoHeight||1080,expectedDisplayTime:performance.now()}:lastFrame;
        void renderer.manualRender(frame,true).catch(()=>{});
      };
      events.forEach(event=>options.video?.addEventListener(event,repaint));repaint();
      return {canvas,
        async setTrack(content){await renderer.renderer.setTrack(content);repaint();},
        setOffset(seconds){offset=seconds;renderer.timeOffset=seconds;repaint();},
        render(time,width,height){lastFrame={mediaTime:time,width,height,expectedDisplayTime:performance.now()};return renderer.manualRender(lastFrame);},
        destroy(){events.forEach(event=>options.video?.removeEventListener(event,repaint));void renderer.destroy().catch(()=>{});canvas.remove();}
      };
    }catch(error){
      console.warn('[ASS] Current renderer unavailable; using compatibility libass.',error);
      // Terminate failed worker initialization, whose remote promise may never settle.
      if(modern){modern._destroyed=true;modern._worker.terminate();modern._removeListeners();}
      canvas.remove();options.signal?.throwIfAborted();canvas=makeCanvas();
    }
  }
  const {default:Legacy}=await import('jassub-legacy');options.signal?.throwIfAborted();
  const renderer=new Legacy({canvas,...(options.video?{video:options.video}:{}),subContent:options.content,
    fonts:options.fonts||[],timeOffset:offset,workerUrl:url('legacy-worker.js'),wasmUrl:url('legacy-worker.wasm'),
    modernWasmUrl:url('legacy-worker-modern.wasm'),legacyWasmUrl:url('legacy-worker.wasm.js'),
    availableFonts:{'liberation sans':url('default.woff2')},dropAllAnimations:false,dropAllBlur:false,
    onDemandRender:!!options.video,targetFps:60,useLocalFonts:false});
  try{
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('ASS compatibility renderer initialization timed out')),15000);
      const finish=(error?:Error)=>{clearTimeout(timer);renderer.removeEventListener('ready',ready);renderer.removeEventListener('error',failed);options.signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
      const ready=()=>finish();const failed=(event:Event)=>finish(new Error((event as ErrorEvent).message||'ASS compatibility renderer failed'));
      const abort=()=>finish(new DOMException('Cancelled','AbortError'));
      renderer.addEventListener('ready',ready,{once:true});renderer.addEventListener('error',failed,{once:true});options.signal?.addEventListener('abort',abort,{once:true});
    });
    options.signal?.throwIfAborted();
  }catch(error){renderer.destroy();canvas.remove();throw error;}
  const repaint=()=>renderer.setCurrentTime(options.video?.paused??true,(options.video?.currentTime||lastFrame.mediaTime)+offset,options.video?.playbackRate||1);
  events.forEach(event=>options.video?.addEventListener(event,repaint));
  return {canvas,
    async setTrack(content){
      const styles=await new Promise<any[]>((resolve,reject)=>renderer.getStyles((error,value)=>error?reject(error):resolve(value)));
      const previous=await new Promise<any[]>((resolve,reject)=>renderer.getEvents((error,value)=>error?reject(error):resolve(value)));
      for(let i=previous.length-1;i>=0;i--)renderer.removeEvent(i);
      for(const [index,event] of parseAssEvents(content).entries()) {
        const start=assTimeMilliseconds(event.start);const end=assTimeMilliseconds(event.end);
        renderer.createEvent({Start:start,Duration:end-start,ReadOrder:Number(event.readorder||index),Layer:Number(event.layer||0),
          Style:Math.max(0,styles.map(style=>style.Name).lastIndexOf(event.style)),Name:event.name||'',Text:event.text||'',Effect:event.effect||'',
          MarginL:Number(event.marginl||0),MarginR:Number(event.marginr||0),MarginV:Number(event.marginv||0)} as any);
      }
      await new Promise<void>((resolve,reject)=>renderer.getEvents((error,value)=>{error?reject(error):resolve();}));
      repaint();
    },
    setOffset(seconds){offset=seconds;(renderer as unknown as {timeOffset:number}).timeOffset=seconds;repaint();},
    async render(time,width,height){
      lastFrame={mediaTime:time,width,height,expectedDisplayTime:performance.now()};
      if(!options.video){(renderer as any)._videoWidth=width;(renderer as any)._videoHeight=height;}
      if(options.video){renderer.setCurrentTime(true,time+offset,1);return;}
      await renderer.sendMessage('video',{isPaused:true,currentTime:time+offset,rate:1});
      await renderer.sendMessage('canvas',{width:canvas.clientWidth,height:canvas.clientHeight,videoWidth:width,videoHeight:height,force:true});
    },
    destroy(){events.forEach(event=>options.video?.removeEventListener(event,repaint));renderer.destroy();canvas.remove();}
  };
}
