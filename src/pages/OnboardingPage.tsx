import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Background } from '@/components/layout/Background';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, BookOpen, Users, User, Shield, Heart, Sparkles, ArrowRight, PlayCircle, Globe, AlertCircle, MessageSquare, Eye, Lock, Palette, Zap, Camera, ImageIcon, RefreshCw, Loader2, Check, Activity, Cpu, FolderOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { THEME_INFO, Theme, useTheme } from '@/hooks/useTheme';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useRandomProfileImages, useRandomBannerImages, useUpdateProfileAvatar, useUpdateProfileBanner } from '@/hooks/useProfileFeatures';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';

// Define DownloadLocationStep component
function DownloadLocationStep() {
  const [downloadPath, setDownloadPath] = useState<string>('Downloads/Tatakai');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Set default download path for web
    const saved = localStorage.getItem('tatakai_download_path');
    if (saved) {
      setDownloadPath(saved);
    }
  }, []);

  const handleChangeLocation = async () => {
    try {
      setLoading(true);
      // For web, just set a default path
      const defaultPath = 'Downloads/Tatakai';
      setDownloadPath(defaultPath);
      localStorage.setItem('tatakai_download_path', defaultPath);
      toast.success("Download location updated");
    } catch (e) {
      toast.error("Failed to change location");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center">
          <FolderOpen className="w-8 h-8 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Download Location</p>
          <code className="px-3 py-1 rounded-lg bg-black/30 border border-white/10 text-xs font-mono break-all">
            {downloadPath}
          </code>
        </div>
        <Button onClick={handleChangeLocation} disabled={loading} variant="outline" className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Reset to Default
        </Button>
        <p className="text-xs text-muted-foreground/60 max-w-xs">
          Downloads are handled by your browser. Location shown is for reference only.
        </p>
      </div>
    </div>
  );
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  condition?: (user: any) => boolean;
}

