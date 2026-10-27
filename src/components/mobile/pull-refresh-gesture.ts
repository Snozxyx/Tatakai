export const REFRESH_PULL_THRESHOLD = 56;
export class PullRefreshGesture {
  private origin: { x: number; y: number } | null = null;
  private distance = 0;
  get active() { return this.origin !== null; }
  begin(x: number, y: number, atTop: boolean, blocked: boolean) {
    this.cancel();
    if (atTop && !blocked) this.origin = { x, y };
  }
  move(x: number, y: number, touches = 1): number {
    if (!this.origin) return 0;
    const dx = Math.abs(x - this.origin.x), dy = y - this.origin.y;
    if (touches !== 1 || dy < -8 || (dx > 12 && dx > Math.abs(dy))) { this.cancel(); return 0; }
    this.distance = Math.min(80, Math.max(0, dy / 2));
    return this.distance;
  }
  finish(): boolean {
    const ready = this.origin !== null && this.distance >= REFRESH_PULL_THRESHOLD;
    this.cancel(); return ready;
  }
  cancel() { this.origin = null; this.distance = 0; }
}
