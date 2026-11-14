import { useState } from "react";
import { ScanText, Languages, Paintbrush, Focus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedCheckbox } from "@/components/ui/themed-checkbox";
import { ThemedSelect } from "@/components/ui/themed-select";

export function ManualWorkflow({ scope, onScope, selectedCount, hasPages, disabled, processing, onRun, onStop }: {
  scope: string;
  onScope: (scope: string) => void;
  selectedCount: number;
  hasPages: boolean;
  disabled: boolean;
  processing: boolean;
  onRun: (stage: string, overwrite: boolean) => void;
  onStop: () => void;
}) {
  const [replace, setReplace] = useState(false);
  const steps = [
    { stage: "detect", label: "Detect regions", icon: Focus },
    { stage: "ocr", label: "Read text", icon: ScanText },
    { stage: "translate", label: "Translate text", icon: Languages },
    { stage: "cleanup", label: "Clean lettering", icon: Paintbrush },
  ];
  return <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Run one step, inspect the result, then continue. Text and artwork edits save automatically.</p>
      <ThemedSelect aria-label="Manual processing scope" className="editor-select" value={scope} disabled={disabled} onChange={e => onScope(e.target.value)}>
        <option value="current">Current page</option>
        <option value="layers">Selected text regions ({selectedCount})</option>
        <option value="selected">Selected pages</option>
        <option value="project">Entire project</option>
      </ThemedSelect>
    </div>
    <div className="flex flex-wrap gap-2">
      {steps.map(({ stage, label, icon: Icon }, index) => (
        <Button
          key={stage}
          size="sm"
          variant="outline"
          disabled={disabled || !hasPages || (scope === "layers" && (!selectedCount || stage === "detect"))}
          onClick={() => onRun(stage, scope === "layers" && replace && (stage === "ocr" || stage === "translate"))}
        >
          <span className="mr-2 text-muted-foreground">{index + 1}</span>
          <Icon className="mr-1.5 size-4" />
          {label}
        </Button>
      ))}
      {processing && <Button size="sm" variant="outline" onClick={onStop}><Square className="mr-1 size-3" />Stop</Button>}
    </div>
    {scope === "layers" ? (
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <ThemedCheckbox type="checkbox" disabled={disabled} checked={replace} onChange={e => setReplace(e.target.checked)} />
        Replace selected manual text when running OCR or translation
      </label>
    ) : (
      <p className="text-xs text-muted-foreground">Manual corrections are preserved. Select text regions to replace their wording.</p>
    )}
  </div>;
}