function ProfileSetupStep() {
  const { profile } = useAuth();
  const { data: profileImages, isLoading: loadingProfile, refetch: refetchProfile } = useRandomProfileImages(12);
  const { data: bannerImages, isLoading: loadingBanner, refetch: refetchBanner } = useRandomBannerImages(6);

  const updateAvatar = useUpdateProfileAvatar();
  const updateBanner = useUpdateProfileBanner();
  const { user } = useAuth();

  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(profile?.avatar_url || null);
  const [selectedBanner, setSelectedBanner] = useState<string | null>(profile?.banner_url || null);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAvatarSelect = async (url: string) => {
    setSelectedAvatar(url);
    try {
      await updateAvatar.mutateAsync(url);
      toast.success('Avatar updated!');
    } catch (error) {
      toast.error('Failed to update avatar');
    }
  };

  const handleBannerSelect = async (url: string) => {
    setSelectedBanner(url);
    try {
      await updateBanner.mutateAsync(url);
      toast.success('Banner updated!');
    } catch (error) {
      toast.error('Failed to update banner');
    }
  };

  const saveProfileInfo = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          username: username.toLowerCase().replace(/\s/g, '_'),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success('Profile information saved!');
    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8 max-h-[60vh] overflow-y-auto px-2 scrollbar-thin pb-10">
      {/* Preview Section */}
      <div className="space-y-4">
        <h5 className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">Your Preview</h5>
        <GlassPanel className="p-0 overflow-hidden relative group border-white/10 shadow-2xl">
          <div className="h-32 w-full relative">
            {selectedBanner ? (
              <img src={selectedBanner} className="w-full h-full object-cover" alt="Banner" />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-primary/20 to-purple-500/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
          </div>
          <div className="px-6 pb-6 -mt-12 relative flex items-end gap-4">
            <div className="w-24 h-24 rounded-full p-1 bg-background ring-4 ring-background/50 overflow-hidden shadow-xl">
              <Avatar className="w-full h-full">
                <AvatarImage src={selectedAvatar || undefined} className="object-cover" />
                <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                  {displayName?.[0] || profile?.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="mb-2 flex-1">
              <h4 className="font-bold text-lg truncate">{displayName || profile?.display_name || 'Your Name'}</h4>
              <p className="text-xs text-muted-foreground truncate">@{username || profile?.username || 'username'}</p>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Identity Form */}
      <GlassPanel className="p-6 space-y-4 border-white/5 bg-white/5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-xs font-bold uppercase tracking-wider opacity-70">Display Name</Label>
            <Input
              id="display-name"
              placeholder="How others see you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-white/5 border-white/10 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider opacity-70">Unique Username</Label>
            <Input
              id="username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-white/5 border-white/10 rounded-xl"
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDisplayName(profile?.display_name || '');
              setUsername(profile?.username || '');
            }}
            className="text-[10px] uppercase font-bold tracking-tighter opacity-50 hover:opacity-100"
          >
            Reset to default
          </Button>
          <Button
            onClick={saveProfileInfo}
            disabled={isUpdating}
            size="sm"
            className="rounded-xl font-bold gap-2 px-6 shadow-lg shadow-primary/20"
          >
            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save & Update
          </Button>
        </div>
      </GlassPanel>

      {/* Selection Tabs */}
      <div className="space-y-10">
        <section>
          <div className="flex items-center justify-between mb-6">
            <h5 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Anime Avatar
            </h5>
            <Button variant="ghost" size="sm" onClick={() => refetchProfile()} disabled={loadingProfile} className="text-[10px] h-8">
              <RefreshCw className={cn("w-3 h-3 mr-1", loadingProfile && "animate-spin")} />
              New Avatars
            </Button>
          </div>
          {loadingProfile ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {profileImages?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleAvatarSelect(img.url)}
                  className={cn(
                    "aspect-square rounded-2xl overflow-hidden border-2 transition-all p-0.5",
                    selectedAvatar === img.url ? "border-primary scale-90 ring-4 ring-primary/20" : "border-transparent hover:border-white/20"
                  )}
                >
                  <img src={img.url} className="w-full h-full object-cover rounded-xl" alt="Avatar" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h5 className="text-sm font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-500" />
              Profile Banner
            </h5>
            <Button variant="ghost" size="sm" onClick={() => refetchBanner()} disabled={loadingBanner} className="text-[10px] h-8">
              <RefreshCw className={cn("w-3 h-3 mr-1", loadingBanner && "animate-spin")} />
              New Banners
            </Button>
          </div>
          {loadingBanner ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bannerImages?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleBannerSelect(img.url)}
                  className={cn(
                    "aspect-[21/9] rounded-2xl overflow-hidden border-2 transition-all p-0.5",
                    selectedBanner === img.url ? "border-primary scale-95 ring-4 ring-primary/20" : "border-transparent hover:border-white/20"
                  )}
                >
                  <img src={img.url} className="w-full h-full object-cover rounded-xl" alt="Banner" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ThemeSelectionStep() {
  const { theme, setTheme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(localStorage.getItem('tatakai_reduce_motion') === 'true');
  const [ultraLite, setUltraLite] = useState(localStorage.getItem('tatakai_ultra_lite') === 'true');

  const toggleMotion = () => {
    const newVal = !reduceMotion;
    setReduceMotion(newVal);
    localStorage.setItem('tatakai_reduce_motion', String(newVal));
    if (newVal) document.documentElement.classList.add('reduce-motion');
    else document.documentElement.classList.remove('reduce-motion');
  };

  const toggleLite = () => {
    const newVal = !ultraLite;
    setUltraLite(newVal);
    localStorage.setItem('tatakai_ultra_lite', String(newVal));
  };

  return (
    <div className="space-y-6 max-h-[60vh] overflow-y-auto px-2 scrollbar-thin">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(THEME_INFO) as Theme[]).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={`relative p-4 rounded-2xl border text-left transition-all ${theme === t
              ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
              : 'border-white/5 bg-white/5 hover:bg-white/10'
              }`}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">{THEME_INFO[t].icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{THEME_INFO[t].name}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{THEME_INFO[t].description}</p>
              </div>
              {theme === t && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
            </div>
            {t === 'ultra-lite' && (
              <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-yellow-500 text-[8px] font-black text-black">
                MAX SPEED
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3 pt-4 border-t border-white/10">
        <h5 className="text-sm font-bold flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Accessibility & Performance
        </h5>

        <button
          onClick={toggleMotion}
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
            reduceMotion ? "border-primary bg-primary/5" : "border-white/5 bg-white/5 hover:bg-white/10"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${reduceMotion ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'}`}>
              <Activity className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">Reduce Motion</p>
              <p className="text-[10px] text-muted-foreground">Minimize animations for better accessibility</p>
            </div>
          </div>
          <div className={cn("w-10 h-6 rounded-full p-1 transition-colors", reduceMotion ? "bg-primary" : "bg-white/10")}>
            <div className={cn("w-4 h-4 rounded-full bg-white transition-transform", reduceMotion ? "translate-x-4" : "translate-x-0")} />
          </div>
        </button>

        <button
          onClick={toggleLite}
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
            ultraLite ? "border-primary bg-primary/5" : "border-white/5 bg-white/5 hover:bg-white/10"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${ultraLite ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'}`}>
              <Cpu className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">Ultra Lite Mode</p>
              <p className="text-[10px] text-muted-foreground">Simplify UI components for maximum performance</p>
            </div>
          </div>
          <div className={cn("w-10 h-6 rounded-full p-1 transition-colors", ultraLite ? "bg-primary" : "bg-white/10")}>
            <div className={cn("w-4 h-4 rounded-full bg-white transition-transform", ultraLite ? "translate-x-4" : "translate-x-0")} />
          </div>
        </button>
      </div>
    </div>
  );
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Tatakai',
    description: 'The Next Generation Anime Experience',
    icon: <Sparkles className="w-10 h-10 text-pink-500" />,
    content: (
      <div className="text-center space-y-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="relative w-32 h-32 mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 rounded-full blur-2xl opacity-40 animate-pulse" />
          <div className="relative w-full h-full bg-card/40 backdrop-blur-xl rounded-full border border-white/10 flex items-center justify-center shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/10 to-transparent" />
            <PlayCircle className="w-16 h-16 text-white drop-shadow-glow group-hover:scale-110 transition-transform" />
          </div>
        </motion.div>

        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-b from-white via-white to-white/20 bg-clip-text text-transparent">
            YOUR ANIME<br />JOURNEY STARTS NOW
          </h2>
          <p className="text-lg text-muted-foreground max-w-sm mx-auto font-medium">
            Immersive streaming, community interaction, and personalized AI recommendations.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'purpose',
    title: 'Project Purpose',
    description: 'Educational & Student Project',
    icon: <BookOpen className="w-10 h-10 text-blue-400" />,
    content: (
      <div className="space-y-8">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-30" />
            <div className="relative w-full h-full bg-blue-500/20 backdrop-blur-md rounded-2xl border border-blue-500/30 flex items-center justify-center rotate-12">
              <Shield className="w-10 h-10 text-blue-400 -rotate-12" />
            </div>
          </div>
          <h3 className="text-3xl font-black tracking-tight mb-3">Student Project Notice</h3>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Tatakai is built as a portfolio project for educational purposes.
            We do not host files on our servers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="group p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-orange-400" />
              </div>
              <h4 className="font-bold text-lg">Data Sourcing</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We act as a gateway that aggregates and scrapes publicly available data from 3rd party providers.
              The content visibility is subject to the source availability.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-500 font-bold uppercase tracking-widest">For Educational Display Only</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'desktop-features',
    title: 'Desktop Enhancements',
    description: 'Exclusive features for the Desktop App',
    icon: <Cpu className="w-10 h-10 text-orange-400" />,
    condition: () => !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__,
    content: (
      <div className="grid grid-cols-1 gap-4">
        {[
          { title: "Discord Presence", desc: "Share your status with friends", icon: <MessageSquare className="w-5 h-5 text-indigo-400" /> },
          { title: "Offline Playback", desc: "Download & watch anywhere", icon: <RefreshCw className="w-5 h-5 text-cyan-400" /> },
          { title: "Native Speed", desc: "Hardware acceleration enabled", icon: <Zap className="w-5 h-5 text-amber-400" /> },
          { title: "System Notifs", desc: "Get alerts for new episodes", icon: <Activity className="w-5 h-5 text-emerald-400" /> }
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/5">
            <div className="p-3 rounded-xl bg-white/5">{item.icon}</div>
            <div>
              <h4 className="font-bold">{item.title}</h4>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'rules',
    title: 'The Rules',
    description: 'Help us maintain the atmosphere',
    icon: <Shield className="w-10 h-10 text-emerald-400" />,
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: "Resurrect Respect", desc: "No hate speech or toxic behavior.", icon: <Heart className="w-4 h-4" /> },
            { title: "No Spoilers", desc: "Respect the first-watch experience.", icon: <Eye className="w-4 h-4" /> },
            { title: "Quality Talk", desc: "Engage in meaningful discussions.", icon: <MessageSquare className="w-4 h-4" /> },
            { title: "Stay Safe", desc: "Don't share sensitive personal info.", icon: <Lock className="w-4 h-4" /> }
          ].map((rule, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-5 rounded-3xl bg-white/5 border border-white/5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2 text-primary font-bold">
                {rule.icon}
                <span className="text-sm tracking-tight">{rule.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{rule.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'profile',
    title: 'Personalize Your Profile',
    description: 'Show off your anime style to the community',
    icon: <User className="w-10 h-10 text-indigo-400" />,
    content: <ProfileSetupStep />,
    condition: (user: any) => !!user,
  },
  {
    id: 'download-location',
    title: 'Download Location',
    description: 'Where should we store your offline anime?',
    icon: <FolderOpen className="w-10 h-10 text-cyan-400" />,
    content: <DownloadLocationStep />,
  },
  {
    id: 'theme',
    title: 'Choose Your Experience',
    description: 'Customize how Tatakai looks and performs',
    icon: <Palette className="w-10 h-10 text-purple-400" />,
    content: <ThemeSelectionStep />,
  },
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const filteredSteps = onboardingSteps.filter(step => !step.condition || step.condition(user));

  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Always ensure user is logged in before showing onboarding
    if (!user) {
      navigate('/auth');
      return;
    }

    const themeSelected = localStorage.getItem('tatakai_theme_selected_v2') === 'true';
    if (!themeSelected) {
      const themeStepIdx = filteredSteps.findIndex(s => s.id === 'theme');
      if (themeStepIdx !== -1) {
        // If they already did onboarding before our 'forced' update, take them to theme step
        setCurrentStep(themeStepIdx);
      }
    }
  }, [filteredSteps, user, navigate]);

  const handleNext = () => {
    if (currentStep < filteredSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsComplete(true);
    localStorage.setItem('tatakai_onboarding_complete', 'true');
    localStorage.setItem('tatakai_theme_selected_v2', 'true');
    setTimeout(() => {
      navigate('/');
    }, 1000);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Background />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Welcome aboard!</h2>
          <p className="text-muted-foreground">Taking you to Tatakai...</p>
        </motion.div>
      </div>
    );
  }

  const currentStepData = onboardingSteps[currentStep];

  return (
    <div className="min-h-screen bg-background">
      <Background />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 md:p-10 relative z-20">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20 rotate-3">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-2xl tracking-tighter bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent italic">TATAKAI</span>
          </motion.div>
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground/60 hover:text-white hover:bg-white/5 rounded-full px-6">
            Skip Intro
          </Button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 mb-8">
          <div className="flex items-center justify-center gap-2">
            {filteredSteps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${index === currentStep
                  ? 'bg-primary w-8'
                  : index < currentStep
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                  }`}
              />
            ))}
          </div>
          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {filteredSteps.length}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto"
            >
              {/* Step Header */}
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  {filteredSteps[currentStep].icon}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  {filteredSteps[currentStep].title}
                </h1>
                <p className="text-muted-foreground">
                  {filteredSteps[currentStep].description}
                </p>
              </div>

              {/* Step Content */}
              <div className="mb-8">
                {filteredSteps[currentStep].content}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-background/80 backdrop-blur-md border-t border-white/10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="px-8 rounded-full text-muted-foreground hover:text-white transition-all"
            >
              Back
            </Button>

            <Button
              onClick={handleNext}
              className="px-10 py-6 rounded-full bg-white text-black font-black text-lg hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 gap-3"
            >
              {currentStep === filteredSteps.length - 1 ? 'START TATAKAI' : 'CONTINUE'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}