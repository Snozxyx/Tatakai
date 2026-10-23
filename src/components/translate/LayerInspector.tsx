import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Trash2,
  Type,
  Paintbrush,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type {
  TextLayer,
  TranslationLayer,
  TranslationPage,
} from "@/core/translate/types";

export function LayerInspector({
  page,
  selected,
  onSelect,
  onChange,
  onDelete,
  onReorder,
  disabled,
  fonts = [],
  onImportFont,
}: {
  page: TranslationPage;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (id: string, patch: Partial<TranslationLayer>) => void;
  onDelete: () => void;
  onReorder: (id: string, direction: number) => void;
  disabled: boolean;
  fonts?: string[];
  onImportFont?: () => void;
}) {
  const layer = page.layers.find((l) => l.id === selected[0]);
  const text = layer?.kind === "text" ? layer : null;
  const style = (patch: Partial<TextLayer["style"]>) => {
    if (text) onChange(text.id, { style: { ...text.style, ...patch } });
  };
  const hex = (color: number[]) =>
    "#" +
    color
      .slice(0, 3)
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  const rgba = (color: string) =>
    [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).concat(255);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <fieldset
        disabled={disabled}
        className="flex min-h-0 max-h-[66%] shrink-0 flex-col gap-3 overflow-y-auto border-b border-border p-4"
      >
        <legend className="sr-only">Layer properties</legend>
        {layer ? (
          <>
            <div className="flex items-center gap-2">
              <Type className="size-4 text-primary" />
              <h2 className="font-medium">
                {layer.kind === "text"
                  ? "Text properties"
                  : "Artwork properties"}
              </h2>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="layer-name">Layer name</Label>
              <Input
                className="editor-input"
                id="layer-name"
                key={`${layer.id}-${layer.name}`}
                defaultValue={layer.name}
                onBlur={(e) => {
                  if (e.target.value !== layer.name)
                    onChange(layer.id, { name: e.target.value });
                }}
              />
            </div>
            {text && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="source-text">Source text</Label>
                  <Textarea
                    id="source-text"
                    className="min-h-16 resize-y rounded-lg"
                    rows={2}
                    key={`${text.id}-source-${text.source}`}
                    defaultValue={text.source}
                    onBlur={(e) => {
                      if (e.target.value !== text.source)
                        onChange(text.id, {
                          source: e.target.value,
                          sourceEdited: true,
                        });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="translation-text">Translation</Label>
                  <Textarea
                    id="translation-text"
                    className="min-h-20 resize-y rounded-lg"
                    rows={3}
                    key={`${text.id}-translation-${text.translation}`}
                    defaultValue={text.translation}
                    onBlur={(e) => {
                      if (e.target.value !== text.translation)
                        onChange(text.id, {
                          translation: e.target.value,
                          translationEdited: true,
                        });
                    }}
                  />
                </div>
                <details className="border-t border-border">
                  <summary>Typography</summary>
                  <div className="flex flex-col gap-3 pb-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="text-font">Font family</Label>
                      <Input
                        className="editor-input"
                        id="text-font"
                        list="project-font-families"
                        key={`${text.id}-${text.style.family}`}
                        defaultValue={text.style.family}
                        onBlur={(e) => {
                          if (e.target.value !== text.style.family)
                            style({ family: e.target.value });
                        }}
                      />
                      <datalist id="project-font-families"><option value="sans-serif"/><option value="serif"/><option value="monospace"/>{fonts.map(font=><option key={font} value={font}/>)}</datalist>
                      {onImportFont&&<Button variant="ghost" size="sm" className="self-start" disabled={disabled} onClick={onImportFont}>Add font file…</Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="font-size">Size</Label>
                        <Input
                          className="editor-input"
                          id="font-size"
                          type="number"
                          min={1}
                          max={1000}
                          key={`${text.id}-${text.style.size}`}
                          defaultValue={text.style.size}
                          onBlur={(e) => {
                            const size = Number(e.target.value);
                            if (
                              size >= 1 &&
                              size <= 1000 &&
                              size !== text.style.size
                            )
                              style({ size });
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="font-weight">Weight</Label>
                        <ThemedSelect
                          id="font-weight"
                          className="editor-select"
                          value={text.style.weight}
                          onChange={(e) =>
                            style({ weight: Number(e.target.value) })
                          }
                        >
                          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(
                            (n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            )
                          )}
                        </ThemedSelect>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="text-fill">Fill</Label>
                        <input
                          id="text-fill"
                          type="color"
                          className="h-9 w-full cursor-pointer rounded border border-input bg-background"
                          value={hex(text.style.fill)}
                          onChange={(e) =>
                            style({ fill: rgba(e.target.value) })
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="text-stroke">Stroke</Label>
                        <input
                          id="text-stroke"
                          type="color"
                          className="h-9 w-full cursor-pointer rounded border border-input bg-background"
                          value={hex(text.style.stroke)}
                          onChange={(e) =>
                            style({ stroke: rgba(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="stroke-width">Stroke width</Label>
                      <Input
                        className="editor-input"
                        id="stroke-width"
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        key={`${text.id}-${text.style.strokeWidth}`}
                        defaultValue={text.style.strokeWidth}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v >= 0 && v <= 20 && v !== text.style.strokeWidth)
                            style({ strokeWidth: v });
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="text-align">Alignment</Label>
                        <ThemedSelect
                          id="text-align"
                          className="editor-select"
                          value={text.style.align}
                          onChange={(e) =>
                            style({
                              align: e.target
                                .value as TextLayer["style"]["align"],
                            })
                          }
                        >
                          {["left", "center", "right"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </ThemedSelect>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="text-direction">Direction</Label>
                        <ThemedSelect
                          id="text-direction"
                          className="editor-select"
                          value={text.style.direction}
                          onChange={(e) =>
                            style({
                              direction: e.target
                                .value as TextLayer["style"]["direction"],
                            })
                          }
                        >
                          <option value="auto">Automatic</option>
                          <option value="ltr">Left to right</option>
                          <option value="rtl">Right to left</option>
                        </ThemedSelect>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <ThemedCheckbox
                        type="checkbox"
                        checked={text.style.autoFit}
                        onChange={(e) => style({ autoFit: e.target.checked })}
                      />
                      Fit text to frame
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <ThemedCheckbox
                        type="checkbox"
                        checked={text.style.italic}
                        onChange={(e) => style({ italic: e.target.checked })}
                      />
                      Italic
                    </label>
                  </div>
                </details>
              </>
            )}
            <details className="border-t border-border">
              <summary>Transform & opacity</summary>
              <div className="grid grid-cols-2 gap-3 pb-2">
                {(
                  ["x", "y", "width", "height", "rotation", "opacity"] as const
                ).map((key) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`layer-${key}`}>{key}</Label>
                    <Input
                      className="editor-input"
                      id={`layer-${key}`}
                      type="number"
                      step={key === "opacity" ? 0.05 : 1}
                      min={
                        key === "opacity"
                          ? 0
                          : key === "width" || key === "height"
                          ? 1
                          : undefined
                      }
                      max={key === "opacity" ? 1 : undefined}
                      key={`${layer.id}-${key}-${layer[key]}`}
                      defaultValue={layer[key]}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== layer[key])
                          onChange(layer.id, { [key]: v });
                      }}
                    />
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a layer to edit its text, typography or position.
          </p>
        )}
      </fieldset>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">
          Layers{" "}
          <span className="ml-1 text-muted-foreground">
            {page.layers.length}
          </span>
        </h2>
        <Button
          size="icon"
          variant="ghost"
          disabled={!selected.length || disabled}
          aria-label="Delete selected layers"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
        {[...page.layers].reverse().map((l) => (
          <div
            key={l.id}
            className={`flex items-center gap-1 px-2 ${
              selected.includes(l.id) ? "bg-primary/10" : ""
            }`}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) =>
                onSelect(
                  e.shiftKey || e.ctrlKey || e.metaKey
                    ? selected.includes(l.id)
                      ? selected.filter((id) => id !== l.id)
                      : [...selected, l.id]
                    : [l.id]
                )
              }
            >
              {l.kind === "text" ? (
                <Type className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Paintbrush className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">
                {l.kind === "text"
                  ? l.translation || l.source || l.name
                  : l.name}
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={l.visible ? "Hide layer" : "Show layer"}
              onClick={() => onChange(l.id, { visible: !l.visible })}
            >
              {l.visible ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </Button>
            <div className="flex flex-col">
              <button
                disabled={disabled}
                className="p-1 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Move layer up"
                onClick={() => onReorder(l.id, 1)}
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                disabled={disabled}
                className="p-1 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Move layer down"
                onClick={() => onReorder(l.id, -1)}
              >
                <ArrowDown className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Original artwork is preserved. Changes are saved automatically.
      </p>
    </div>
  );
}
