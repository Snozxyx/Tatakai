export interface TranslatorCredit {
  name: string;
  userId: string | null;
}
export interface MangaMapping {
  mangaId: string;
  chapterId: string;
  sourceId: string;
  title: string;
}
export interface TextStyle {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  fill: number[];
  stroke: number[];
  strokeWidth: number;
  align: "left" | "center" | "right";
  direction: "auto" | "ltr" | "rtl" | "vertical-rl";
  autoFit: boolean;
}
interface LayerBase {
  sourceRegion?: {x:number;y:number;width:number;height:number};
  cleanup?: {mask:string;sourceBlob:string;method:"edge-fill"|"diffusion";runtime:string;edited?:boolean};
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface TextLayer extends LayerBase {
  kind: "text";
  source: string;
  translation: string;
  style: TextStyle;
  sourceEdited: boolean;
  translationEdited: boolean;
}
export interface RasterLayer extends LayerBase {
  kind: "raster";
  blob: string;
}
export type TranslationLayer = TextLayer | RasterLayer;
export interface TranslationPage {
  id: string;
  label: string;
  blob: string;
  width: number;
  height: number;
  layers: TranslationLayer[];
}
export interface TranslationProject {
  schema: 1;
  id: string;
  name: string;
  revision: number;
  sourceLanguage: string;
  targetLanguage: string;
  credit: TranslatorCredit;
  mapping: MangaMapping | null;
  pages: TranslationPage[];
  fonts?: {blob:string;family:string}[];
}
export interface ProjectSummary {
  id: string;
  name: string;
  pages: number;
  credit: TranslatorCredit;
  targetLanguage: string;
}
export interface TranslationProvider {
  id: string;
  name: string;
  kind:
    | "openai-compatible"
    | "anthropic"
    | "gemini"
    | "deepl"
    | "google"
    | "caiyun";
  endpoint: string;
  model: string;
}
export interface TranslationSettings {
  offlineOnly?: boolean;
  providers: TranslationProvider[];
  translationProvider: string | null;
  visionProvider: string | null;
  workflow?: {
    includeOutsideText: boolean;
    cleanup: {mode:"edge-fill"|"diffusion";endpoint:string;steps:number;strength:number};
  };
}
export type EngineEvent =
  | { event: "project"; project: TranslationProject }
  | { event: "progress"; pageId: string; stage: string; message: string }
  | { event: "complete"; result: { message?: string; edits?: number } }
  | { event: "error"; message: string };
interface Commands {
  list: { args: Record<string, never>; result: ProjectSummary[] };
  create: {
    args: {
      name: string;
      credit: TranslatorCredit;
      targetLanguage?: string;
      mapping?: MangaMapping;
    };
    result: TranslationProject;
  };
  open: { args: { id: string }; result: TranslationProject };
  close: { args: Record<string, never>; result: null };
  delete: { args: { id: string }; result: null };
  status: {
    args: Record<string, never>;
    result: { project: TranslationProject | null; busy: boolean };
  };
  resources: {
    args: Record<string, never>;
    result: {
      totalMemory: number;
      availableMemory: number;
      architecture: string;
      platform: string;
      busy: boolean;
    };
  };
  commit: {
    args: { project: TranslationProject; revision: number };
    result: TranslationProject;
  };
  undo: { args: { revision: number }; result: TranslationProject };
  redo: { args: { revision: number }; result: TranslationProject };
  render: {
    args: { pageId: string; maxWidth?: number };
    result: { png: string; revision: number };
  };
  stroke: {
    args: {
      revision: number;
      pageId: string;
      layerId: string | null;
      mode: "brush" | "eraser";
      diameter: number;
      color: number[];
      points: number[][];
    };
    result: TranslationProject;
  };
  settings: { args: Record<string, never>; result: TranslationSettings };
  saveSettings: {
    args: { settings: TranslationSettings };
    result: TranslationSettings;
  };
  setKey: {
    args: { providerId: string; key: string };
    result: { saved: boolean };
  };
  process: {
    args: {
      revision: number;
      pageIds: string[];
      layerIds?: string[];
      stages: string[];
    };
    result: { started: boolean };
  };
  assistant: {
    args: {
      revision: number;
      prompt: string;
      visual: boolean;
      pageId?: string;
      history?: { role: string; text: string }[];
    };
    result: { started: boolean };
  };
  cancel: { args: Record<string, never>; result: { stopping: boolean } };
}
export interface OfflineModelStatus {installed:boolean;installing:boolean;message:string;name:string|null;bytes:number;source:string;license:string;running:boolean;loading:boolean;vision?:boolean;}
export interface TranslationBridge {
  offlineStatus():Promise<OfflineModelStatus>;
  setupOffline(args:{download:boolean}):Promise<OfflineModelStatus>;
  cancelOfflineSetup():Promise<{stopping:boolean}>;
  importFont(args:{revision:number}):Promise<{project:TranslationProject;family:string}|null>;
  modelStatus(): Promise<{running:boolean;loading:boolean;name:string|null}>;
  startModel(args:{vision:boolean}): Promise<{running:boolean;loading:boolean;name:string|null}|null>;
  stopModel(): Promise<{running:boolean;loading:boolean;name:string|null}>;
  request<C extends keyof Commands>(
    command: C,
    args: Commands[C]["args"]
  ): Promise<Commands[C]["result"]>;
  importPages(args: {
    revision: number;
    folder: boolean;
  }): Promise<TranslationProject | null>;
  exportPages(args: {
    revision: number;
    pageIds: string[];
    format: "png" | "psd";
  }): Promise<{ exported: boolean } | null>;
  backup(): Promise<{ exported: boolean } | null>;
  restore(): Promise<TranslationProject | null>;
  importChapter(args: {
    anilistId: number;
    chapterKey: string;
    chapterLabel?: string;
    customRoot?: string;
    credit: TranslatorCredit;
    targetLanguage?: string;
  }): Promise<
    | { success: true; project: TranslationProject }
    | { success: false; reason: "download_required" }
  >;
  onEvent(callback: (event: EngineEvent) => void): () => void;
}
export const defaultTextStyle: TextStyle = {
  family: "sans-serif",
  size: 28,
  weight: 400,
  italic: false,
  fill: [0, 0, 0, 255],
  stroke: [255, 255, 255, 255],
  strokeWidth: 0,
  align: "center",
  direction: "auto",
  autoFit: true,
};
