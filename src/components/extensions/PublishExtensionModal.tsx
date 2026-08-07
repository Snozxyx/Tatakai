import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Globe, Zap, Puzzle,
  Info, Shield, CheckCircle2, Loader2,
  Image as ImageIcon, Layout, Type,
  Clock, XCircle, AlertCircle, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { checkRateLimit } from '@/lib/rateLimiter';
import { validateInput } from '@/lib/security';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

interface ReviewState {
  submissionId: string;
  status: ReviewStatus;
  notes: string | null;
  approvedAt: string | null;
  downloadUrl: string | null;
}

interface PublishExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type BundleSource = 'upload' | 'github';

const GITHUB_RAW_HOSTS = new Set(['raw.githubusercontent.com', 'raw.github.com']);

function normalizeGithubRawUrl(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (!/^https?:$/i.test(url.protocol)) return null;
    if (!GITHUB_RAW_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function downloadBundleFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/proxy/raw?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    throw new Error(`Failed to download bundle: HTTP ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

const POLL_INTERVAL_MS = 30_000;

const STATUS_CONFIG: Record<ReviewStatus, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  pending: {
    icon: <Clock className="w-5 h-5" />,
    label: 'Pending Review',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  in_review: {
    icon: <RefreshCw className="w-5 h-5 animate-spin" />,
    label: 'Under Review',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  approved: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    label: 'Approved',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  rejected: {
    icon: <XCircle className="w-5 h-5" />,
    label: 'Rejected',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
};

export function PublishExtensionModal({ isOpen, onClose }: PublishExtensionModalProps) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [bundleSource, setBundleSource] = useState<BundleSource>('upload');
  const authorName = (profile?.username || user?.user_metadata?.username || '').trim();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: '1.0.0',
    mainUrl: '',
    type: 'onlinestream' as 'onlinestream' | 'torrent' | 'custom',
    banner: '',
    icon: '',
    author: '',
    categories: '',
    permissions: 'sources:resolve',
  });

  // .kai file buffer state
  const [kaiBuffer, setKaiBuffer] = useState<ArrayBuffer | null>(null);
  const [kaiFileName, setKaiFileName] = useState<string>('');
  const [uploadingKai, setUploadingKai] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPerformingSecurityCheck, setIsPerformingSecurityCheck] = useState(false);

  // Review polling state
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authorName) {
      setFormData(prev => ({ ...prev, author: authorName }));
    }
  }, [authorName]);

  // Stop polling when modal closes or status is terminal
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollReviewStatus = useCallback(async (submissionId: string) => {
    try {
      const result = await (window as any).tatakaiRuntime?.getReviewStatus(submissionId);
      if (!result) return;

      if (result.success === false) {
        // API unreachable — keep polling silently
        return;
      }

      setReviewState(prev => ({
        submissionId,
        status: result.status ?? prev?.status ?? 'pending',
        notes: result.notes ?? prev?.notes ?? null,
        approvedAt: result.approvedAt ?? prev?.approvedAt ?? null,
        downloadUrl: result.downloadUrl ?? prev?.downloadUrl ?? null,
      }));

      // Stop polling on terminal states
      if (result.status === 'approved' || result.status === 'rejected') {
        stopPolling();
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [stopPolling]);

  const startPolling = useCallback((submissionId: string) => {
    stopPolling();
    // Immediate first poll
    pollReviewStatus(submissionId);
    pollIntervalRef.current = setInterval(() => {
      pollReviewStatus(submissionId);
    }, POLL_INTERVAL_MS);
  }, [pollReviewStatus, stopPolling]);

  // Clean up on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
    }
    return () => stopPolling();
  }, [isOpen, stopPolling]);

  const resetModal = () => {
    setStep(1);
    setBundleSource('upload');
    setFormData({
      name: '',
      description: '',
      version: '1.0.0',
      mainUrl: '',
      type: 'onlinestream',
      banner: '',
      icon: '',
      author: authorName,
      categories: '',
      permissions: 'sources:resolve',
    });
    setKaiBuffer(null);
    setKaiFileName('');
    setReviewState(null);
    stopPolling();
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      if (!user) return toast.error('Sign in to publish');

      // Rate limit check
      const rl = checkRateLimit(`submit_ext_${user.id}`, 3, 3600);
      if (rl.limited) {
        return toast.error(`Submission limit reached. Try again in ${Math.ceil(rl.reset / 60)} minutes.`);
      }

      if (!authorName) {
        toast.error('Set a username in your profile before publishing an extension.');
        return;
      }

      // Validation
      if (!formData.name.trim()) return toast.error('Extension name is required');
      if (!formData.description.trim()) return toast.error('Description is required');
      if (!formData.icon.trim()) return toast.error('Icon URL is required');
      if (!formData.banner.trim()) return toast.error('Banner URL is required');

      let submissionBuffer = kaiBuffer;
      let resolvedMainUrl = formData.mainUrl.trim();

      if (bundleSource === 'github') {
        const githubRawUrl = normalizeGithubRawUrl(formData.mainUrl);
        if (!githubRawUrl) {
          return toast.error('Use a raw GitHub URL from raw.githubusercontent.com or raw.github.com.');
        }

        try {
          submissionBuffer = await downloadBundleFromUrl(githubRawUrl);
          resolvedMainUrl = githubRawUrl;
        } catch (error: any) {
          return toast.error(error?.message || 'Failed to download the extension bundle from GitHub.');
        }
      } else if (!submissionBuffer) {
        return toast.error('.kai file is required');
      }

      // Security Check
      setIsPerformingSecurityCheck(true);
      toast.loading('Performing security scan...', { id: 'sec-check' });

      const secName = validateInput(formData.name, 100);
      const secDesc = validateInput(formData.description, 500);

      if (!secName.valid || !secDesc.valid) {
        toast.error('Malicious patterns detected in text fields.', { id: 'sec-check' });
        setIsPerformingSecurityCheck(false);
        return;
      }

      setIsPerformingSecurityCheck(false);
      setIsSubmitting(true);
      toast.loading('Submitting extension...', { id: 'sec-check' });

      const metadata = {
        name: formData.name,
        description: formData.description,
        version: formData.version,
        type: formData.type,
        banner: formData.banner,
        icon: formData.icon,
        mainUrl: resolvedMainUrl,
        author: authorName,
        categories: formData.categories.split(',').map(c => c.trim()).filter(Boolean),
        permissions: formData.permissions.split(',').map(p => p.trim()).filter(Boolean),
      };

      const result = await (window as any).tatakaiRuntime?.submitExtension(submissionBuffer, metadata);

      if (result === undefined) {
        // tatakaiRuntime not available — web browser, not Electron desktop
        toast.error('Extension submission requires the Tatakai desktop app.', { id: 'sec-check' });
        return;
      }

      if (!result || result.success === false) {
        const errMsg = result?.error === 'marketplace_unavailable'
          ? 'Marketplace is currently unavailable. Please try again later.'
          : result?.error === 'bundle_too_large'
          ? 'The .kai bundle exceeds the 10 MB size limit.'
          : result?.error === 'missing_required_fields'
          ? 'The .kai manifest is missing required fields (id, name, version, type).'
          : result?.error || 'Submission failed. Please try again later.';
        toast.error(errMsg, { id: 'sec-check' });
        return;
      }

      toast.success('Extension submitted for review!', { id: 'sec-check' });

      // Move to review status step
      const initialReview: ReviewState = {
        submissionId: result.submissionId,
        status: result.status ?? 'pending',
        notes: null,
        approvedAt: null,
        downloadUrl: null,
      };
      setReviewState(initialReview);
      setStep(4);
      startPolling(result.submissionId);
    } catch (err) {
      toast.error('Submission failed. Please try again later.', { id: 'sec-check' });
    } finally {
      setIsPerformingSecurityCheck(false);
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      if (!formData.name.trim()) return toast.error('Extension name is required');
      if (!formData.description.trim()) return toast.error('Description is required');
    }
    if (step === 2) {
      if (!formData.icon.trim()) return toast.error('Icon URL is required');
      if (!formData.banner.trim()) return toast.error('Banner URL is required');
    }
    setStep(s => s + 1);
  };
  const prevStep = () => setStep(s => s - 1);

  const isBusy = isSubmitting || isPerformingSecurityCheck;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl bg-card/60 backdrop-blur-xl border-border/30 p-0 overflow-hidden rounded-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-white/5 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Publish Extension</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {step <= 3 ? `Step ${step} of 3` : 'Review Status'}
                </p>
              </div>
            </div>
            <DialogDescription className="sr-only">
              Publish a new Tatakai extension submission.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Type className="w-4 h-4 text-primary" />
                    Basic Information
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Extension Name <span className="text-primary">*</span></label>
                      <Input
                        placeholder="e.g. Anime X-Stream"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="h-12 bg-white/5 border-white/10 rounded-xl"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Author Name</label>
                      <Input
                        value={formData.author}
                        disabled
                        className="h-12 bg-white/5 border-white/10 rounded-xl opacity-70 cursor-not-allowed"
                      />
                      <p className="text-[10px] text-muted-foreground ml-1">
                        {authorName ? 'Published under your account username' : 'Set a username in profile settings to publish'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Description <span className="text-primary">*</span></label>
                      <Textarea
                        placeholder="Tell the community what your extension does..."
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="bg-white/5 border-white/10 rounded-xl min-h-[100px]"
                        required
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-secondary" />
                    Branding & Media
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Banner URL (1200x400) <span className="text-primary">*</span></label>
                      <Input
                        placeholder="https://..."
                        value={formData.banner}
                        onChange={e => setFormData({...formData, banner: e.target.value})}
                        className="h-12 bg-white/5 border-white/10 rounded-xl"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Icon URL (512x512) <span className="text-primary">*</span></label>
                      <Input
                        placeholder="https://..."
                        value={formData.icon}
                        onChange={e => setFormData({...formData, icon: e.target.value})}
                        className="h-12 bg-white/5 border-white/10 rounded-xl"
                        required
                      />
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex gap-3">
                      <Info className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-200/80">Use high-quality images from Imgur or your GitHub repository for the best visual appeal.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Technical Specifications
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Extension Type</label>
                      <div className="flex gap-2">
                        {(['onlinestream', 'torrent', 'custom'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => setFormData({...formData, type})}
                            className={cn(
                              "flex-1 p-3 rounded-xl border transition-all text-xs font-bold capitalize",
                              formData.type === type
                                ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                            )}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Version</label>
                        <Input
                          placeholder="1.0.0"
                          value={formData.version}
                          onChange={e => setFormData({...formData, version: e.target.value})}
                          className="h-12 bg-white/[0.03] border-white/10 rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Bundle URL (optional)</label>
                        <Input
                          placeholder="https://cdn.example.com/ext.kai"
                          value={formData.mainUrl}
                          onChange={e => setFormData({...formData, mainUrl: e.target.value})}
                          className="h-12 bg-white/[0.03] border-white/10 rounded-xl"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Categories (comma separated)</label>
                      <Input
                        placeholder="e.g. streaming, anime, high-res"
                        value={formData.categories}
                        onChange={e => setFormData({...formData, categories: e.target.value})}
                        className="h-12 bg-white/5 border-white/10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Permissions (comma separated)</label>
                      <Input
                        placeholder="e.g. network:domain:example.com, sources:resolve"
                        value={formData.permissions}
                        onChange={e => setFormData({...formData, permissions: e.target.value})}
                        className="h-12 bg-white/5 border-white/10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Bundle Source <span className="text-primary">*</span></label>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBundleSource('upload')}
                          className={cn(
                            'h-11 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all',
                            bundleSource === 'upload'
                              ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20'
                              : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                          )}
                        >
                          Upload .kai
                        </button>
                        <button
                          type="button"
                          onClick={() => setBundleSource('github')}
                          className={cn(
                            'h-11 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all',
                            bundleSource === 'github'
                              ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20'
                              : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                          )}
                        >
                          GitHub Raw URL
                        </button>
                      </div>

                      {bundleSource === 'upload' ? (
                        <>
                          <div className="relative group">
                            <input
                              type="file"
                              id="kai-upload"
                              accept=".kai,application/octet-stream"
                              onChange={async (e) => {
                                const input = e.currentTarget;
                                const file = input.files?.[0];
                                if (!file) return;
                                try {
                                  setUploadingKai(true);
                                  const buffer = await file.arrayBuffer();
                                  setKaiBuffer(buffer);
                                  setKaiFileName(file.name);
                                  toast.success('.kai file loaded');
                                } catch (error: any) {
                                  toast.error(error?.message || 'Failed to read .kai file');
                                  setKaiBuffer(null);
                                  setKaiFileName('');
                                } finally {
                                  setUploadingKai(false);
                                  input.value = '';
                                }
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="kai-upload"
                              className={cn(
                                'flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed transition-all cursor-pointer',
                                kaiBuffer
                                  ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/50'
                              )}
                            >
                              {uploadingKai ? (
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                              ) : kaiBuffer ? (
                                <>
                                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                                  <span className="text-xs font-bold text-emerald-400">File ready for submission</span>
                                  <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[80%]">{kaiFileName}</span>
                                </>
                              ) : (
                                <>
                                  <Puzzle className="w-8 h-8 text-muted-foreground mb-2 group-hover:text-primary transition-colors" />
                                  <span className="text-xs font-bold">Click to select .kai file</span>
                                  <span className="text-[10px] text-muted-foreground mt-1">Max 10 MB</span>
                                </>
                              )}
                            </label>
                          </div>
                          <p className="text-[10px] text-muted-foreground ml-1">
                            The local file is used to validate the manifest before submission.
                          </p>
                        </>
                      ) : (
                        <>
                          <Input
                            placeholder="https://raw.githubusercontent.com/<user>/<repo>/<branch>/extension.kai"
                            value={formData.mainUrl}
                            onChange={e => setFormData({...formData, mainUrl: e.target.value})}
                            className="h-12 bg-white/5 border-white/10 rounded-xl"
                            required
                          />
                          <p className="text-[10px] text-muted-foreground ml-1">
                            Only raw GitHub bundle URLs are accepted: raw.githubusercontent.com or raw.github.com.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && reviewState && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Submission Status
                  </h3>

                  {/* Status card */}
                  {(() => {
                    const cfg = STATUS_CONFIG[reviewState.status];
                    return (
                      <div className={cn('p-5 rounded-2xl border flex items-start gap-4', cfg.bg)}>
                        <div className={cn('mt-0.5 flex-shrink-0', cfg.color)}>
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-bold text-base', cfg.color)}>{cfg.label}</p>
                          <p className="text-xs text-muted-foreground mt-1 break-all">
                            Submission ID: <span className="font-mono">{reviewState.submissionId}</span>
                          </p>
                          {reviewState.status === 'pending' || reviewState.status === 'in_review' ? (
                            <p className="text-xs text-muted-foreground mt-2">
                              Checking for updates every 30 seconds…
                            </p>
                          ) : null}
                          {reviewState.status === 'approved' && reviewState.approvedAt && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Approved at: {new Date(reviewState.approvedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notes */}
                  {reviewState.notes && (
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reviewer Notes</p>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{reviewState.notes}</p>
                    </div>
                  )}

                  {/* Download URL when approved */}
                  {reviewState.status === 'approved' && reviewState.downloadUrl && (
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Download URL</p>
                      <p className="text-xs font-mono text-muted-foreground break-all">{reviewState.downloadUrl}</p>
                    </div>
                  )}

                  {/* Info banner for non-terminal states */}
                  {(reviewState.status === 'pending' || reviewState.status === 'in_review') && (
                    <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-200/80">
                        Your extension is in the review queue. You can close this dialog — the submission has been recorded and you can check back later.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex items-center justify-between bg-card">
          {step === 4 ? (
            <>
              <div />
              <Button
                onClick={handleClose}
                className="rounded-xl h-12 px-8 bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold"
              >
                Close
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={step === 1 ? handleClose : prevStep}
                className="rounded-xl h-12"
                disabled={isBusy}
              >
                {step === 1 ? 'Cancel' : 'Previous'}
              </Button>

              {step < 3 ? (
                <Button
                  onClick={nextStep}
                  className="rounded-xl h-12 px-8 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                >
                  Next Step
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isBusy}
                  className="rounded-xl h-12 px-8 bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold"
                >
                  {isBusy ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isPerformingSecurityCheck ? 'Scanning...' : 'Submitting...'}</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Publish Extension</>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
