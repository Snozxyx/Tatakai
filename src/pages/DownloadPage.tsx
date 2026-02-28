import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Download, Smartphone, Monitor, CheckCircle, ArrowRight, Apple, ChevronDown, RefreshCw, Loader2, ArrowUpCircle, User as UserIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { toast } from 'sonner';

export default function DownloadPage() {
  const { user } = useAuth();
  const [selectedOS, setSelectedOS] = useState<'mac' | 'win' | 'android' | 'linux'>('win');

  const update = useAppUpdate();

  // Platform detection
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) setSelectedOS('android');
    else if (ua.includes('mac')) setSelectedOS('mac');
    else if (ua.includes('win')) setSelectedOS('win');
    else if (ua.includes('linux')) setSelectedOS('linux');
  }, []);

  // Noise texture SVG constant for reusability
  const NOISE_TEXTURE_SVG = "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E";

  // Get the download URL for the selected platform from the release
  const getPlatformDownloadUrl = (): string | null => {
    switch (selectedOS) {
      case 'android': return androidAsset?.browser_download_url ?? null;
      case 'win': return windowsAsset?.browser_download_url ?? null;
      case 'mac': return macAsset?.browser_download_url ?? null;
      case 'linux': return linuxAsset?.browser_download_url ?? null;
      default: return null;
    }
  };

  const handleDownload = () => {
    // If running inside the app and an update is available, use the update system
    if (update.platform !== 'web' && update.updateAvailable) {
      update.downloadUpdate();
      return;
    }

    // Otherwise, open direct download link
    const url = getPlatformDownloadUrl();
    if (url) {
      window.open(url, '_self'); // Use _self to start download without a new tab if possible
    } else if (update.releaseUrl) {
      // Fallback only if no direct asset found
      window.open(update.releaseUrl, '_blank');
    } else {
      window.open('https://github.com/snozxyx/Tatakai/releases/latest', '_blank');
    }
  };

  const handleInstall = () => {
    update.installUpdate();
    toast.success('Installing update... The app will restart.');
  };

  const displayVersion = update.latestVersion ?? update.currentVersion;
  const isInApp = update.platform !== 'web';
  const showUpdateBadge = isInApp && update.updateAvailable;

  // Direct release assets (used for explicit download buttons)
  const windowsAsset = update.release?.assets.find(a => a.name.endsWith('-win-x64.exe')) ??
    update.release?.assets.find(a => a.name.endsWith('.exe') && !a.name.includes('blockmap')) ?? null;
  const macAsset = update.release?.assets.find(a => a.name.endsWith('-mac-arm64.dmg')) ??
    update.release?.assets.find(a => a.name.endsWith('.dmg')) ?? null;
  const linuxAsset = update.release?.assets.find(a => a.name.endsWith('.AppImage')) ??
    update.release?.assets.find(a => a.name.endsWith('.deb')) ??
    update.release?.assets.find(a => a.name.endsWith('.rpm')) ?? null;
  const androidAsset = update.release?.assets.find(a => a.name.includes('android') && a.name.endsWith('.apk')) ??
    update.release?.assets.find(a => a.name.endsWith('.apk')) ?? null;

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Subtle Noise Texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage: `url("${NOISE_TEXTURE_SVG}")`
        }}
      />

      {/* Ambient Lighting (White Spotlights) */}
      <div className="fixed top-0 left-0 w-full h-screen z-0 overflow-hidden bg-black">
        <motion.div
          className="absolute -top-20 -left-10 w-[60vw] h-[60vw] rounded-full opacity-15 blur-[100px]"
          style={{ background: '#ffffff' }}
          animate={{
            x: [0, 20, -20],
            y: [0, 40, -20],
            scale: [1, 1.05, 0.95]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute -bottom-20 -right-10 w-[50vw] h-[50vw] rounded-full opacity-15 blur-[100px]"
          style={{ background: '#333333' }}
          animate={{
            x: [-20, 20, 0],
            y: [0, -40, 20],
            scale: [1, 1.05, 0.95]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: 5
          }}
        />
      </div>

      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-7xl mx-auto pb-24 md:pb-6">
        {/* Navigation */}
        <nav className="flex justify-between items-center mb-16 px-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <img
                src="/tatakai-logo-square.png"
                alt="Tatakai Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-bold text-xl tracking-tighter uppercase">Tatakai</span>
          </div>
          <div className="hidden md:flex gap-8 text-xs uppercase tracking-widest font-semibold text-gray-500">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <Link to="/community" className="hover:text-white transition-colors">Community</Link>
            <Link to="/trending" className="hover:text-white transition-colors">Trending</Link>
          </div>
          <Link to="/auth" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white hover:text-gray-300 transition-colors border border-white/20 px-3 py-1.5 rounded-full hover:bg-white/10">
            {user ? (
              <>
                <Avatar className="w-5 h-5">
                  <AvatarImage src={user.user_metadata?.avatar_url || undefined} />
                  <AvatarFallback className="bg-white/10 text-[8px]">
                    <UserIcon className="w-2.5 h-2.5" />
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[80px] truncate">{user.user_metadata?.username || user.email?.split('@')[0]}</span>
              </>
            ) : (
              'Account'
            )}
          </Link>
        </nav>

        {/* HERO Section */}
        <section className="min-h-[80vh] flex flex-col justify-center items-center p-4 relative">
          <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-16 items-center">

            {/* Left Column: Info */}
            <div className="space-y-10 order-2 lg:order-1">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-gray-300 text-[10px] font-bold uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                  {update.isChecking ? 'Checking...' : `Version ${displayVersion} Live`}
                  {update.release && (
                    <span className="ml-2 text-gray-500 lowercase first-letter:uppercase">
                      • {new Date(update.release.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  {showUpdateBadge && (
                    <span className="ml-1 px-2 py-0.5 bg-white/10 rounded-full text-[8px] text-green-400 font-bold">
                      UPDATE
                    </span>
                  )}
                </div>
                <h1 className="text-6xl md:text-8xl font-medium leading-[0.9] tracking-tight">
                  Pure <br />
                  <span className="bg-gradient-to-b from-white to-gray-600 bg-clip-text text-transparent">
                    Function.
                  </span>
                </h1>
                <p className="text-lg text-gray-500 max-w-md leading-relaxed font-light">
                  Stripped of distractions. The ultimate anime streaming engine for minimalists. Experience viewing in its purest form.
                </p>
              </div>

              {/* Specs Tags */}
              <div className="flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-widest text-gray-600 font-bold">
                <span className="px-3 py-1 border border-white/10 rounded">Android</span>
                <span className="px-3 py-1 border border-white/10 rounded">Windows</span>
                <span className="px-3 py-1 border border-white/10 rounded">macOS</span>
                <span className="text-gray-400 ml-2">Coming Soon</span>
              </div>
            </div>

            {/* Right Column: Download Card */}
            <div className="order-1 lg:order-2 flex flex-col items-center">
              <div
                className="p-1 rounded-2xl w-full max-w-md relative group"
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 1)'
                }}
              >
                <div className="absolute -inset-10 bg-white/5 rounded-[50%] opacity-0 group-hover:opacity-100 blur-3xl transition duration-1000"></div>

                <div className="bg-black rounded-xl p-8 relative overflow-hidden border border-white/5">
                  <div className="flex flex-col items-center mb-10 relative z-10">
                    <motion.div
                      className="mb-8 perspective-1000"
                      animate={{
                        y: [0, -10, 0],
                        rotateX: [5, 0, 5],
                        rotateY: [-5, 5, -5]
                      }}
                      transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <div
                        className="w-[120px] h-[120px] rounded-[28px] flex items-center justify-center relative"
                        style={{
                          background: 'linear-gradient(135deg, #111111 0%, #000000 100%)',
                          boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          transformStyle: 'preserve-3d'
                        }}
                      >
                        <div
                          className="absolute -inset-[1px] rounded-[29px]"
                          style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.2), transparent)',
                            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                            WebkitMaskComposite: 'xor',
                            maskComposite: 'exclude',
                            pointerEvents: 'none',
                            padding: '1px'
                          }}
                        />
                        <img
                          src="/tatakai-logo-square.png"
                          alt="Tatakai Logo"
                          className="w-16 h-16 object-contain relative z-10"
                        />
                      </div>
                    </motion.div>
                    <h2 className="text-3xl font-medium text-white mb-1 tracking-tight">Tatakai Pro</h2>
                    <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Architect Edition</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="grid grid-cols-2 gap-2 bg-gray-800 p-2 rounded-md overflow-hidden">
                      <button
                        onClick={() => setSelectedOS('win')}
                        className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wide transition-all rounded ${selectedOS === 'win' ? 'bg-white text-black' : 'bg-black text-gray-500 hover:text-white'
                          }`}
                      >
                        <Monitor className="w-3 h-3" /> Win
                      </button>
                      <button
                        onClick={() => setSelectedOS('mac')}
                        className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wide transition-all rounded ${selectedOS === 'mac' ? 'bg-white text-black' : 'bg-black text-gray-500 hover:text-white'
                          }`}
                      >
                        <Apple className="w-3 h-3 fill-current" /> Mac
                      </button>
                      <button
                        onClick={() => setSelectedOS('linux')}
                        className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wide transition-all rounded ${selectedOS === 'linux' ? 'bg-white text-black' : 'bg-black text-gray-500 hover:text-white'
                          }`}
                      >
                        <Monitor className="w-3 h-3" /> Linux
                      </button>
                      <button
                        onClick={() => setSelectedOS('android')}
                        className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wide transition-all rounded ${selectedOS === 'android' ? 'bg-white text-black' : 'bg-black text-gray-500 hover:text-white'
                          }`}
                      >
                        <Smartphone className="w-3 h-3" /> Android
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-gray-600 px-1 font-mono">
                      <span>v{displayVersion} ({selectedOS === 'android' ? 'arm64' : 'x64'})</span>
                      <button
                        onClick={() => update.releaseUrl ? window.open(update.releaseUrl, '_blank') : null}
                        className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                      >
                        Changelog
                      </button>
                    </div>
                  </div>

                  {/* Update ready — install button (Electron only) */}
                  {update.updateReady ? (
                    <button
                      onClick={handleInstall}
                      className="relative w-full h-14 rounded-lg overflow-hidden group/btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-black active:scale-95 transition-transform"
                    >
                      <div className="absolute inset-0 bg-green-500 group-hover/btn:bg-green-400 transition-colors" />
                      <div className="relative z-10 flex items-center justify-center gap-3 w-full h-full font-bold text-black uppercase tracking-widest text-xs">
                        <ArrowUpCircle className="w-4 h-4" />
                        <span>Install & Restart</span>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={handleDownload}
                      disabled={update.isDownloading || update.isChecking}
                      className="relative w-full h-14 rounded-lg overflow-hidden group/btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed active:scale-95 transition-transform"
                    >
                      <div className="absolute inset-0 bg-white group-hover/btn:bg-gray-100 transition-colors" />
                      {update.isDownloading && (
                        <div
                          className="absolute bottom-0 left-0 h-full bg-black/10 transition-all duration-100"
                          style={{ width: `${update.downloadProgress}%` }}
                        />
                      )}
                      <div className="relative z-10 flex items-center justify-center gap-3 w-full h-full font-bold text-black uppercase tracking-widest text-xs">
                        {update.isChecking ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Checking...</span>
                          </>
                        ) : update.isDownloading ? (
                          <span>Downloading {update.downloadProgress}%</span>
                        ) : isInApp && update.updateAvailable ? (
                          <>
                            <span>Update to v{update.latestVersion}</span>
                            <ArrowUpCircle className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            <span>Download</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </div>
                    </button>
                  )}

                  {/* Direct platform downloads — REMOVED redundant buttons as per user request */}

                  {/* Check for updates button (in-app only) */}
                  {isInApp && !update.isChecking && !update.isDownloading && !update.updateReady && (
                    <button
                      onClick={() => update.checkForUpdates()}
                      className="w-full flex items-center justify-center gap-2 py-2 text-[10px] text-gray-500 hover:text-white uppercase tracking-widest font-mono transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {update.updateAvailable ? 'Re-check' : 'Check for updates'}
                    </button>
                  )}

                  {/* Current version info (in-app) */}
                  {isInApp && (
                    <p className="text-center text-[9px] text-gray-600 font-mono">
                      Current: v{update.currentVersion} · {update.platform === 'electron' ? 'Desktop' : 'Mobile'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scroll Indicator */}
          <motion.div
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
            animate={{ y: [0, -5, 0, -3, 0] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <ChevronDown className="w-6 h-6 text-gray-600" />
          </motion.div>
        </section>

        {/* LOGOS Section */}
        <section className="py-12 border-y border-white/5 bg-black/50 rounded-xl backdrop-blur-sm mb-16">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-8 font-mono">Trusted by Anime Fans Worldwide</p>
            <div className="flex flex-wrap justify-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-xl font-bold font-mono tracking-tighter text-gray-400">STREAMERS</span>
              <span className="text-xl font-bold font-mono tracking-tighter text-gray-400">OTAKU_HQ</span>
              <span className="text-xl font-bold font-mono tracking-tighter text-gray-400">ANIME.SYS</span>
              <span className="text-xl font-bold font-mono tracking-tighter text-gray-400">VAULT</span>
              <span className="text-xl font-bold font-mono tracking-tighter text-gray-400">NEXUS</span>
            </div>
          </div>
        </section>

        {/* FEATURES Grid */}
        <section className="py-16 relative">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-20">
              <h2 className="text-4xl md:text-5xl font-medium mb-6">The Architecture</h2>
              <div className="h-px w-20 bg-white"></div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div
                className="p-8 rounded-xl hover:bg-white/5 transition-all duration-300 group"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-white group-hover:text-black transition-colors">
                  <Download className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Offline Access</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Download your favorite episodes and watch them anywhere, anytime. No internet required once downloaded.
                </p>
              </div>

              {/* Feature 2 */}
              <div
                className="p-8 rounded-xl hover:bg-white/5 transition-all duration-300 group"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-white group-hover:text-black transition-colors">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Native Performance</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Built specifically for your device. Experience lightning-fast performance with optimized resource usage.
                </p>
              </div>

              {/* Feature 3 */}
              <div
                className="p-8 rounded-xl hover:bg-white/5 transition-all duration-300 group"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-white group-hover:text-black transition-colors">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Seamless Sync</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Your watch history, favorites, and playlists sync across all devices. Pick up right where you left off.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SPECS / TABLE */}
        <section className="py-16 rounded-xl border-t border-white/5 relative">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-medium mb-4">System Requirements</h2>
              <p className="text-gray-500 text-sm font-mono uppercase tracking-widest">Minimum Specifications</p>
            </div>

            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="grid grid-cols-2 p-6 border-b border-white/10 bg-white/5">
                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Component</div>
                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Requirement</div>
              </div>

              <div className="grid grid-cols-2 p-6 border-b border-white/5 hover:bg-white/5 transition-colors">
                <div className="text-sm font-medium text-white">Operating System</div>
                <div className="text-sm text-gray-400 font-mono">Android 8.0+ / Windows 10 / macOS 11.0+</div>
              </div>

              <div className="grid grid-cols-2 p-6 border-b border-white/5 hover:bg-white/5 transition-colors">
                <div className="text-sm font-medium text-white">Processor</div>
                <div className="text-sm text-gray-400 font-mono">Dual-core 1.5 GHz or higher</div>
              </div>

              <div className="grid grid-cols-2 p-6 border-b border-white/5 hover:bg-white/5 transition-colors">
                <div className="text-sm font-medium text-white">Memory</div>
                <div className="text-sm text-gray-400 font-mono">4 GB RAM minimum</div>
              </div>

              <div className="grid grid-cols-2 p-6 hover:bg-white/5 transition-colors">
                <div className="text-sm font-medium text-white">Storage</div>
                <div className="text-sm text-gray-400 font-mono">500 MB available space</div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full py-16 bg-black/50 border-t border-white/10 rounded-xl backdrop-blur-sm relative mt-16">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 flex items-center justify-center">
                  <img
                    src="/tatakai-logo-square.png"
                    alt="Tatakai Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-bold text-lg tracking-tighter uppercase">Tatakai</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                Redefining anime streaming through purity of design and function. Built for the fans of tomorrow.
              </p>
            </div>
          </div>
        </footer>
      </main>

      <MobileNav />
    </div>
  );
}