import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { RtxFrameBudget, type RtxFrameResult, type RtxVideoBridge } from '@/lib/video/rtx-video';
import type { VideoEnhancementQuality } from '@/lib/video/enhancement-settings';

export function useRtxVideo(videoRef: RefObject<HTMLVideoElement>, enabled: boolean, quality: VideoEnhancementQuality, sourceKey: string | undefined) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasId = `rtx-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [status, setStatus] = useState('');
  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!enabled || !video || !canvas) { setStatus(''); return; }
    const bridge: RtxVideoBridge | undefined = window.electron?.rtxVideo;
    let disposed = false, stopped = false, session: string | undefined, generation = 0, inFlight = false, callback = 0;
    let pixels = new Uint8Array(0), lastFrameTime = 0, interval = 1000 / 24, skipped = 0;
    const budget = new RtxFrameBudget(quality);
    let lastReported = '', lastReportTime = 0;
    const report = (message: string) => {
      if (disposed) return;
      const now = performance.now();
      if (message.startsWith('RTX Video ·') && lastReported.startsWith('RTX Video ·') && now - lastReportTime < 1000) return;
      lastReported = message; lastReportTime = now;
      setStatus(message);
      window.dispatchEvent(new CustomEvent('tatakai-video-enhancement-status', { detail: message }));
    };
    const target = () => { if (session) bridge?.setTarget({ id: canvasId, session, generation }); };
    const hide = () => { canvas.style.display = 'none'; canvas.width = canvas.height = 1; delete canvas.dataset.rtxPresentedTimestamp; };
    const fail = (message: string) => {
      stopped = true; hide();
      if (session) { bridge?.setTarget({ id: null, session, generation }); void bridge?.stop(session).catch(() => {}); }
      report(`Showing original. ${message}`);
    };
    const invalidate = () => { generation++; hide(); target(); };
    const submit = async (timestamp: number) => {
      if (disposed || stopped || !session || video.seeking || video.readyState < 2) return;
      if (inFlight) { skipped++; return; }
      if (video.videoWidth > 1920 || video.videoHeight > 1080) { fail('RTX output is capped at 1080p on this build; this source already exceeds the cap.'); return; }
      const submittedGeneration = generation;
      inFlight = true;
      const started = performance.now();
      let frame: VideoFrame | undefined;
      try {
        let result: RtxFrameResult;
        if (bridge.captureFrame) result = await bridge.captureFrame({ session, generation: submittedGeneration, timestamp });
        else {
          frame = new VideoFrame(video, { timestamp: Math.round(timestamp * 1e6) });
          const size = frame.allocationSize({ format: 'BGRA' });
          if (pixels.byteLength !== size) pixels = new Uint8Array(size);
          await frame.copyTo(pixels, { format: 'BGRA' });
          frame.close(); frame = undefined;
          if (disposed || stopped || submittedGeneration !== generation) return;
          result = await bridge.frame({ session, generation: submittedGeneration, timestamp, width: video.videoWidth, height: video.videoHeight, bytes: pixels });
        }
        if (disposed || stopped || submittedGeneration !== generation) return;
        const action = budget.record(performance.now() - started, interval);
        if (action === 'disable') { fail('RTX processing cannot keep up with this video. Try Anime4K Light.'); return; }
        if (action === 'lower') {
          await bridge.configure(session, { quality: budget.quality, maxOutputHeight: 1080 });
          report(`RTX Video · ${budget.quality} · ${result.width} × ${result.height}. Quality reduced to keep playback smooth.`);
        } else if (Number(canvas.dataset.rtxPresentedTimestamp) !== timestamp) report('Showing original while RTX Video catches up.');
        else report(`RTX Video · ${budget.quality} · ${result.width} × ${result.height} · ${result.processingMs.toFixed(1)} ms · ${skipped} skipped${result.gpuMemoryBytes ? ` · ${Math.round(result.gpuMemoryBytes / 1024 / 1024)} MB GPU` : ''}`);
      } catch (error) {
        if (!disposed && !stopped && submittedGeneration === generation) fail(error instanceof DOMException && error.name === 'SecurityError' ? 'This source blocks frame access. Choose another source or turn enhancement off.' : error instanceof Error ? error.message : 'RTX enhancement failed.');
      } finally { frame?.close(); inFlight = false; }
    };
    const schedule = () => {
      if (disposed || stopped) return;
      callback = video.requestVideoFrameCallback((_now, metadata) => {
        if (lastFrameTime && metadata.mediaTime > lastFrameTime && metadata.mediaTime - lastFrameTime < 0.2) interval = (metadata.mediaTime - lastFrameTime) * 1000;
        lastFrameTime = metadata.mediaTime;
        void submit(metadata.mediaTime); schedule();
      });
    };
    const seeked = () => { lastFrameTime = 0; void submit(video.currentTime); };
    const unsubscribe = bridge?.onStatus(event => { if (event.state === 'stopped' && session && (!event.session || event.session === session) && !stopped && !disposed) fail(event.message); });
    video.addEventListener('seeking', invalidate);
    video.addEventListener('emptied', invalidate);
    video.addEventListener('seeked', seeked);
    video.addEventListener('loadeddata', seeked);
    void (async () => {
      hide(); report('Checking RTX Video…');
      if (!bridge) { fail('RTX Video requires the Windows desktop app.'); return; }
      try {
        const capability = await bridge.capability();
        if (disposed) return;
        if (!capability.available) { fail(capability.reason); return; }
        if (typeof VideoFrame === 'undefined' || typeof video.requestVideoFrameCallback !== 'function') { fail('This runtime cannot capture decoded frames.'); return; }
        const started = await bridge.start({ quality, maxOutputHeight: 1080 });
        if (disposed) { void bridge.stop(started.session).catch(() => {}); return; }
        session = started.session; target(); schedule(); void submit(video.currentTime);
      } catch (error) { if (!disposed) fail(error instanceof Error ? error.message : 'RTX Video could not start.'); }
    })();
    return () => {
      disposed = true; hide(); unsubscribe?.();
      video.cancelVideoFrameCallback?.(callback);
      video.removeEventListener('seeking', invalidate); video.removeEventListener('emptied', invalidate);
      video.removeEventListener('seeked', seeked); video.removeEventListener('loadeddata', seeked);
      if (session) { bridge?.setTarget({ id: null, session, generation }); void bridge?.stop(session).catch(() => {}); }
    };
  }, [enabled, quality, sourceKey, videoRef, canvasId]);
  return { canvasRef, canvasId, status };
}
