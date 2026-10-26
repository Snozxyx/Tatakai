/** Admission is conservative: a short peer probe is an estimate, never a speed guarantee. */
export class UploadBudget {
  private megabitsPerSecond = 0;
  private viewers = new Set<string>();
  constructor(private sourceMbps = 4) {}
  recordProbe(bytes: number, elapsedMs: number): void {
    if (!Number.isFinite(bytes) || !Number.isFinite(elapsedMs) || bytes < 65536 || elapsedMs <= 0) return;
    const measured = bytes * 8 / elapsedMs / 1000;
    this.megabitsPerSecond = this.megabitsPerSecond ? Math.min(this.megabitsPerSecond, measured) : measured;
  }
  setSourceBitrate(bitsPerSecond: number): void {
    if (Number.isFinite(bitsPerSecond) && bitsPerSecond > 0) this.sourceMbps = bitsPerSecond / 1e6;
  }
  admit(viewer: string): void {
    if (!this.megabitsPerSecond) throw new Error('Host upload measurement failed. Retry the connection.');
    if ((this.viewers.size + (this.viewers.has(viewer) ? 0 : 1)) * this.sourceMbps > this.megabitsPerSecond * 0.65) {
      throw new Error('Host upload capacity is insufficient. Ask the host to select a lower-quality source or use a directly accessible source.');
    }
    this.viewers.add(viewer);
  }
  remove(viewer: string): void { this.viewers.delete(viewer); }
}
