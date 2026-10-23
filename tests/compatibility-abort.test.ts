import { expect, it } from 'bun:test';
import { compatibilityAny, compatibilityTimeout, throwCompatibilityAbort, awaitCompatibility } from '../src/core/extensions/compatibility/abort';

it('cancels and times out when a native WebView lacks AbortSignal.any and timeout', async () => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
  try {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
    const parent = new AbortController();
    const signal = compatibilityAny([parent.signal, compatibilityTimeout(1000)]);
    parent.abort(new Error('Provider disabled'));
    expect(() => throwCompatibilityAbort(signal)).toThrow('Provider disabled');
    expect(compatibilityAny([parent.signal]).aborted).toBe(true);
    const deadline = compatibilityTimeout(5);
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(deadline.aborted).toBe(true);
    expect(() => deadline.throwIfAborted()).toThrow('timed out');
  } finally { Object.defineProperty(AbortSignal, 'any', any); Object.defineProperty(AbortSignal, 'timeout', timeout); }
});
it('cancels waiting for optional title aliases without waiting for metadata', async () => {
  const controller = new AbortController();
  const result = awaitCompatibility(new Promise<string[]>(() => {}), controller.signal);
  controller.abort(new Error('Lookup canceled'));
  await expect(result).rejects.toThrow('Lookup canceled');
});
