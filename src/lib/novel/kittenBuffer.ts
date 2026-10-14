export interface KittenClip { url: string; playbackRate?: number; release: () => void; }
type Outcome = { clip: KittenClip; error?: never } | { error: Error; clip?: never };
interface Entry { promise: Promise<Outcome>; outcome?: Outcome; }

/** A bounded audio queue with one synthesis job at a time. */
export class KittenAudioBuffer {
  private entries = new Map<number, Entry>();
  private tail = Promise.resolve();
  private disposed = false;
  private failure: Error | null = null;
  constructor(private texts: string[], private generate: (text: string) => Promise<KittenClip>) {}

  fill(from: number, count: number) {
    for (let index = from; index < Math.min(this.texts.length, from + count); index++) {
      if (this.disposed || this.entries.has(index)) continue;
      const entry = {} as Entry;
      entry.promise = this.tail.then(async (): Promise<Outcome> => {
        if (this.disposed) return { error: new DOMException('Stopped', 'AbortError') };
        if (this.failure) return { error: this.failure };
        try {
          const clip = await this.generate(this.texts[index]);
          if (this.disposed) { clip.release(); return { error: new DOMException('Stopped', 'AbortError') }; }
          return { clip };
        } catch (error) {
          this.failure = error as Error;
          return { error: this.failure };
        }
      }).then(outcome => { entry.outcome = outcome; return outcome; });
      // Capture failures as values so background work cannot reject unhandled.
      this.tail = entry.promise.then(() => {});
      this.entries.set(index, entry);
    }
  }

  async prime(count: number) {
    this.fill(0, count);
    for (const entry of this.entries.values()) {
      const outcome = await entry.promise;
      if (outcome.error) throw outcome.error;
    }
  }
  ready(index: number) { return Boolean(this.entries.get(index)?.outcome); }
  async take(index: number): Promise<KittenClip> {
    const entry = this.entries.get(index);
    if (!entry) throw new Error('Narration buffer is empty. Retry playback.');
    const outcome = await entry.promise;
    if (this.disposed) throw new DOMException('Stopped', 'AbortError');
    if (outcome.error) throw outcome.error;
    this.entries.delete(index);
    return outcome.clip;
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.outcome?.clip?.release();
    this.entries.clear();
  }
}
