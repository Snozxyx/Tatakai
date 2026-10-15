/** Bound UI requests even if an underlying transport fails to reject on abort. */
export async function requestWithDeadline<T>(request: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void;
  const deadline = new Promise<never>((_resolve,reject)=>{
    onAbort = () => { controller.abort(); reject(new DOMException('Cancelled','AbortError')); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>{ controller.abort(); reject(new Error('analytics-timeout')); },timeoutMs);
  });
  try { return await Promise.race([deadline,Promise.resolve().then(()=>request(controller.signal))]); }
  finally { clearTimeout(timer!); signal?.removeEventListener('abort',onAbort!); }
}
