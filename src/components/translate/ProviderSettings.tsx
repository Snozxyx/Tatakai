import { randomUUID } from '../../lib/uuid';
import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, Save, Download, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  OfflineModelStatus,
  TranslationBridge,
  TranslationProvider,
  TranslationSettings,
} from "@/core/translate/types";

const presets: Record<string, Omit<TranslationProvider, "id">> = {
  local: {
    name: "Local model / llama.cpp",
    kind: "openai-compatible",
    endpoint: "http://127.0.0.1:8080/v1",
    model: "local",
  },
  openai: {
    name: "OpenAI",
    kind: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    model: "",
  },
  anthropic: {
    name: "Anthropic",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    model: "",
  },
  gemini: {
    name: "Gemini",
    kind: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "",
  },
  openrouter: {
    name: "OpenRouter",
    kind: "openai-compatible",
    endpoint: "https://openrouter.ai/api/v1",
    model: "",
  },
  deepseek: {
    name: "DeepSeek",
    kind: "openai-compatible",
    endpoint: "https://api.deepseek.com/v1",
    model: "",
  },
  grok: {
    name: "Grok",
    kind: "openai-compatible",
    endpoint: "https://api.x.ai/v1",
    model: "",
  },
  minimax: {
    name: "MiniMax",
    kind: "openai-compatible",
    endpoint: "https://api.minimax.io/v1",
    model: "",
  },
  deepl: {
    name: "DeepL",
    kind: "deepl",
    endpoint: "https://api-free.deepl.com/v2/translate",
    model: "",
  },
  google: {
    name: "Google Cloud Translation",
    kind: "google",
    endpoint: "https://translation.googleapis.com/language/translate/v2",
    model: "",
  },
  caiyun: {
    name: "Caiyun",
    kind: "caiyun",
    endpoint: "https://api.interpreter.caiyunai.com/v1/translator",
    model: "",
  },
  custom: {
    name: "OpenAI-compatible",
    kind: "openai-compatible",
    endpoint: "",
    model: "",
  },
};
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const defaultWorkflow: NonNullable<TranslationSettings["workflow"]> = {includeOutsideText:true,cleanup:{mode:"edge-fill",endpoint:"http://127.0.0.1:1234",steps:20,strength:0.9}};
export function ProviderSettings({
  bridge,
  open,
  onOpenChange,
  onSaved,
}: {
  bridge: TranslationBridge;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<TranslationSettings>({
    providers: [],
    translationProvider: null,
    visionProvider: null,
  });
  const [selected, setSelected] = useState("");
  const [preset, setPreset] = useState("local");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{running:boolean;loading:boolean;name:string|null}>({running:false,loading:false,name:null});
  const [offline,setOffline]=useState<OfflineModelStatus|null>(null);
  const [installing,setInstalling]=useState(false);
  const [preparingOffline,setPreparingOffline]=useState(false);
  const [vision, setVision] = useState(false);
  const [localMessage,setLocalMessage]=useState('');
  useEffect(() => {
    if (!open) {
      setSecret("");
      return;
    }
    let disposed = false;
    void bridge.modelStatus?.().then(status=>{if(!disposed)setLocal(status);}).catch(()=>{});
    void bridge.offlineStatus?.().then(status=>{if(!disposed)setOffline(status);}).catch(()=>{});
    const unsubscribe=bridge.onEvent(event=>{if(event.event==='progress'&&event.stage==='model')setLocalMessage(event.message);});
    bridge
      .request("settings", {})
      .then((value) => {
        if (!disposed) {
          setSettings(value);
          setSelected(value.providers[0]?.id || "");
        }
      })
      .catch((e) => {
        if (!disposed) setError(String(e.message));
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bridge, open]);
  const prepareOffline=async(download:boolean)=>{
    setBusy(true);setPreparingOffline(true);setInstalling(download);setError('');setLocalMessage(download?'Preparing offline download…':'Loading offline models…');
    try{
      const status=await bridge.setupOffline({download});setOffline(status);setLocal(status);
      const next=await bridge.request('settings',{});setSettings(next);setSelected('tatakai-local');onSaved();
      setLocalMessage('Ready · pages and translations stay on this device.');
    }catch(error){setError(error instanceof Error?error.message:'Offline setup failed. Retry the download.');setLocalMessage('');}
    finally{setBusy(false);setInstalling(false);setPreparingOffline(false);void bridge.offlineStatus?.().then(setOffline).catch(()=>{});}
  };
  const provider = settings.providers.find((p) => p.id === selected);
  const workflow=settings.workflow||defaultWorkflow;
  const cleanup=(patch:Partial<typeof workflow.cleanup>)=>setSettings(s=>({...s,workflow:{...(s.workflow||defaultWorkflow),cleanup:{...(s.workflow||defaultWorkflow).cleanup,...patch}}}));
  const update = (patch: Partial<TranslationProvider>) =>
    setSettings((s) => ({
      ...s,
      providers: s.providers.map((p) =>
        p.id === selected ? { ...p, ...patch } : p
      ),
    }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await bridge.request("saveSettings", { settings });
      if (secret && provider)
        await bridge.request("setKey", {
          providerId: provider.id,
          key: secret,
        });
      setSecret("");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save provider");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Processing settings</DialogTitle>
          <DialogDescription>
            Set up offline processing, or connect your own provider. You choose where your pages are processed.
          </DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-4 rounded-lg border border-border p-4" aria-labelledby="offline-title">
          <div className="flex items-start gap-3"><Laptop className="mt-0.5 size-5 shrink-0 text-primary"/><div className="min-w-0"><h2 id="offline-title" className="text-sm font-semibold">Translate on this device</h2><p className="mt-1 text-sm text-muted-foreground">Download the text-reading and translation models once. Detection, OCR, translation and basic cleanup then work without an internet connection or API key.</p></div></div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Qwen3-VL 2B · compact offline model</p>
            <p className="text-xs text-muted-foreground">1.55 GB of models, plus the desktop runtime. CPU processing works on Windows, macOS and Linux; allow several GB of free memory. Small models can miss difficult lettering—review the result before export.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy||local.running} onClick={()=>void prepareOffline(!offline?.installed)}><Download className="size-4"/>{installing?'Downloading…':offline?.installed?'Use downloaded models':'Download and use offline models'}</Button>
              {offline?.installed&&!local.running&&<Button variant="ghost" disabled={busy} onClick={()=>void prepareOffline(true)}>Check or repair download</Button>}
              {preparingOffline&&<Button variant="outline" onClick={()=>void bridge.cancelOfflineSetup().catch(error=>setError(String(error)))}>Cancel setup</Button>}
              {local.running&&<Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{setLocal(await bridge.stopModel());setLocalMessage('Model unloaded. It will reload when offline processing starts.');}catch(error){setError(String(error));}finally{setBusy(false);}}}>Unload model</Button>}
            </div>
            <p className="text-sm" role="status" aria-live="polite">{localMessage||(local.running?local.name:offline?.installed?'Downloaded · ready to load':'Models not downloaded')}</p>
            <p className="text-xs text-muted-foreground">Models come directly from <a className="underline underline-offset-4" href="https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF" target="_blank" rel="noreferrer">Qwen</a> under Apache-2.0 and are checked before use. Flat-background cleanup is included; restoring detailed artwork uses a separately configured local diffusion model.</p>
          </div>
          <label className="flex items-start gap-2 text-sm"><ThemedCheckbox type="checkbox" aria-label="Work offline only" checked={settings.offlineOnly===true} disabled={busy} onChange={e=>setSettings(s=>({...s,offlineOnly:e.target.checked}))}/><span>Work offline only<span className="mt-1 block text-xs text-muted-foreground">Blocks remote processing providers. Downloading models is a separate action; processing never falls back to a cloud service.</span></span></label>
          <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">Use your own GGUF model</summary><div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm"><ThemedCheckbox type="checkbox" checked={vision} disabled={busy||local.running} onChange={e=>setVision(e.target.checked)}/>Include a matching vision projection for detection and OCR</label>
            <Button className="self-start" variant="outline" disabled={busy||local.running} onClick={async()=>{setBusy(true);setError('');setLocalMessage('Choose a model file…');try{const result=await bridge.startModel({vision});if(result){setLocal(result);const next=await bridge.request('settings',{});setSettings(next);setSelected('tatakai-local');onSaved();}setLocalMessage('');}catch(error){setError(error instanceof Error?error.message:'Could not load the local model');setLocalMessage('');}finally{setBusy(false);}}}>Load GGUF model…</Button>
          </div></details>
        </section>
        <div className="flex items-center gap-2">
          <ThemedSelect
            aria-label="Provider preset"
            className={selectClass}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {Object.entries(presets).map(([key, p]) => (
              <option key={key} value={key}>
                {p.name}
              </option>
            ))}
          </ThemedSelect>
          <Button
            variant="outline"
            onClick={() => {
              const p = { ...presets[preset], id: randomUUID() };
              setSettings((s) => ({ ...s, providers: [...s.providers, p] }));
              setSelected(p.id);
              setSecret("");
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div
            className="flex shrink-0 flex-col gap-1 sm:w-40"
            aria-label="Configured providers"
          >
            {settings.providers.map((p) => (
              <Button
                className="justify-start truncate"
                key={p.id}
                variant={selected === p.id ? "secondary" : "ghost"}
                onClick={() => {
                  setSelected(p.id);
                  setSecret("");
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>
          {provider ? (
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-name">Name</Label>
                <Input
                  id="provider-name"
                  value={provider.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-endpoint">Endpoint</Label>
                <Input
                  id="provider-endpoint"
                  type="url"
                  value={provider.endpoint}
                  onChange={(e) => update({ endpoint: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-model">Model ID</Label>
                <Input
                  id="provider-model"
                  value={provider.model}
                  placeholder="Model ID from your provider"
                  onChange={(e) => update({ model: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-key">API key</Label>
                <Input
                  id="provider-key"
                  type="password"
                  autoComplete="off"
                  value={secret}
                  placeholder="Leave blank to keep the saved key"
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await bridge.request("setKey", {
                        providerId: provider.id,
                        key: "",
                      });
                      setSecret("");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  <KeyRound className="size-4" />
                  Remove saved key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings((s) => ({
                      ...s,
                      providers: s.providers.filter((p) => p.id !== selected),
                      translationProvider:
                        s.translationProvider === selected
                          ? null
                          : s.translationProvider,
                      visionProvider:
                        s.visionProvider === selected ? null : s.visionProvider,
                    }));
                    setSelected("");
                    setSecret("");
                  }}
                >
                  <Trash2 className="size-4" />
                  Remove provider
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              Add or select a provider to configure it.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["translationProvider", "visionProvider"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={key}>
                {key === "translationProvider"
                  ? "Translation and assistant"
                  : "Detection and OCR"}
              </Label>
              <ThemedSelect
                id={key}
                className={selectClass}
                value={settings[key] || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [key]: e.target.value || null }))
                }
              >
                <option value="">Choose provider</option>
                {settings.providers
                  .filter(
                    (p) =>
                      key === "translationProvider" ||
                      !["deepl", "google", "caiyun"].includes(p.kind)
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </ThemedSelect>
            </div>
          ))}
        </div>
        <section className="flex flex-col gap-3 border-t border-border pt-4" aria-labelledby="cleanup-settings-title">
          <h2 id="cleanup-settings-title" className="text-sm font-semibold">Page processing</h2>
          <label className="flex items-center gap-2 text-sm"><ThemedCheckbox type="checkbox" checked={workflow.includeOutsideText} disabled={busy} onChange={e=>setSettings(s=>({...s,workflow:{...(s.workflow||defaultWorkflow),includeOutsideText:e.target.checked}}))}/>Include outside-bubble text, captions and sound effects</label>
          <div className="flex flex-col gap-1.5"><Label htmlFor="cleanup-mode">Background cleanup</Label><ThemedSelect id="cleanup-mode" className={selectClass} value={workflow.cleanup.mode} disabled={busy} onChange={e=>cleanup({mode:e.target.value as typeof workflow.cleanup.mode})}><option value="edge-fill">Flat backgrounds · CPU</option><option value="diffusion">Restore artwork · local diffusion</option></ThemedSelect></div>
          <p className="text-xs text-muted-foreground">Cleanup creates an editable layer beneath translated text. Flat-background cleanup samples nearby colors. Diffusion generates missing artwork inside the text mask.</p>
          {workflow.cleanup.mode==='diffusion'&&<>
            <div className="flex flex-col gap-1.5"><Label htmlFor="diffusion-endpoint">Local diffusion runtime</Label><Input id="diffusion-endpoint" type="url" value={workflow.cleanup.endpoint} onChange={e=>cleanup({endpoint:e.target.value})}/><p className="text-xs text-muted-foreground">Run stable-diffusion.cpp sd-server on this device with a compatible inpainting model loaded. Pages connect directly to this loopback address. Model setup is separate from Tatakai.</p></div>
            <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="diffusion-steps">Sampling steps</Label><Input id="diffusion-steps" type="number" min={1} max={100} value={workflow.cleanup.steps} onChange={e=>cleanup({steps:Number(e.target.value)})}/></div><div className="flex flex-col gap-1.5"><Label htmlFor="diffusion-strength">Strength</Label><Input id="diffusion-strength" type="number" min={0.1} max={1} step={0.05} value={Number(workflow.cleanup.strength.toFixed(2))} onChange={e=>cleanup({strength:Number(e.target.value)})}/></div></div>
          </>}
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void save()}>
          <Save className="size-4" />
          {busy ? "Saving…" : "Save providers"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
