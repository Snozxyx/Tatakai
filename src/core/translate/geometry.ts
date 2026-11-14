export interface Frame { x: number; y: number; width: number; height: number }
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export function clampFrame(frame: Frame, width: number, height: number): Frame {
  const x = Math.max(0, Math.min(width - 1, frame.x));
  const y = Math.max(0, Math.min(height - 1, frame.y));
  return {
    x, y,
    width: Math.max(1, Math.min(width, frame.x + frame.width) - x),
    height: Math.max(1, Math.min(height, frame.y + frame.height) - y),
  };
}

export function textFrame(start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number): Frame {
  const x = Math.min(width - 1, Math.max(0, Math.min(start.x, end.x)));
  const y = Math.min(height - 1, Math.max(0, Math.min(start.y, end.y)));
  const clicked = Math.abs(end.x - start.x) + Math.abs(end.y - start.y) < 3;
  return {
    x, y, width: Math.min(width - x, Math.max(1, clicked ? 100 : Math.abs(end.x - start.x))),
    height: Math.min(height - y, Math.max(1, clicked ? 60 : Math.abs(end.y - start.y)))
  };
}

export function resizeFrame(frame: Frame & { rotation: number }, corner: ResizeCorner, dx: number, dy: number): Frame {
  const angle = frame.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const localX = c * dx + s * dy, localY = -s * dx + c * dy;
  const west = corner.includes("w"), north = corner.includes("n");
  const width = Math.max(1, frame.width + (west ? -localX : localX));
  const height = Math.max(1, frame.height + (north ? -localY : localY));
  const shiftX = (width - frame.width) / 2 * (west ? -1 : 1);
  const shiftY = (height - frame.height) / 2 * (north ? -1 : 1);
  return {
    x: frame.x + frame.width / 2 + c * shiftX - s * shiftY - width / 2,
    y: frame.y + frame.height / 2 + s * shiftX + c * shiftY - height / 2, width, height
  };
}
