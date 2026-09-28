import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Globe, FileCode, CheckCircle2, Loader2,
  AlertCircle, AlertTriangle, Sparkles, FolderUp, Link as LinkIcon, Code, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ExtensionManifest } from '@/pages/base/ExtensionHubPage';

interface SideloadExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (extension: ExtensionManifest) => void;
}

type SideloadTab = 'file' | 'url' | 'code';

export function SideloadExtensionModal({ isOpen, onClose, onSuccess }: SideloadExtensionModalProps) {
  const [tab, setTab] = useState<SideloadTab>('file');

  // Form states
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedManifest, setParsedManifest] = useState<Partial<ExtensionManifest> | null>(null);
  
  const [urlInput, setUrlInput] = useState<string>('');
  const [codeInput, setCodeInput] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileIsKai, setFileIsKai] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const resetState = () => {
    setTab('file');
    setFileBuffer(null);
    setFileName('');
    setParsedManifest(null);
    setUrlInput('');
    setCodeInput('');
    setIsProcessing(false);
    setErrorMsg(null);
    setFileIsKai(false);
    setIsDragging(false);
    setAcknowledged(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseAndValidateManifest = (text: string): ExtensionManifest => {
    try {
      const json = JSON.parse(text);
      if (!json.name) throw new Error('Manifest missing "name" field');
      
      const manifest: ExtensionManifest = {
        id: json.id || json.extension_id || `sideload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(json.name).trim(),
        description: json.description || 'Sideloaded custom extension',
        version: json.version || '1.0.0',
        author: json.author || json.author_name || 'Local Developer',
        icon: json.icon || json.icon_url || undefined,
        banner: json.banner || json.banner_url || undefined,
        screenshots: Array.isArray(json.screenshots) ? json.screenshots : [],
        categories: Array.isArray(json.categories) ? json.categories : ['custom'],
        permissions: Array.isArray(json.permissions) ? json.permissions : [],
        isApproved: true,
        downloads: 1,
        rating: 5,
        updatedAt: new Date().toISOString(),
        type: (['torrent', 'onlinestream', 'custom'].includes(json.type) ? json.type : 'custom') as any,
        status: 'approved',
      };
      return manifest;
    } catch (err: any) {
      throw new Error(`Invalid manifest JSON: ${err?.message || 'Syntax error'}`);
    }
  };

  // A .kai is a ZIP archive; its first two bytes are the "PK" local-file header.
  // Detecting it lets us route the raw bytes to the desktop runtime for real
  // parsing/validation (parseKaiFile) instead of trying to JSON.parse binary.
  const looksLikeZip = (buffer: ArrayBuffer): boolean => {
    const head = new Uint8Array(buffer.slice(0, 2));
    return head[0] === 0x50 && head[1] === 0x4b; // 'P','K'
  };

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      setFileBuffer(buffer);

      const isKai = file.name.toLowerCase().endsWith('.kai') || looksLikeZip(buffer);
      setFileIsKai(isKai);

      if (isKai) {
        // The real manifest lives inside the archive; it is parsed and validated
        // main-side by parseKaiFile on submit. Show a filename-based preview only.
        const fallbackName = file.name.replace(/\.[^/.]+$/, '');
        setParsedManifest({
          name: fallbackName,
          description: 'Sideloaded .kai extension bundle',
          version: '—',
          author: 'Pending validation',
          type: 'custom',
        });
        toast.success(`Loaded .kai bundle "${file.name}"`);
        return;
      }

      // Plain-text manifest (.json / .js): parse it now for a real preview.
      const text = await file.text();
      const manifest = parseAndValidateManifest(text);
      setParsedManifest(manifest);
      toast.success(`Loaded manifest for "${manifest.name}"`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to read file');
      setFileBuffer(null);
      setParsedManifest(null);
      setFileIsKai(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const persistSideloaded = (manifest: ExtensionManifest) => {
    const sideloaded: ExtensionManifest[] = JSON.parse(localStorage.getItem('tatakai_sideloaded_extensions') ?? '[]');
    const filtered = sideloaded.filter(e => e.id !== manifest.id);
    localStorage.setItem('tatakai_sideloaded_extensions', JSON.stringify([manifest, ...filtered]));

    const installed: string[] = JSON.parse(localStorage.getItem('tatakai_installed_extensions') ?? '[]');
    if (!installed.includes(manifest.id)) {
      localStorage.setItem('tatakai_installed_extensions', JSON.stringify([...installed, manifest.id]));
    }

    // Notify the rest of the app (hooks, hub page) that a new extension exists.
    window.dispatchEvent(new CustomEvent('tatakai:extension-sideloaded', { detail: manifest }));
  };

  // Build a client-side ExtensionManifest from the main-validated .kai manifest.
  const manifestFromKai = (m: any, extensionId: string, hasIcon: boolean): ExtensionManifest => ({
    id: extensionId || m.id,
    name: m.name,
    description: m.description || 'Sideloaded .kai extension',
    version: m.version || '1.0.0',
    author: m.author || 'Sideloaded',
    icon: hasIcon ? undefined : (m.icon || undefined),
    banner: m.banner || undefined,
    screenshots: Array.isArray(m.screenshots) ? m.screenshots : [],
    categories: Array.isArray(m.categories) ? m.categories
      : (Array.isArray(m.capabilities) ? m.capabilities : ['sideloaded']),
    permissions: Array.isArray(m.permissions) ? m.permissions : [],
    isApproved: true,
    downloads: 1,
    rating: 5,
    updatedAt: new Date().toISOString(),
    type: (['torrent', 'onlinestream', 'custom'].includes(m.type) ? m.type : 'custom') as any,
    status: 'approved',
  });

  // Install a raw .kai bundle: hand the bytes to the desktop runtime, which
  // parses + validates the archive main-side (signature, safe id, size limits)
  // and returns the real manifest. This is the ONLY correct path for .kai.
  const installKaiBundle = async (buffer: ArrayBuffer): Promise<ExtensionManifest> => {
    const tatakaiRuntime = (window as any).tatakaiRuntime;
    if (!tatakaiRuntime?.loadKaiExtension) {
      throw new Error('.kai bundles can only be installed in the Tatakai desktop app.');
    }
    const result = await tatakaiRuntime.loadKaiExtension(buffer);
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to install .kai bundle');
    }
    return manifestFromKai(result.manifest || {}, result.extensionId, !!result.hasIcon);
  };

  // Install a JSON manifest — a data-only sideload with no executable bundle.
  const installManifest = async (manifest: ExtensionManifest): Promise<ExtensionManifest> => {
    const tatakaiRuntime = (window as any).tatakaiRuntime;
    if (tatakaiRuntime?.sideloadManifest) {
      const result = await tatakaiRuntime.sideloadManifest(manifest);
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to sideload manifest');
      }
    } else if (tatakaiRuntime?.loadExtension) {
      await tatakaiRuntime.loadExtension(manifest.id, manifest);
    }
    return manifest;
  };

  const fetchUrlBuffer = async (url: string): Promise<ArrayBuffer> => {
    const isExternal = /^https?:\/\//i.test(url);
    let response: Response;
    if (isExternal) {
      // Absolute backend origin, never a relative `/api/proxy/raw`: on desktop
      // the renderer runs from app://tatakai.me, where a relative path is served
      // the SPA shell (index.html) instead of proxied bytes — which then failed
      // to parse as a ZIP. Fall back to a direct fetch if the proxy misses.
      const backendOrigin = (() => {
        const explicit = String(import.meta.env.VITE_BACKEND_ORIGIN || '').trim();
        if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
        const apiUrl = String(import.meta.env.VITE_TATAKAI_API_URL || '').trim();
        try { if (apiUrl) return new URL(apiUrl).origin; } catch { /* noop */ }
        if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
          return window.location.origin;
        }
        return '';
      })();
      try {
        response = await fetch(`${backendOrigin}/api/proxy/raw?url=${encodeURIComponent(url)}`);
        if (!response.ok) response = await fetch(url);
      } catch {
        response = await fetch(url);
      }
    } else {
      response = await fetch(url);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch URL`);
    return response.arrayBuffer();
  };

  const finishSideload = (manifest: ExtensionManifest) => {
    persistSideloaded(manifest);
    toast.success(`Extension "${manifest.name}" sideloaded successfully!`);
    if (onSuccess) onSuccess(manifest);
    handleClose();
  };

  const handleSideloadSubmit = async () => {
    if (!acknowledged) {
      return setErrorMsg('Please acknowledge the security warning before continuing.');
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      if (tab === 'file') {
        if (!fileBuffer) throw new Error('Please select a valid .kai or .json manifest file');
        if (fileIsKai) {
          finishSideload(await installKaiBundle(fileBuffer));
        } else {
          if (!parsedManifest?.name) throw new Error('Invalid manifest file');
          finishSideload(await installManifest(parsedManifest as ExtensionManifest));
        }
      } else if (tab === 'url') {
        const url = urlInput.trim();
        if (!url) throw new Error('URL is required');
        const buffer = await fetchUrlBuffer(url);
        if (looksLikeZip(buffer) || url.toLowerCase().endsWith('.kai')) {
          finishSideload(await installKaiBundle(buffer));
        } else {
          const text = new TextDecoder().decode(buffer);
          finishSideload(await installManifest(parseAndValidateManifest(text)));
        }
      } else {
        const code = codeInput.trim();
        if (!code) throw new Error('Manifest code is required');
        finishSideload(await installManifest(parseAndValidateManifest(code)));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sideload extension');
      toast.error(err.message || 'Sideload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-xl bg-card/90 backdrop-blur-2xl border-white/10 p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-8 border-b border-white/5 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/20">
                <FolderUp className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Sideload Extension</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground font-medium mt-0.5">
                  Directly load local or external Tatakai extensions into runtime
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Selection */}
        <div className="px-8 pt-6">
          <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { setTab('file'); setErrorMsg(null); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                tab === 'file' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Upload className="w-4 h-4" /> File Upload
            </button>
            <button
              type="button"
              onClick={() => { setTab('url'); setErrorMsg(null); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                tab === 'url' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <LinkIcon className="w-4 h-4" /> Direct URL
            </button>
            <button
              type="button"
              onClick={() => { setTab('code'); setErrorMsg(null); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                tab === 'code' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Code className="w-4 h-4" /> Manifest JSON
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {tab === 'file' && (
            <div className="space-y-4">
              <label
                htmlFor="sideload-file"
                className="block cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
              >
                <input
                  id="sideload-file"
                  type="file"
                  accept=".kai,.json,.js,application/octet-stream"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className={cn(
                  "border-2 border-dashed rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center gap-3",
                  parsedManifest
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : isDragging
                      ? "bg-primary/10 border-primary/60 text-primary"
                      : "bg-white/5 border-white/10 hover:border-primary/50 hover:bg-white/10"
                )}>
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  ) : parsedManifest ? (
                    <>
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                      <div>
                        <p className="font-black text-lg text-white">{parsedManifest.name}</p>
                        <p className="text-xs text-emerald-400/80 font-bold mt-1">
                          v{parsedManifest.version} • By {parsedManifest.author} ({fileName})
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <FileCode className="w-12 h-12 text-muted-foreground" />
                      <div>
                        <p className="font-bold text-sm">Click to browse or drop file</p>
                        <p className="text-xs text-muted-foreground mt-1">Supports .kai, .json, and .js extensions</p>
                      </div>
                    </>
                  )}
                </div>
              </label>
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Extension Manifest or Raw URL
              </label>
              <Input
                placeholder="https://raw.githubusercontent.com/.../extension.json"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                className="h-14 bg-white/5 border-white/10 rounded-2xl text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground ml-1">
                Enter a raw GitHub or direct HTTP link pointing to a manifest JSON or .kai file.
              </p>
            </div>
          )}

          {tab === 'code' && (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Manifest JSON Content
              </label>
              <Textarea
                placeholder='{\n  "id": "my-extension",\n  "name": "Custom Source",\n  "version": "1.0.0",\n  "type": "onlinestream"\n}'
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                className="h-44 bg-white/5 border-white/10 rounded-2xl text-xs font-mono"
              />
            </div>
          )}

          {/* Error display */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Security warning — sideloaded extensions are NOT sandboxed */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Sideloading grants full app privileges
                </p>
                <p className="text-[11px] leading-relaxed text-amber-200/80">
                  A sideloaded extension is <span className="font-bold">trusted</span> and runs with the same
                  access as Tatakai itself — it is <span className="font-bold">not sandboxed</span>. It can run
                  arbitrary code, read your app data, and make network requests. Only install extensions whose
                  source you have reviewed or whose author you trust. Treat an unknown
                  <span className="font-mono"> .kai</span> like an unknown <span className="font-mono">.exe</span>.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none pl-8">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="w-4 h-4 rounded border-amber-500/40 bg-transparent accent-amber-500 cursor-pointer"
              />
              <span className="text-[11px] font-bold text-amber-200/90">
                I understand and trust this extension.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-card flex items-center justify-between">
          <Button variant="ghost" onClick={handleClose} disabled={isProcessing} className="rounded-xl h-12">
            Cancel
          </Button>
          <Button
            onClick={handleSideloadSubmit}
            disabled={isProcessing || !acknowledged}
            className={cn(
              "rounded-2xl h-12 px-8 bg-primary text-primary-foreground font-black text-sm shadow-xl shadow-primary/20 transition-all",
              (isProcessing || !acknowledged) ? "opacity-50 cursor-not-allowed" : "hover:scale-105"
            )}
          >
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Installing...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Sideload Now</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
