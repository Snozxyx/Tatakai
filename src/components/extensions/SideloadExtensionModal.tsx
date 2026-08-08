import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Globe, FileCode, CheckCircle2, Loader2,
  AlertCircle, Shield, Sparkles, FolderUp, Link as LinkIcon, Code, X
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

  const resetState = () => {
    setTab('file');
    setFileBuffer(null);
    setFileName('');
    setParsedManifest(null);
    setUrlInput('');
    setCodeInput('');
    setIsProcessing(false);
    setErrorMsg(null);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      setFileBuffer(buffer);

      // Read text content if .json or .manifest or .js
      const text = await file.text();
      try {
        const manifest = parseAndValidateManifest(text);
        setParsedManifest(manifest);
        toast.success(`Loaded manifest for "${manifest.name}"`);
      } catch {
        // Fallback generic manifest for binary .kai bundles
        const fallbackName = file.name.replace(/\.[^/.]+$/, "");
        setParsedManifest({
          id: `sideload_${fallbackName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: fallbackName,
          description: 'Sideloaded .kai extension bundle',
          version: '1.0.0',
          author: 'Sideloaded',
          categories: ['sideloaded'],
          type: 'custom',
          isApproved: true,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to read file');
      setFileBuffer(null);
      setParsedManifest(null);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const executeSideload = async (manifest: ExtensionManifest, rawBundleCode?: string) => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // 1. Desktop IPC sideloading if available
      const tatakaiRuntime = (window as any).tatakaiRuntime;
      if (tatakaiRuntime?.sideloadManifest) {
        await tatakaiRuntime.sideloadManifest(manifest, rawBundleCode);
      } else if (tatakaiRuntime?.loadExtension) {
        await tatakaiRuntime.loadExtension(manifest.id, manifest);
      }

      // 2. Persist to localStorage for client-side state
      const sideloaded: ExtensionManifest[] = JSON.parse(localStorage.getItem('tatakai_sideloaded_extensions') ?? '[]');
      const filtered = sideloaded.filter(e => e.id !== manifest.id);
      const updatedSideloaded = [manifest, ...filtered];
      localStorage.setItem('tatakai_sideloaded_extensions', JSON.stringify(updatedSideloaded));

      const installed: string[] = JSON.parse(localStorage.getItem('tatakai_installed_extensions') ?? '[]');
      if (!installed.includes(manifest.id)) {
        localStorage.setItem('tatakai_installed_extensions', JSON.stringify([...installed, manifest.id]));
      }

      // 3. Dispatch global event to update UI across pages
      window.dispatchEvent(new CustomEvent('tatakai:extension-sideloaded', { detail: manifest }));

      toast.success(`Extension "${manifest.name}" sideloaded successfully!`);
      if (onSuccess) onSuccess(manifest);
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sideload extension');
      toast.error(err.message || 'Sideload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSideloadSubmit = async () => {
    if (tab === 'file') {
      if (!parsedManifest?.name) {
        return setErrorMsg('Please select a valid .kai or .json manifest file');
      }
      await executeSideload(parsedManifest as ExtensionManifest);
    } else if (tab === 'url') {
      const url = urlInput.trim();
      if (!url) return setErrorMsg('URL is required');

      setIsProcessing(true);
      setErrorMsg(null);
      try {
        // Route through the backend proxy to avoid CORS on external CDNs
        const isExternal = /^https?:\/\//i.test(url);
        let response: Response;
        if (isExternal) {
          try {
            response = await fetch(`/api/proxy/raw?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
              response = await fetch(url);
            }
          } catch {
            response = await fetch(url);
          }
        } else {
          response = await fetch(url);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch URL`);
        const text = await response.text();
        const manifest = parseAndValidateManifest(text);
        await executeSideload(manifest, text);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to fetch or parse URL');
        setIsProcessing(false);
      }
    } else if (tab === 'code') {
      const code = codeInput.trim();
      if (!code) return setErrorMsg('Manifest code is required');

      try {
        const manifest = parseAndValidateManifest(code);
        await executeSideload(manifest, code);
      } catch (err: any) {
        setErrorMsg(err.message || 'Invalid code input');
      }
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
              <label htmlFor="sideload-file" className="block cursor-pointer">
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

          {/* Sandbox Info */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-3 text-xs text-muted-foreground">
            <Shield className="w-5 h-5 text-primary flex-shrink-0" />
            <span>Sideloaded extensions run inside Tatakai's isolated sandbox runtime.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-card flex items-center justify-between">
          <Button variant="ghost" onClick={handleClose} disabled={isProcessing} className="rounded-xl h-12">
            Cancel
          </Button>
          <Button
            onClick={handleSideloadSubmit}
            disabled={isProcessing}
            className="rounded-2xl h-12 px-8 bg-primary text-primary-foreground font-black text-sm shadow-xl shadow-primary/20 hover:scale-105 transition-all"
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
