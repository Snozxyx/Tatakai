import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Background } from '@/components/layout/Background';
import { Button } from '@/components/ui/button';
import { CheckCircle, BookOpen, User, Shield, Heart, Sparkles, ArrowRight, PlayCircle, Globe, AlertCircle, MessageSquare, Eye, EyeOff, Lock, Palette, Zap, Camera, RefreshCw, Loader2, Check, Activity, Cpu, ShieldAlert, Megaphone, ThumbsDown, TrendingUp, Users, ScrollText, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { THEME_INFO, Theme, useTheme } from '@/hooks/ui/useTheme';
import { useRandomProfileImages, useRandomBannerImages, useUpdateProfileAvatar, useUpdateProfileBanner } from '@/hooks/user/useProfileFeatures';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  condition?: (user: any) => boolean;
}

// Custom Glass Component for cleaner code
const GlassCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-background/40 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden", className)}>
    {children}
  </div>
);

function ProfileSetupStep() {
  const { profile, user } = useAuth();
  const { data: profileImages, isLoading: loadingProfile, refetch: refetchProfile } = useRandomProfileImages(12);
  const { data: bannerImages, isLoading: loadingBanner, refetch: refetchBanner } = useRandomBannerImages(6);

  const updateAvatar = useUpdateProfileAvatar();
  const updateBanner = useUpdateProfileBanner();

  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(profile?.avatar_url || null);
  const [selectedBanner, setSelectedBanner] = useState<string | null>(profile?.banner_url || null);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAvatarSelect = async (url: string) => {
    setSelectedAvatar(url);
    try {
      await updateAvatar.mutateAsync(url);
      toast.success('Avatar updated');
    } catch (error) {
      toast.error('Failed to update avatar');
    }
  };

  const handleBannerSelect = async (url: string) => {
    setSelectedBanner(url);
    try {
      await updateBanner.mutateAsync(url);
      toast.success('Banner updated');
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
      toast.success('Profile saved successfully');
    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sleek Preview Card */}
      <GlassCard className="shadow-2xl shadow-black/5">
        <div className="h-40 w-full relative group">
          {selectedBanner ? (
            <img src={selectedBanner} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Banner" />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-primary/20 via-muted to-primary/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
        </div>
        
        <div className="px-6 pb-6 pt-0 relative flex flex-col sm:flex-row items-center sm:items-end gap-5 -mt-16">
          <div className="w-28 h-28 rounded-full p-1.5 bg-background border border-border/50 shadow-xl relative z-10 shrink-0">
            <Avatar className="w-full h-full">
              <AvatarImage src={selectedAvatar || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-semibold">
                {displayName?.[0] || profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 text-center sm:text-left mb-2 w-full">
            <h4 className="font-bold text-2xl tracking-tight text-foreground truncate">{displayName || 'Your Name'}</h4>
            <p className="text-sm text-muted-foreground truncate font-medium">@{username || 'username'}</p>
          </div>
          <div className="w-full sm:w-auto flex justify-center sm:justify-end mb-2">
            <Button onClick={saveProfileInfo} disabled={isUpdating} className="rounded-full px-6 font-semibold shadow-lg shadow-primary/25 transition-all active:scale-95">
              {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save Profile
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Identity Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Display Name</Label>
          <Input
            placeholder="How others see you"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-12 bg-muted/50 border-border/50 focus-visible:ring-primary rounded-2xl px-4 text-base transition-all"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Username</Label>
          <Input
            placeholder="unique_username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-12 bg-muted/50 border-border/50 focus-visible:ring-primary rounded-2xl px-4 text-base transition-all"
          />
        </div>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent my-8" />

      {/* Media Selection Galleries */}
      <div className="space-y-10">
        {/* Avatars */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h5 className="text-sm font-semibold text-muted-foreground tracking-wide flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Select Avatar
            </h5>
            <Button variant="ghost" size="sm" onClick={() => refetchProfile()} disabled={loadingProfile} className="text-xs rounded-full hover:bg-muted">
              <RefreshCw className={cn("w-3 h-3 mr-2", loadingProfile && "animate-spin")} />
              Refresh
            </Button>
          </div>
          
          {loadingProfile ? (
            <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-border"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {profileImages?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleAvatarSelect(img.url)}
                  className={cn(
                    "aspect-square rounded-2xl overflow-hidden relative transition-all duration-300",
                    selectedAvatar === img.url 
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-95" 
                      : "hover:ring-2 hover:ring-border hover:ring-offset-2 hover:ring-offset-background opacity-80 hover:opacity-100"
                  )}
                >
                  <img src={img.url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="Avatar option" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Banners */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h5 className="text-sm font-semibold text-muted-foreground tracking-wide flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              Select Banner
            </h5>
            <Button variant="ghost" size="sm" onClick={() => refetchBanner()} disabled={loadingBanner} className="text-xs rounded-full hover:bg-muted">
              <RefreshCw className={cn("w-3 h-3 mr-2", loadingBanner && "animate-spin")} />
              Refresh
            </Button>
          </div>
          
          {loadingBanner ? (
            <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-border"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bannerImages?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleBannerSelect(img.url)}
                  className={cn(
                    "aspect-[21/9] rounded-2xl overflow-hidden relative transition-all duration-300",
                    selectedBanner === img.url 
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[0.98]" 
                      : "hover:ring-2 hover:ring-border hover:ring-offset-2 hover:ring-offset-background opacity-80 hover:opacity-100"
                  )}
                >
                  <img src={img.url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="Banner option" />
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
  const [reduceMotion, setReduceMotion] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('tatakai_reduce_motion') === 'true' : false);
  const [ultraLite, setUltraLite] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('tatakai_ultra_lite') === 'true' : false);

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const cpuCores = navigator.hardwareConcurrency || 4;
    const deviceMemory = (navigator as any).deviceMemory || 4;
    if (isMobile && (cpuCores <= 4 || deviceMemory <= 4) && !theme) setTheme('midnight');
  }, [theme, setTheme]);

  const toggleMotion = () => {
    const newVal = !reduceMotion;
    setReduceMotion(newVal);
    localStorage.setItem('tatakai_reduce_motion', String(newVal));
    document.documentElement.classList.toggle('reduce-motion', newVal);
  };

  const toggleLite = () => {
    const newVal = !ultraLite;
    setUltraLite(newVal);
    localStorage.setItem('tatakai_ultra_lite', String(newVal));
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(THEME_INFO) as Theme[]).map((t) => {
          const isSelected = theme === t;
          return (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "relative p-5 rounded-3xl text-left transition-all duration-300 border flex items-start gap-4 group",
                isSelected 
                  ? "bg-primary/5 border-primary shadow-lg shadow-primary/10 scale-[0.98]" 
                  : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border"
              )}
            >
              <div className={cn("p-3 rounded-2xl text-xl transition-colors", isSelected ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground group-hover:text-foreground")}>
                {THEME_INFO[t].icon}
              </div>
              <div className="flex-1 mt-1">
                <p className={cn("font-semibold text-base mb-1 transition-colors", isSelected ? "text-primary" : "text-foreground")}>{THEME_INFO[t].name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{THEME_INFO[t].description}</p>
              </div>
              
              {t === 'ultra-lite' && (
                <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold tracking-widest uppercase">
                  Speed
                </div>
              )}
              {isSelected && (
                <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <GlassCard className="p-2 space-y-1 mt-6">
        {[
          {
            title: "Reduce Motion",
            desc: "Minimize animations for a calmer experience.",
            icon: <Activity className="w-5 h-5" />,
            state: reduceMotion,
            toggle: toggleMotion,
            color: "text-blue-500"
          },
          {
            title: "Ultra Lite Mode",
            desc: "Simplify the UI for maximum device performance.",
            icon: <Cpu className="w-5 h-5" />,
            state: ultraLite,
            toggle: toggleLite,
            color: "text-amber-500"
          }
        ].map((item, i) => (
          <button
            key={i}
            onClick={item.toggle}
            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className={cn("p-2.5 rounded-xl bg-background shadow-sm border border-border/50", item.color)}>
                {item.icon}
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
            
            {/* Custom Modern Switch */}
            <div className={cn("w-12 h-6 rounded-full p-1 transition-all duration-300 shadow-inner flex items-center", item.state ? "bg-primary" : "bg-muted-foreground/20")}>
              <div className={cn("w-4 h-4 rounded-full bg-background shadow-sm transition-transform duration-300", item.state ? "translate-x-6" : "translate-x-0")} />
            </div>
          </button>
        ))}
      </GlassCard>
    </div>
  );
}

const COMMUNITY_RULES: { title: string; tagline: string; icon: React.ReactNode }[] = [
  { title: 'Be respectful', tagline: 'Disagree with the take, not the person.', icon: <Heart className="w-4 h-4" /> },
  { title: 'No hate speech', tagline: "It's about what you do with a word, not that it exists.", icon: <ShieldAlert className="w-4 h-4" /> },
  { title: 'Keep it safe for work', tagline: 'The 18+ gate exists; everything outside it stays SFW.', icon: <Eye className="w-4 h-4" /> },
  { title: 'Tag your spoilers', tagline: 'Let everyone read and watch at their own pace.', icon: <EyeOff className="w-4 h-4" /> },
  { title: "Don't spam", tagline: 'One good comment beats twenty copy-pasted ones.', icon: <MessageSquare className="w-4 h-4" /> },
  { title: 'No advertising', tagline: "Don't use Tatakai to promote your stuff, or anyone's.", icon: <Megaphone className="w-4 h-4" /> },
  { title: "Don't farm reputation", tagline: 'Earn reactions by being good, not by grinding for them.', icon: <TrendingUp className="w-4 h-4" /> },
  { title: "Don't weaponize votes", tagline: 'The vote and report buttons are for bad posts, not people.', icon: <ThumbsDown className="w-4 h-4" /> },
  { title: 'One person, one account', tagline: 'Alts used to break rules only make it worse.', icon: <Users className="w-4 h-4" /> },
  { title: 'Respect privacy', tagline: "If it isn't yours to share, don't post it.", icon: <Lock className="w-4 h-4" /> },
];

function CommunityRulesStep() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COMMUNITY_RULES.map((rule, i) => (
          <motion.div
            key={rule.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.2 }}
            className="flex items-start gap-3 p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-border transition-colors"
          >
            <div className="shrink-0 w-9 h-9 rounded-xl bg-background border border-border/50 shadow-sm flex items-center justify-center text-primary">
              {rule.icon}
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm text-foreground">{rule.title}</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{rule.tagline}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold text-red-400">Zero tolerance:</span> Sexualizing minors — real or fictional — and doxxing or endangering another user are instant, permanent bans.
        </p>
      </div>

      <button
        onClick={() => navigate('/community-guidelines')}
        className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-2"
      >
        <ScrollText className="w-4 h-4" />
        Read the full Community Guidelines
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Your Anime Journey Starts Here',
    description: 'Immersive streaming, community interaction, and personalized experiences.',
    icon: <Sparkles className="w-8 h-8 text-primary" />,
    content: (
      <div className="text-center space-y-12 py-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="relative w-40 h-40 mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-primary via-purple-500 to-blue-500 rounded-full blur-[40px] opacity-20" />
          <div className="relative w-full h-full bg-background/50 backdrop-blur-2xl rounded-full border border-border/50 flex items-center justify-center shadow-2xl">
            <PlayCircle className="w-16 h-16 text-primary drop-shadow-md" />
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 'purpose',
    title: 'Project Purpose',
    description: 'Understanding how Tatakai works under the hood.',
    icon: <BookOpen className="w-8 h-8 text-blue-500" />,
    content: (
      <div className="space-y-6">
        <GlassCard className="p-8 text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
          <Shield className="w-12 h-12 mx-auto text-blue-500 mb-6" />
          <h3 className="text-xl font-bold tracking-tight mb-3">Student & Portfolio Project</h3>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
            Tatakai is built for educational purposes. We do not host files on our servers. Content is aggregated from publicly available 3rd party providers.
          </p>
        </GlassCard>
      </div>
    ),
  },
  {
    id: 'desktop-features',
    title: 'Desktop Enhancements',
    description: 'Exclusive features enabled in the app.',
    icon: <Cpu className="w-8 h-8 text-orange-500" />,
    condition: () => !!(window as any).electron || !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__,
    content: (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: "Discord Presence", desc: "Share your watch status", icon: <MessageSquare className="w-5 h-5" />, color: "text-indigo-500" },
          { title: "Offline Playback", desc: "Download and watch anywhere", icon: <RefreshCw className="w-5 h-5" />, color: "text-cyan-500" },
          { title: "Native Speed", desc: "Hardware acceleration enabled", icon: <Zap className="w-5 h-5" />, color: "text-amber-500" },
          { title: "System Alerts", desc: "Native OS notifications", icon: <Activity className="w-5 h-5" />, color: "text-emerald-500" }
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-4 p-5 rounded-3xl bg-muted/30 border border-transparent hover:border-border hover:bg-muted/50 transition-colors">
            <div className={cn("p-3 rounded-2xl bg-background shadow-sm border border-border/50", item.color)}>{item.icon}</div>
            <div className="mt-1">
              <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'rules',
    title: 'Community Guidelines',
    description: 'Help us maintain a positive atmosphere.',
    icon: <Heart className="w-8 h-8 text-pink-500" />,
    content: <CommunityRulesStep />,
  },
  {
    id: 'profile',
    title: 'Personalize Identity',
    description: 'Show off your style to the community.',
    icon: <User className="w-8 h-8 text-primary" />,
    content: <ProfileSetupStep />,
    condition: (user: any) => !!user,
  },
  {
    id: 'theme',
    title: 'Choose Experience',
    description: 'Customize how the app looks and feels.',
    icon: <Palette className="w-8 h-8 text-purple-500" />,
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
    if (!user) {
      navigate('/auth');
      return;
    }
    setCurrentStep(0);
  }, [user, navigate]);

  const handleNext = () => {
    if (currentStep < filteredSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleComplete = () => {
    setIsComplete(true);
    localStorage.setItem('tatakai_onboarding_complete', 'true');
    localStorage.setItem('tatakai_theme_selected_v2', 'true');
    setTimeout(() => navigate('/'), 1000);
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Background />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-primary rounded-full flex items-center justify-center shadow-2xl shadow-primary/30">
            <CheckCircle className="w-12 h-12 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">You're all set!</h2>
          <p className="text-muted-foreground font-medium">Entering Tatakai...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 relative">
      <Background className="opacity-50" />

      {/* Top Header */}
      <header className="relative z-20 flex items-center justify-end p-6 md:px-12 md:py-8">
        <Button 
          variant="ghost" 
          onClick={handleComplete} 
          className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full px-6 font-medium text-sm transition-all"
        >
          Skip Intro
        </Button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 flex flex-col items-center pt-4 pb-36 px-4 md:px-8 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-3xl mx-auto flex flex-col">
          
          {/* Header Text */}
          <div className="text-center mb-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 shadow-sm inline-flex">
                  {filteredSteps[currentStep].icon}
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
                    {filteredSteps[currentStep].title}
                  </h1>
                  <p className="text-base text-muted-foreground max-w-lg mx-auto">
                    {filteredSteps[currentStep].description}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dynamic Content */}
          <div className="w-full relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full"
              >
                {filteredSteps[currentStep].content}
              </motion.div>
            </AnimatePresence>
          </div>
          
        </div>
      </main>

      {/* Floating Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 md:p-8 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 pointer-events-auto bg-background/60 backdrop-blur-2xl border border-border/50 p-4 rounded-full shadow-2xl">
          
          <div className="flex-1 flex items-center gap-2 pl-4">
            {filteredSteps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  index === currentStep ? "bg-primary w-8" : index < currentStep ? "bg-primary/40 w-2" : "bg-muted w-2"
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 pr-1">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className={cn(
                "rounded-full px-6 font-medium transition-all duration-300", 
                currentStep === 0 ? "opacity-0 w-0 p-0 overflow-hidden" : "opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Back
            </Button>

            <Button
              onClick={handleNext}
              className="rounded-full px-8 py-6 bg-foreground text-background hover:bg-foreground/90 font-bold text-base shadow-lg hover:scale-105 active:scale-95 transition-all gap-2 group"
            >
              {currentStep === filteredSteps.length - 1 ? 'Start Exploring' : 'Continue'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
      
    </div>
  );
}