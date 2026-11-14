import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hand,
  MousePointer2,
  Type,
  Paintbrush,
  Eraser,
  Pipette,
  ZoomIn,
  ZoomOut,
  Scan,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TranslationBridge,
  TranslationPage,
  CleanupStroke,
} from "@/core/translate/types";
import { resizeFrame, textFrame, type Frame, type ResizeCorner } from "@/core/translate/geometry";

export type CanvasTool =
  | "select"
  | "pan"
  | "text"
  | "brush"
  | "eraser"
  | "picker";
type PageView = "original" | "cleaned" | "translated";
interface Point {
  x: number;
  y: number;
}
export function EditorCanvas({
  page,
  revision,
  bridge,
  selected,
  onSelect,
  onMove,
  onText,
  onPaint,
  onError,
  disabled,
  manual = false,
  onTransform,
  onCleanupMask,
}: {
  page: TranslationPage;
  revision: number;
  bridge: TranslationBridge;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onMove: (ids: string[], dx: number, dy: number, source: boolean) => void;
  onText: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onPaint: (stroke: {
    mode: "brush" | "eraser";
    color: number[];
    diameter: number;
    points: number[][];
    layerId: string | null;
  }) => Promise<void>;
  onError: (message: string) => void;
  disabled: boolean;
  manual?: boolean;
  onTransform: (id: string, rect: Frame, source: boolean) => void;
  onCleanupMask: (strokes: CleanupStroke[]) => Promise<boolean>;
}) {
  const [tool, setTool] = useState<CanvasTool | "mask">("select");
  const [view, setView] = useState<PageView>(manual ? "original" : "translated");
  const [masks, setMasks] = useState<CleanupStroke[]>([]);
  const [applyingMask, setApplyingMask] = useState(false);
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const resize = useRef<{id:string;corner:ResizeCorner;frame:Frame & {rotation:number};start:Point} | null>(null);
  const [resized, setResized] = useState<Frame | null>(null);
  const [zoom, setZoom] = useState(0.65);
  const [image, setImage] = useState("");
  const [rendering, setRendering] = useState(false);
  const [color, setColor] = useState("#ffffff");
  const [diameter, setDiameter] = useState(18);
  const [drag, setDrag] = useState<Point | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const paint = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{
    start: Point;
    last: Point;
    ids: string[];
    tool: CanvasTool | "mask";
    scrollX: number;
    scrollY: number;
  } | null>(null);
  const strokePoints = useRef<number[][]>([]);
  const fit = useCallback(() => {
    if (viewport.current)
      setZoom(
        Math.min(
          Math.max(1, viewport.current.clientWidth - 100) / page.width,
          Math.max(1, viewport.current.clientHeight - 50) / page.height,
          1
        )
      );
  }, [page.width, page.height]);
  useEffect(() => {
    fit();
  }, [page.id, fit]); // Fit when changing pages, preserve zoom on edits.
  useEffect(() => { setMasks([]); resize.current = null; setResized(null); setImage(""); }, [page.id]);
  useEffect(() => { setTool("select"); setView(manual ? "original" : "translated"); }, [manual]);
  useEffect(() => {
    const ctx = maskCanvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, page.width, page.height);
    ctx.strokeStyle = "#e9587b"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const stroke of masks) {
      ctx.lineWidth = stroke.diameter; ctx.beginPath();
      stroke.points.forEach(([x,y], index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      const first = stroke.points[0]; if (stroke.points.length === 1) ctx.lineTo(first[0]+0.01,first[1]+0.01);
      ctx.stroke();
    }
  }, [masks, page.width, page.height]);
  useEffect(() => {
    let disposed = false;
    setRendering(true);
    bridge
      .request("render", { pageId: page.id, view })
      .then((result) => {
        if (!disposed) {
          setImage(`data:image/png;base64,${result.png}`);
          paint.current
            ?.getContext("2d")
            ?.clearRect(0, 0, page.width, page.height);
        }
      })
      .catch((e) => {
        if (!disposed) onError(e.message);
      })
      .finally(() => {
        if (!disposed) setRendering(false);
      });
    return () => {
      disposed = true;
    };
  }, [bridge, page.id, page.width, page.height, revision, onError, view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (disabled || applyingMask) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      const map: Record<string, CanvasTool> = {
        v: "select",
        h: "pan",
        t: "text",
        b: "brush",
        e: "eraser",
        i: "picker",
      };
      if (map[event.key.toLowerCase()] && !event.ctrlKey && !event.metaKey)
        setTool(map[event.key.toLowerCase()]);
      if (manual && event.key.toLowerCase() === "m" && !event.ctrlKey && !event.metaKey) setTool("mask");
      if (event.key === "0") fit();
      if (event.key === "Escape") {
        gesture.current = null;
        resize.current = null; setResized(null);
        setDrag(null);
        onSelect([]);
        paint.current
          ?.getContext("2d")
          ?.clearRect(0, 0, page.width, page.height);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page.id, page.width, page.height, onSelect, fit, disabled, applyingMask, manual]);
  const point = (event: React.PointerEvent): Point => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.min(page.width, Math.max(0, (event.clientX - rect.left) / zoom)),
      y: Math.min(page.height, Math.max(0, (event.clientY - rect.top) / zoom)),
    };
  };
  const stroke = (from: Point, to: Point) => {
    const ctx = paint.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = tool === "mask" ? "#e9587b" : tool === "eraser" ? "#80808080" : color;
    ctx.lineWidth = diameter;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y + 0.01);
    ctx.stroke();
  };
  const down = (event: React.PointerEvent) => {
    if (
      disabled ||
      applyingMask ||
      rendering ||
      event.button !== 0 ||
      !surface.current ||
      !viewport.current
    )
      return;
    const p = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "picker") {
      const bitmap = new Image();
      bitmap.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = page.width;
        canvas.height = page.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const pixel = ctx.getImageData(
          Math.floor(p.x),
          Math.floor(p.y),
          1,
          1
        ).data;
        setColor(
          "#" +
            [...pixel]
              .slice(0, 3)
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("")
        );
      };
      bitmap.src = image;
      return;
    }
    if (
      tool === "eraser" &&
      !page.layers.some((l) => selected.includes(l.id) && l.kind === "raster")
    ) {
      onError("Select a paint or cleanup layer before erasing.");
      return;
    }
    let ids = [...selected];
    if (tool === "select") {
      const candidates = [...page.layers].reverse().filter(l=>l.visible);
      const hit = [...candidates.filter(l=>l.kind==="text"),...candidates.filter(l=>l.kind!=="text")]
        .find(
          (l) =>
            l.visible &&
            p.x >= l.x &&
            p.x <= l.x + l.width &&
            p.y >= l.y &&
            p.y <= l.y + l.height
        );
      if (!hit) {
        onSelect([]);
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey)
        ids = ids.includes(hit.id)
          ? ids.filter((id) => id !== hit.id)
          : [...ids, hit.id];
      else if (!ids.includes(hit.id)) ids = [hit.id];
      onSelect(ids);
    }
    gesture.current = {
      start: p,
      last: p,
      ids,
      tool,
      scrollX: event.clientX,
      scrollY: event.clientY,
    };
    if (tool === "brush" || tool === "eraser" || tool === "mask") {
      strokePoints.current = [[p.x, p.y]];
      stroke(p, p);
    }
  };
  const move = (event: React.PointerEvent) => {
    if (resize.current) {
      const r = resize.current, p = point(event);
      setResized(resizeFrame(r.frame, r.corner, p.x-r.start.x, p.y-r.start.y)); return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = point(event);
    if (g.tool === "pan" && viewport.current) {
      viewport.current.scrollLeft -= event.clientX - g.scrollX;
      viewport.current.scrollTop -= event.clientY - g.scrollY;
      g.scrollX = event.clientX;
      g.scrollY = event.clientY;
    }
    if (g.tool === "brush" || g.tool === "eraser" || g.tool === "mask") {
      strokePoints.current.push([p.x, p.y]);
      stroke(g.last, p);
    }
    if (g.tool === "select" || g.tool === "text")
      setDrag({ x: p.x - g.start.x, y: p.y - g.start.y });
    g.last = p;
  };
  const up = (event: React.PointerEvent) => {
    if (resize.current) {
      const r = resize.current, p = point(event);
      onTransform(r.id, resizeFrame(r.frame, r.corner, p.x-r.start.x, p.y-r.start.y), view === "original");
      resize.current = null; setResized(null); return;
    }
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    g.last = point(event);
    if (
      g.tool === "select" &&
      Math.abs(g.last.x - g.start.x) + Math.abs(g.last.y - g.start.y) > 1
    )
      onMove(g.ids, g.last.x - g.start.x, g.last.y - g.start.y, view === "original");
    if (g.tool === "text") onText(textFrame(g.start, g.last, page.width, page.height));
    if (g.tool === "mask") {
      setMasks(current => [...current, {diameter, points: [...strokePoints.current]}]);
      paint.current?.getContext("2d")?.clearRect(0,0,page.width,page.height);
    }
    if (g.tool === "brush" || g.tool === "eraser")
      void onPaint({
        mode: g.tool,
        points: strokePoints.current,
        color: [1, 3, 5]
          .map((i) => parseInt(color.slice(i, i + 2), 16))
          .concat(255),
        diameter,
        layerId:
          page.layers.find(
            (l) => selected.includes(l.id) && l.kind === "raster"
          )?.id || null,
      });
  };
  const tools = [
    { id: "select", icon: MousePointer2, label: "Select (V)" },
    { id: "text", icon: Type, label: "Text (T)" },
    { id: "brush", icon: Paintbrush, label: "Brush (B)" },
    { id: "eraser", icon: Eraser, label: "Eraser (E)" },
    { id: "picker", icon: Pipette, label: "Color picker (I)" },
    { id: "pan", icon: Hand, label: "Pan (H)" },
  ] as const;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-muted/30">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <div role="group" aria-label="Page preview" className="flex gap-1">
          {(["original", "cleaned", "translated"] as const).map(value => <Button key={value} size="sm" variant={view === value ? "outline" : "ghost"} aria-pressed={view === value} disabled={applyingMask} onClick={() => setView(value)}>{value === "original" ? "Original" : value === "cleaned" ? "Cleaned" : "Translated"}</Button>)}
        </div>
        {manual && <span className="text-xs text-muted-foreground">Draw regions with T · Paint a cleanup mask with M</span>}
        {masks.length > 0 && <div className="flex items-center gap-1">
          <Button size="sm" disabled={disabled || applyingMask} onClick={async () => {
            setApplyingMask(true);
            try { if (await onCleanupMask(masks)) setMasks([]); } catch (e) { onError(e instanceof Error ? e.message : "Cleanup failed"); }
            finally { setApplyingMask(false); }
          }}>Apply cleanup mask ({masks.length})</Button>
          <Button size="sm" variant="ghost" disabled={disabled || applyingMask} onClick={() => setMasks(current => current.slice(0,-1))}>Undo mask stroke</Button>
          <Button size="sm" variant="ghost" disabled={disabled || applyingMask} onClick={() => setMasks([])}>Clear mask</Button>
        </div>}
      </div>
      <div
        className="absolute left-3 top-16 z-10 flex flex-col gap-1 rounded-xl border border-border bg-background p-1 shadow-md"
        role="toolbar"
        aria-label="Canvas tools"
      >
        {tools.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            size="icon"
            className="size-9 rounded-lg"
            variant={tool === id ? "outline" : "ghost"}
            aria-label={label}
            title={label}
            aria-pressed={tool === id}
            disabled={disabled || applyingMask}
            onClick={() => setTool(id)}
          >
            <Icon className="size-4" />
          </Button>
        ))}
        {manual && <Button size="icon" variant={tool === "mask" ? "outline" : "ghost"} disabled={disabled || applyingMask} aria-label="Cleanup mask (M)" title="Paint areas to clean (M)" aria-pressed={tool === "mask"} onClick={() => setTool("mask")}><ScanLine className="size-4" /></Button>}
        <input
          type="color"
          aria-label="Brush color"
          title="Brush color"
          className="mx-auto mt-2 size-7 cursor-pointer bg-transparent"
          value={color}
          disabled={disabled || applyingMask}
          onChange={(e) => setColor(e.target.value)}
        />
        <input
          type="number"
          aria-label="Brush diameter"
          title="Brush diameter"
          className="mt-1 w-10 rounded border border-input bg-background text-center text-xs"
          min={1}
          max={300}
          value={diameter}
          disabled={disabled || applyingMask}
          onChange={(e) =>
            setDiameter(Math.min(300, Math.max(1, Number(e.target.value))))
          }
        />
      </div>
      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-auto p-8 pl-20"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) =>
              Math.min(4, Math.max(0.05, z * (e.deltaY > 0 ? 0.9 : 1.1)))
            );
          }
        }}
      >
        <div
          className="mx-auto"
          style={{ width: page.width * zoom, height: page.height * zoom }}
        >
          <div
            ref={surface}
            role="application"
            aria-label={`${page.label} canvas`}
            tabIndex={0}
            className="relative origin-top-left touch-none bg-background shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              width: page.width,
              height: page.height,
              transform: `scale(${zoom})`,
              cursor:
                tool === "pan"
                  ? "grab"
                  : tool === "select"
                  ? "default"
                  : "crosshair",
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              gesture.current = null;
              resize.current = null; setResized(null);
              setDrag(null);
              paint.current
                ?.getContext("2d")
                ?.clearRect(0, 0, page.width, page.height);
            }}
          >
            {image && (
              <img
                src={image}
                alt={`Translated composite of ${page.label}`}
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full select-none"
              />
            )}
            <canvas
              ref={maskCanvas}
              width={page.width}
              height={page.height}
              className="pointer-events-none absolute inset-0 opacity-40"
            />
            <canvas
              ref={paint}
              width={page.width}
              height={page.height}
              className="pointer-events-none absolute inset-0"
            />
            {page.layers
              .filter((l) => selected.includes(l.id) || (manual && l.kind === "text"))
              .map((l) => (
                <div
                  key={l.id}
                  className={`pointer-events-none absolute ${selected.includes(l.id) ? "border-2 border-primary" : "border border-dashed border-primary/40"}`}
                  style={{
                    left: resize.current?.id === l.id && resized ? resized.x : l.x + (selected.includes(l.id) ? drag?.x || 0 : 0),
                    top: resize.current?.id === l.id && resized ? resized.y : l.y + (selected.includes(l.id) ? drag?.y || 0 : 0),
                    width: resize.current?.id === l.id && resized ? resized.width : l.width,
                    height: resize.current?.id === l.id && resized ? resized.height : l.height,
                    transform: `rotate(${l.rotation}deg)`,
                  }}
                >
                  {manual && selected.length === 1 && selected.includes(l.id) && tool === "select" && !disabled && !applyingMask && (["nw","ne","sw","se"] as const).map(corner => <button
                    key={corner} aria-label={`Resize ${corner} corner`} className="pointer-events-auto absolute border border-primary bg-background"
                    style={{width:10/zoom,height:10/zoom,left:corner.includes("w") ? -5/zoom : undefined,right:corner.includes("e") ? -5/zoom : undefined,top:corner.includes("n") ? -5/zoom : undefined,bottom:corner.includes("s") ? -5/zoom : undefined,cursor:`${corner}-resize`}}
                    onPointerDown={e => { if(e.button !== 0 || rendering) return; e.stopPropagation(); surface.current?.setPointerCapture(e.pointerId); resize.current={id:l.id,corner,frame:l,start:point(e)}; }} />)}
                </div>
              ))}
            {drag && gesture.current?.tool === "text" && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary"
                style={{
                  left: Math.min(
                    gesture.current.start.x,
                    gesture.current.last.x
                  ),
                  top: Math.min(
                    gesture.current.start.y,
                    gesture.current.last.y
                  ),
                  width: Math.abs(drag.x),
                  height: Math.abs(drag.y),
                }}
              />
            )}
          </div>
        </div>
      </div>
      <footer className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-background px-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="min-w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Fit window (0)"
            onClick={fit}
          >
            <Scan className="size-4" />
          </Button>
        </div>
        <span role="status">
          {rendering ? "Rendering…" : `${page.width} × ${page.height} px`}
        </span>
      </footer>
    </div>
  );
}
