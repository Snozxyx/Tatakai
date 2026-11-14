/** Small decoded-image cache: next/previous navigation never clears the visible image. */
export class GalleryImageCache {
  private entries = new Map<string, { image: HTMLImageElement; ready: Promise<string> }>();
  async prepare(url: string): Promise<string> {
    if (!url) throw new Error('Image URL is missing');
    const cached = this.entries.get(url);
    if (cached) { this.entries.delete(url); this.entries.set(url, cached); return cached.ready; }
    const image = new Image();
    image.decoding = 'async';
    const ready = new Promise<string>((resolve, reject) => {
      image.onload = () => { void image.decode().then(() => resolve(url), () => resolve(url)); };
      image.onerror = () => { this.entries.delete(url); reject(new Error('Image could not be loaded')); };
      image.src = url;
    });
    this.entries.set(url, { image, ready });
    if (this.entries.size > 8) this.entries.delete(this.entries.keys().next().value!);
    return ready;
  }
  clear() { this.entries.clear(); }
}
