import { randomUUID } from '../../lib/uuid';
import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Download,
  FilePlus,
  FolderOpen,
  ImagePlus,
  Play,
  Settings2,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  ArrowUp,
  ArrowDown,
  Languages,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMacOS } from "@/hooks/ui/useIsNativeApp";
import {
  defaultTextStyle,
  type EngineEvent,
  type ProjectSummary,
  type TranslationLayer,
  type TranslationProject,
  type TranslationSettings,
} from "@/core/translate/types";
import { ProviderSettings } from "@/components/translate/ProviderSettings";
import { LayerInspector } from "@/components/translate/LayerInspector";
import { EditorCanvas } from "@/components/translate/EditorCanvas";
import { PageThumbnail } from "@/components/translate/PageThumbnail";
import { LanguageInput } from "@/components/translate/LanguageInput";
import "@/components/translate/translate.css";

export default function TranslatePage() {
  const isMac = useIsMacOS();
  const bridge = window.electron?.translate;
  const { user, profile } = useAuth();
  const [project, setProject] = useState<TranslationProject | null>(null);
  const projectRef = useRef(project);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activePage, setActivePage] = useState("");
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [panel, setPanel] = useState<"properties" | "agent">("properties");
  const [newProject, setNewProject] = useState(false);
  const [name, setName] = useState("");
  const [credit, setCredit] = useState("");
  const [language, setLanguage] = useState("en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TranslationSettings>({
    providers: [],
    translationProvider: null,
    visionProvider: null,
  });
  const [scope, setScope] = useState("current");
  const [stages, setStages] = useState(["detect", "ocr", "translate", "cleanup"]);
  const [prompt, setPrompt] = useState("");
  const [visual, setVisual] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    []
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [resources, setResources] = useState("");
  const sequence = useRef(Promise.resolve());
  const mounted = useRef(true);
  const update = useCallback((value: TranslationProject | null) => {
    projectRef.current = value;
    setProject(value);
  }, []);
  const fail = useCallback((message: string) => setError(message), []);
  const loadSettings = useCallback(() => {
    if (bridge)
      void bridge
        .request("settings", {})
        .then(setSettings)
        .catch((e) => fail(e.message));
  }, [bridge, fail]);
  const list = useCallback(() => {
    if (bridge)
      void bridge
        .request("list", {})
        .then(setProjects)
        .catch((e) => fail(e.message));
  }, [bridge, fail]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setWorking(true);
    setError("");
    try {
      await sequence.current;
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation operation failed");
    } finally {
      setWorking(false);
    }
  }, []);
  const commit = useCallback(
    (edit: (draft: TranslationProject) => void) => {
      if (!bridge) return;
      sequence.current = sequence.current.then(async () => {
        if (!mounted.current || !projectRef.current) return;
        setWorking(true);
        setError("");
        const current = projectRef.current;
        const draft = structuredClone(current);
        edit(draft);
        try {
          update(
            await bridge.request("commit", {
              project: draft,
              revision: current.revision,
            })
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save changes");
        } finally {
          if (mounted.current) setWorking(false);
        }
      });
    },
    [bridge, update]
  );
  useEffect(() => {
    mounted.current = true;
    if (!bridge) return;
    void run(async () => {
      const state = await bridge.request("status", {});
      update(state.project);
      setProcessing(state.busy);
      list();
      loadSettings();
    });
    const unsubscribe = bridge.onEvent((event: EngineEvent) => {
      if (event.event === "project") update(event.project);
      if (event.event === "progress") setStatus(event.message);
      if (event.event === "error") {
        setProcessing(false);
        setStatus("");
        fail(event.message);
      }
      if (event.event === "complete") {
        setProcessing(false);
        setStatus(event.result.message || "Saved");
        if (event.result.message)
          setMessages((m) => [
            ...m,
            { role: "Yomi", text: event.result.message! },
          ]);
      }
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [bridge, run, list, loadSettings, update, fail]);
  useEffect(() => {
    if (!project?.pages.some((p) => p.id === activePage))
      setActivePage(project?.pages[0]?.id || "");
    setSelectedPages((ids) =>
      ids.filter((id) => project?.pages.some((p) => p.id === id))
    );
  }, [project, activePage]);
  useEffect(() => {
    setSelectedLayers([]);
  }, [activePage]);
  useEffect(() => {
    if (!bridge) return;
    const refresh = () =>
      void bridge
        .request("resources", {})
        .then((r) => {
          if (mounted.current)
            setResources(
              `${Math.round(
                (r.totalMemory - r.availableMemory) / 1024 ** 3
              )} / ${Math.round(r.totalMemory / 1024 ** 3)} GB · ${
                r.architecture
              }`
            );
        })
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [bridge]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (!projectRef.current || working || processing || !bridge) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void run(async () =>
          update(
            await bridge.request(e.shiftKey ? "redo" : "undo", {
              revision: projectRef.current!.revision,
            })
          )
        );
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedLayers.length
      ) {
        e.preventDefault();
        commit((p) => {
          const page = p.pages.find((pg) => pg.id === activePage);
          if (page)
            page.layers = page.layers.filter(
              (l) => !selectedLayers.includes(l.id)
            );
        });
        setSelectedLayers([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedLayers(
          projectRef.current.pages
            .find((pg) => pg.id === activePage)
            ?.layers.map((l) => l.id) || []
        );
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [
    bridge,
    working,
    processing,
    activePage,
    selectedLayers,
    commit,
    run,
    update,
  ]);
  const page = project?.pages.find((p) => p.id === activePage);
  const disabled = working || processing;
  const importFont=()=>void run(async()=>{
    if(!projectRef.current)return;
    const result=await bridge!.importFont({revision:projectRef.current.revision});
    if(result){update(result.project);setStatus(`Font added: ${result.family}`);}
  });
  const targets =
    scope === "project"
      ? project?.pages.map((p) => p.id) || []
      : scope === "selected"
      ? selectedPages
      : activePage
      ? [activePage]
      : [];
  const selectedForExport = selectedPages.length
    ? selectedPages
    : activePage
    ? [activePage]
    : [];
  const importPages = (folder = false) => {
    if (bridge && project)
      void run(async () => {
        const next = await bridge.importPages({
          revision: projectRef.current!.revision,
          folder,
        });
        if (next) update(next);
      });
  };
  const onLayerChange = (id: string, patch: Partial<TranslationLayer>) =>
    commit((p) => {
      const layer = p.pages
        .find((pg) => pg.id === activePage)
        ?.layers.find((l) => l.id === id);
      if (layer) Object.assign(layer, patch);
    });
  if (!bridge)
    return (
      <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-24">
        <Languages className="size-8 text-primary" />
        <h1 className="text-2xl font-semibold">Yomi</h1>
        <p className="text-muted-foreground">
          Create and translate manga projects in the Tatakai desktop app for
          Windows, Linux and macOS.
        </p>
        <Button asChild>
          <Link to="/download">Get the desktop app</Link>
        </Button>
      </div>
    );
  return (
    <div className="translate-workspace flex h-[var(--desktop-content-height,100dvh)] min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <header
        className={`flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 ${
          isMac ? "pl-24" : ""
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Back to Tatakai"
        >
          <Link to="/manga">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Languages className="mr-2 size-5 text-primary" />
        <span className="mr-3 text-sm font-semibold">Yomi</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              File
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={disabled}
              onSelect={() => {
                setCredit(profile?.display_name || profile?.username || "");
                setNewProject(true);
              }}
            >
              New project
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={() => void run(async () => {const restored=await bridge.restore();if(restored){update(restored);setMessages([]);}})}>Open project backup…</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() => importPages()}
            >
              Import pages…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() => importPages(true)}
            >
              Import folder…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!project||disabled} onSelect={importFont}>Add project font…</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!page || disabled}
              onSelect={() =>
                void run(async () => {
                  const result = await bridge.exportPages({
                    revision: projectRef.current!.revision,
                    pageIds: selectedForExport,
                    format: "png",
                  });
                  if (result) setStatus("PNG export complete");
                })
              }
            >
              Export PNG…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!page||disabled} onSelect={()=>void run(async()=>{const result=await bridge.exportPages({revision:projectRef.current!.revision,pageIds:selectedForExport,format:'psd'});if(result)setStatus('Layered PSD export complete');})}>Export layered PSD…</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() =>
                void run(async () => {
                  if (await bridge.backup())
                    setStatus("Portable project backup saved");
                })
              }
            >
              Back up project…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() =>
                void run(async () => {
                  await bridge.request("close", {});
                  update(null);
                  setMessages([]);
                  list();
                })
              }
            >
              Close project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() =>
                void run(async () =>
                  update(
                    await bridge.request("undo", {
                      revision: projectRef.current!.revision,
                    })
                  )
                )
              }
            >
              Undo
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!project || disabled}
              onSelect={() =>
                void run(async () =>
                  update(
                    await bridge.request("redo", {
                      revision: projectRef.current!.revision,
                    })
                  )
                )
              }
            >
              Redo
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!page||disabled} onSelect={()=>{
              commit(project=>{const current=project.pages.find(p=>p.id===activePage);if(current)current.layers=current.layers.filter(layer=>layer.kind!=='text'&&!layer.cleanup);});
              setSelectedLayers([]);
            }}>Reset page translation (undoable)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              Providers and models…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {project && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setMetadataOpen(true)}
          >
            Project details
          </Button>
        )}
        {project && (
          <span className="ml-auto max-w-64 truncate px-2 text-sm text-muted-foreground">
            {project.name}
            {page ? ` / ${page.label}` : ""}
          </span>
        )}
        {project && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !selectedForExport.length}
            onClick={() =>
              void run(async () => {
                const result = await bridge.exportPages({
                  revision: projectRef.current!.revision,
                  pageIds: selectedForExport,
                  format: "png",
                });
                if (result) setStatus("PNG export complete");
              })
            }
          >
            <Download className="size-4" />
            Export
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Translation settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="size-4" />
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
      {!project ? (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-8 py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">
                Your translation projects
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Import manga, translate dialogue, and refine every page.
                Projects stay on this device.
              </p>
            </div>
            <Button
              disabled={disabled}
              onClick={() => {
                setCredit(profile?.display_name || profile?.username || "");
                setNewProject(true);
              }}
            >
              <FilePlus className="mr-2 size-4" />
              New project
            </Button>
          </div>
          {projects.length ? (
            <div className="divide-y divide-border border-y border-border">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-4 py-4">
                  <BookOpen className="size-6 shrink-0 text-primary" />
                  <button
                    disabled={disabled}
                    className="min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      void run(async () => {
                        update(await bridge.request("open", { id: p.id }));
                        setMessages([]);
                      })
                    }
                  >
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {p.pages} pages · {p.targetLanguage} ·{" "}
                      {p.credit.name || "Uncredited"}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setDeleteId(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center">
              <FolderOpen className="size-10 text-muted-foreground" />
              <p className="font-medium">Start with a new project</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your original pages remain untouched. Use a portable project
                backup to move work between computers.
              </p>
            </div>
          )}
          <p className="mt-auto text-xs text-muted-foreground">{resources}</p>
        </main>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel
            defaultSize={18}
            minSize={12}
            maxSize={27}
            collapsible
            collapsedSize={0}
          >
            <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card/30">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold">
                  Pages{" "}
                  <span className="ml-1 text-muted-foreground">
                    {project.pages.length}
                  </span>
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label="Import pages"
                  onClick={() => importPages()}
                >
                  <ImagePlus className="size-4" />
                </Button>
              </div>
              <div className="relative px-3 pb-3">
                <Search className="pointer-events-none absolute left-6 top-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Filter pages"
                  placeholder="Filter pages"
                  className="pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
                {project.pages
                  .filter((p) =>
                    p.label.toLowerCase().includes(filter.toLowerCase())
                  )
                  .map((p, index) => (
                    <div
                      key={p.id}
                      className={`group flex gap-2 rounded-lg px-2 py-2 ${
                        p.id === activePage
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <ThemedCheckbox
                        type="checkbox"
                        className="mt-2 shrink-0 self-start"
                        aria-label={`Select ${p.label}`}
                        checked={selectedPages.includes(p.id)}
                        onChange={(e) =>
                          setSelectedPages((ids) =>
                            e.target.checked
                              ? [...ids, p.id]
                              : ids.filter((id) => id !== p.id)
                          )
                        }
                      />
                      <button
                        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setActivePage(p.id)}
                      >
                        <PageThumbnail page={p} bridge={bridge} index={index} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="block truncate text-sm font-medium">
                            {p.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {p.layers.length} layers
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {p.width} × {p.height}
                          </span>
                        </span>
                      </button>
                    </div>
                  ))}
              </div>
              {page && (
                <fieldset
                  disabled={disabled}
                  className="flex flex-col gap-2 border-t border-border p-3"
                >
                  <legend className="sr-only">Page actions</legend>
                  <Input
                    aria-label="Page name"
                    key={`${page.id}-${page.label}`}
                    defaultValue={page.label}
                    onBlur={(e) => {
                      const label = e.target.value;
                      if (label !== page.label)
                        commit((p) => {
                          const pg = p.pages.find((v) => v.id === page.id);
                          if (pg) pg.label = label;
                        });
                    }}
                  />
                  <div className="flex gap-1">
                    {[-1, 1].map((direction) => (
                      <Button
                        key={direction}
                        variant="ghost"
                        size="icon"
                        aria-label={
                          direction === -1
                            ? "Move page earlier"
                            : "Move page later"
                        }
                        onClick={() =>
                          commit((p) => {
                            const from = p.pages.findIndex(
                              (pg) => pg.id === activePage
                            );
                            const to = from + direction;
                            if (to >= 0 && to < p.pages.length)
                              [p.pages[from], p.pages[to]] = [
                                p.pages[to],
                                p.pages[from],
                              ];
                          })
                        }
                      >
                        {direction === -1 ? (
                          <ArrowUp className="size-4" />
                        ) : (
                          <ArrowDown className="size-4" />
                        )}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete selected pages"
                      onClick={() =>
                        commit((p) => {
                          const ids = selectedPages.length
                            ? selectedPages
                            : [activePage];
                          p.pages = p.pages.filter(
                            (pg) => !ids.includes(pg.id)
                          );
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </fieldset>
              )}
              <div className="border-t border-border p-3 text-xs text-muted-foreground">
                {resources}
              </div>
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={58} minSize={35}>
            <section className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border p-2">
                <ThemedSelect
                  aria-label="Processing scope"
                  className="h-9 max-w-40 rounded-md border border-input bg-background px-2 text-xs"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="current">Current page</option>
                  <option value="selected">Selected pages</option>
                  <option value="project">Entire project</option>
                  <option value="layers">Selected layers</option>
                </ThemedSelect>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Stages ({stages.length})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={()=>setStages(["detect","ocr","translate","cleanup"])}>Full translation</DropdownMenuItem>
                    <DropdownMenuItem onSelect={()=>setStages(["detect","ocr","cleanup"])}>Clean text only</DropdownMenuItem>
                    <DropdownMenuSeparator/>
                    {["detect", "ocr", "translate", "cleanup"].map((stage) => (
                      <DropdownMenuItem
                        key={stage}
                        onSelect={(e) => {
                          e.preventDefault();
                          setStages((current) =>
                            current.includes(stage)
                              ? current.filter((v) => v !== stage)
                              : [...current, stage]
                          );
                        }}
                      >
                        <ThemedCheckbox
                          type="checkbox"
                          tabIndex={-1}
                          readOnly
                          checked={stages.includes(stage)}
                          className="mr-2"
                        />
                        {stage === "ocr"
                          ? "OCR"
                          : stage === "detect"
                          ? "Detection"
                          : stage === "cleanup" ? "Cleanup" : "Translation"}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="max-w-36 truncate text-xs text-muted-foreground">
                  {settings.offlineOnly ? "Offline only" : settings.providers.find(
                    (p) => p.id === settings.translationProvider
                  )?.name || "Configure a provider"}
                </span>
                {stages.includes('translate')&&!stages.includes('cleanup')&&<span className="text-xs text-muted-foreground">Cleanup off: original lettering will remain</span>}
                {processing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        await bridge.request("cancel", {});
                        setStatus("Stopping at the next safe boundary…");
                      })
                    }
                  >
                    <Square className="mr-1 size-3" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={
                      disabled ||
                      !targets.length ||
                      !stages.length ||
                      (scope === "layers" &&
                        (!selectedLayers.length ||
                          !stages.some((s) => s !== "detect")))
                    }
                    onClick={() =>
                      void run(async () => {
                        await sequence.current;
                        setProcessing(true);
                        setStatus("Starting processing…");
                        try {
                          await bridge.request("process", {
                            revision: projectRef.current!.revision,
                            pageIds: targets,
                            stages:
                              scope === "layers"
                                ? stages.filter((s) => s !== "detect")
                                : stages,
                            ...(scope === "layers"
                              ? { layerIds: selectedLayers }
                              : {}),
                          });
                        } catch (error) {
                          setProcessing(false);
                          throw error;
                        }
                      })
                    }
                  >
                    <Play className="mr-1 size-4" />
                    {stages.length===4&&scope!=="layers"?"Translate":"Run"}
                  </Button>
                )}
              </div>
              {page ? (
                <EditorCanvas
                  page={page}
                  revision={project.revision}
                  bridge={bridge}
                  selected={selectedLayers}
                  onSelect={setSelectedLayers}
                  disabled={disabled}
                  onError={fail}
                  onMove={(ids, dx, dy) =>
                    commit((p) => {
                      p.pages
                        .find((pg) => pg.id === activePage)
                        ?.layers.forEach((l) => {
                          if (ids.includes(l.id)) {
                            l.x += dx;
                            l.y += dy;
                          }
                        });
                    })
                  }
                  onText={(rect) => {
                    const id = randomUUID();
                    commit((p) => {
                      p.pages
                        .find((pg) => pg.id === activePage)
                        ?.layers.push({
                          id,
                          name: "Text",
                          kind: "text",
                          source: "",
                          translation: "",
                          sourceEdited: false,
                          translationEdited: false,
                          style: { ...defaultTextStyle },
                          ...rect,
                          rotation: 0,
                          visible: true,
                          opacity: 1,
                        });
                    });
                    setSelectedLayers([id]);
                  }}
                  onPaint={async (stroke) => {
                    await run(async () => {
                      await sequence.current;
                      const next = await bridge.request("stroke", {
                        ...stroke,
                        revision: projectRef.current!.revision,
                        pageId: activePage,
                      });
                      update(next);
                      const changedPage = next.pages.find(
                        (p) => p.id === activePage
                      );
                      if (changedPage)
                        setSelectedLayers([
                          stroke.layerId ||
                            changedPage.layers[changedPage.layers.length - 1]
                              .id,
                        ]);
                    });
                  }}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-muted/20 p-8 text-center">
                  <ImagePlus className="size-10 text-muted-foreground" />
                  <h2 className="text-lg font-medium">
                    Import your manga pages
                  </h2>
                  <p className="max-w-sm text-sm text-muted-foreground">
                      Choose images, a folder, an archive or a PDF to begin.
                  </p>
                  <Button disabled={disabled} onClick={() => importPages()}>
                    <FolderOpen className="mr-2 size-4" />
                    Import pages
                  </Button>
                </div>
              )}
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-8 shrink-0 items-center justify-between gap-2 border-t border-border px-3 text-xs text-muted-foreground"
              >
                <span className="truncate">
                  {status ||
                    (working
                      ? "Saving…"
                      : `Saved · Revision ${project.revision}`)}
                </span>
                <span className="shrink-0">
                  {project.targetLanguage} ·{" "}
                  {project.credit.name || "Uncredited"}
                </span>
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={24}
            minSize={18}
            maxSize={35}
            collapsible
            collapsedSize={0}
          >
            <aside className="flex h-full min-h-0 flex-col border-l border-border">
              <div className="flex shrink-0 gap-1 border-b border-border p-2">
                <Button
                  size="sm"
                  className="flex-1"
                  variant={panel === "properties" ? "outline" : "ghost"}
                  aria-pressed={panel === "properties"}
                  onClick={() => setPanel("properties")}
                >
                  <SlidersHorizontal className="mr-2 size-4" />
                  Properties
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  variant={panel === "agent" ? "outline" : "ghost"}
                  aria-pressed={panel === "agent"}
                  onClick={() => setPanel("agent")}
                >
                  <Bot className="mr-2 size-4" />
                  Agent
                </Button>
              </div>
              {panel === "properties" ? (
                page ? (
                  <LayerInspector
                    page={page}
                    selected={selectedLayers}
                    onSelect={setSelectedLayers}
                    onChange={onLayerChange}
                    disabled={disabled}
                    fonts={project.fonts?.map(font=>font.family)}
                    onImportFont={importFont}
                    onDelete={() => {
                      commit((p) => {
                        const pg = p.pages.find((v) => v.id === activePage);
                        if (pg)
                          pg.layers = pg.layers.filter(
                            (l) => !selectedLayers.includes(l.id)
                          );
                      });
                      setSelectedLayers([]);
                    }}
                    onReorder={(id, direction) =>
                      commit((p) => {
                        const layers = p.pages.find(
                          (pg) => pg.id === activePage
                        )?.layers;
                        if (!layers) return;
                        const index = layers.findIndex((l) => l.id === id);
                        const next = index + direction;
                        if (index >= 0 && next >= 0 && next < layers.length)
                          [layers[index], layers[next]] = [
                            layers[next],
                            layers[index],
                          ];
                      })
                    }
                  />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    Import a page to start editing.
                  </p>
                )
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                    {messages.length ? (
                      messages.map((m, i) => (
                        <div key={i}>
                          <p className="text-xs font-medium text-primary">
                            {m.role}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {m.text}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Ask to translate a page, add text boxes, or review its
                        translation. Choose any language and writing system in
                        your request. Reading images requires a vision provider
                        in Settings. Changes can be undone.
                      </p>
                    )}
                  </div>
                  <form
                    className="flex flex-col gap-3 border-t border-border p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = prompt.trim();
                      if (!text || disabled) return;
                      void run(async () => {
                        await sequence.current;
                        setProcessing(true);
                        setMessages((m) => [...m, { role: "You", text }]);
                        try {
                          await bridge.request("assistant", {
                            revision: projectRef.current!.revision,
                            prompt: text,
                            visual,
                            pageId: activePage,
                            history: messages.slice(-12).map(m=>({...m,text:m.text.slice(0,600)})),
                          });
                        } catch (error) {
                          setProcessing(false);
                          throw error;
                        }
                        setPrompt("");
                      });
                    }}
                  >
                    <Textarea
                      aria-label="Ask Yomi assistant"
                      placeholder="Translate this page into your chosen language…"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      maxLength={16000}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ThemedCheckbox
                        type="checkbox"
                        checked={visual}
                        onChange={(e) => setVisual(e.target.checked)}
                      />
                      Include active page image
                    </label>
                    <Button
                      disabled={
                        disabled ||
                        !prompt.trim() ||
                        !settings.translationProvider
                      }
                      type="submit"
                    >
                      {processing ? "Working…" : "Send request"}
                    </Button>
                  </form>
                </div>
              )}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
      <ProviderSettings
        bridge={bridge}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={loadSettings}
      />
      <Dialog open={metadataOpen} onOpenChange={setMetadataOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project details</DialogTitle>
            <DialogDescription>
              Translator credit and languages are saved with your project and
              export manifest.
            </DialogDescription>
          </DialogHeader>
          {project && (
            <form
              key={project.id}
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                commit((p) => {
                  p.name = String(data.get("name"));
                  p.credit.name = String(data.get("credit"));
                  p.sourceLanguage = String(data.get("sourceLanguage"));
                  p.targetLanguage = String(data.get("targetLanguage"));
                });
                setMetadataOpen(false);
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meta-name">Project name</Label>
                <Input
                  id="meta-name"
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={project.name}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meta-credit">Translator credit</Label>
                <Input
                  id="meta-credit"
                  name="credit"
                  required
                  maxLength={200}
                  defaultValue={project.credit.name}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="meta-source">Source language</Label>
                  <Input
                    id="meta-source"
                    name="sourceLanguage"
                    required
                    maxLength={35}
                    defaultValue={project.sourceLanguage}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="meta-target">Target language</Label>
                  <LanguageInput
                    id="meta-target"
                    name="targetLanguage"
                    required
                    maxLength={35}
                    defaultValue={project.targetLanguage}
                  />
                  <p className="text-xs text-muted-foreground">Choose a language or enter a language/script tag for your model.</p>
                </div>
              </div>
              {project.mapping && (
                <p className="text-sm text-muted-foreground">
                  {project.mapping.title} · {project.mapping.chapterId} ·{" "}
                  {project.mapping.sourceId}
                </p>
              )}
              <Button type="submit" disabled={disabled}>
                Save details
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={newProject} onOpenChange={setNewProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New translation project</DialogTitle>
            <DialogDescription>
              Stored on this device. Your translator credit and language travel
              with the project and exports.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                update(
                  await bridge.request("create", {
                    name,
                    credit: { name: credit, userId: user?.id || null },
                    targetLanguage: language,
                  })
                );
                setNewProject(false);
                setName("");
                setMessages([]);
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="translator-credit">Translator credit</Label>
              <Input
                id="translator-credit"
                required
                maxLength={200}
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-language">Target language code</Label>
              <LanguageInput
                id="target-language"
                required
                maxLength={35}
                placeholder="en, hi, ja, ar…"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            <Button
              disabled={working || !name.trim() || !credit.trim()}
              type="submit"
            >
              <FilePlus className="mr-2 size-4" />
              Create project
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project permanently?</DialogTitle>
            <DialogDescription>
              This removes its pages, translations and artwork from this device.
              Export a backup first if you need to keep it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={working}
              onClick={() =>
                void run(async () => {
                  await bridge.request("delete", { id: deleteId! });
                  setDeleteId(null);
                  list();
                })
              }
            >
              Delete project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
