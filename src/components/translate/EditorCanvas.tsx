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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TranslationBridge,
  TranslationPage,
} from "@/core/translate/types";

export type CanvasTool =
  | "select"
  | "pan"
  | "text"
  | "brush"
  | "eraser"
  | "picker";
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
}: {
  page: TranslationPage;
  revision: number;
  bridge: TranslationBridge;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onMove: (ids: string[], dx: number, dy: number) => void;
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
}) {
  const [tool, setTool] = useState<CanvasTool>("select");
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
    tool: CanvasTool;
    scrollX: number;
    scrollY: number;
  } | null>(null);
  const strokePoints = useRef<number[][]>([]);
  const fit = useCallback(() => {
    if (viewport.current)
      setZoom(
        Math.min(
          (viewport.current.clientWidth - 100) / page.width,
          (viewport.current.clientHeight - 50) / page.height,
          1
        )
      );
  }, [page.width, page.height]);
  useEffect(() => {
    fit();
  }, [page.id, fit]); // Fit when changing pages, preserve zoom on edits.
  useEffect(() => {
    let disposed = false;
    setRendering(true);
    bridge
      .request("render", { pageId: page.id })
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
  }, [bridge, page.id, page.width, page.height, revision, onError]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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
      if (event.key === "0") fit();
      if (event.key === "Escape") {
        gesture.current = null;
        setDrag(null);
        onSelect([]);
        paint.current
          ?.getContext("2d")
          ?.clearRect(0, 0, page.width, page.height);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page.id, page.width, page.height, onSelect, fit]);
  const point = (event: React.PointerEvent): Point => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };
  const stroke = (from: Point, to: Point) => {
    const ctx = paint.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = tool === "eraser" ? "#80808080" : color;
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
      const hit = [...page.layers]
        .reverse()
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
    if (tool === "brush" || tool === "eraser") {
      strokePoints.current = [[p.x, p.y]];
      stroke(p, p);
    }
  };
  const move = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(event);
    if (g.tool === "pan" && viewport.current) {
      viewport.current.scrollLeft -= event.clientX - g.scrollX;
      viewport.current.scrollTop -= event.clientY - g.scrollY;
      g.scrollX = event.clientX;
      g.scrollY = event.clientY;
    }
    if (g.tool === "brush" || g.tool === "eraser") {
      strokePoints.current.push([p.x, p.y]);
      stroke(g.last, p);
    }
    if (g.tool === "select" || g.tool === "text")
      setDrag({ x: p.x - g.start.x, y: p.y - g.start.y });
    g.last = p;
  };
  const up = () => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    if (
      g.tool === "select" &&
      Math.abs(g.last.x - g.start.x) + Math.abs(g.last.y - g.start.y) > 1
    )
      onMove(g.ids, g.last.x - g.start.x, g.last.y - g.start.y);
    if (g.tool === "text")
      onText({
        x: Math.max(0, Math.min(g.start.x, g.last.x)),
        y: Math.max(0, Math.min(g.start.y, g.last.y)),
        width: Math.max(100, Math.abs(g.last.x - g.start.x)),
        height: Math.max(60, Math.abs(g.last.y - g.start.y)),
      });
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
      <div
        className="absolute left-3 top-4 z-10 flex flex-col gap-1 rounded-xl border border-border bg-background p-1 shadow-md"
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
            disabled={disabled}
            onClick={() => setTool(id)}
          >
            <Icon className="size-4" />
          </Button>
        ))}
        <input
          type="color"
          aria-label="Brush color"
          title="Brush color"
          className="mx-auto mt-2 size-7 cursor-pointer bg-transparent"
          value={color}
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
              ref={paint}
              width={page.width}
              height={page.height}
              className="pointer-events-none absolute inset-0"
            />
            {page.layers
              .filter((l) => selected.includes(l.id))
              .map((l) => (
                <div
                  key={l.id}
                  className="pointer-events-none absolute border-2 border-primary"
                  style={{
                    left: l.x + (drag?.x || 0),
                    top: l.y + (drag?.y || 0),
                    width: l.width,
                    height: l.height,
                    transform: `rotate(${l.rotation}deg)`,
                  }}
                />
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
