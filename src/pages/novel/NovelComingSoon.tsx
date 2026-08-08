import { BookOpen, ArrowLeft, Sparkles, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";

export default function NovelComingSoon() {
  const navigate = useNavigate();
  const isNative = useIsNativeApp();

  return (
    <div className="min-h-screen bg-black text-zinc-50 overflow-x-hidden selection:bg-primary/30 font-sans">
      {/* Ambient Background Effects */}
      {!isNative && <Background />}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] opacity-60 mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] opacity-50 mix-blend-screen" />
      </div>

      {!isNative && <Sidebar />}

      <main className={cn(
        "relative z-10 py-6 max-w-[1400px] mx-auto min-h-screen flex flex-col items-center justify-center px-6 pb-24 lg:pb-6",
        !isNative && "pl-6 md:pl-32"
      )}>
        {/* Minimalist Frosted Back Button */}
        <div className="absolute top-12 left-6 md:left-32 z-50">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-300 group shadow-lg"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300" />
            <span className="text-sm font-medium tracking-wide">Back</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          
          <GlassPanel className="p-10 md:p-16 w-full relative overflow-hidden group bg-white/[0.02] border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem]">
            {/* Subtle internal glow */}
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-[80px] group-hover:bg-primary/30 transition-colors duration-700 opacity-50" />
            
            <div className="relative z-10 flex flex-col items-center gap-10">
              
              {/* App-like Icon Container */}
              <div className="relative group/icon">
                <div className="absolute inset-0 bg-primary/40 rounded-[2rem] blur-2xl group-hover/icon:blur-3xl transition-all duration-500 opacity-60" />
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-[2.2rem] bg-gradient-to-b from-white/15 to-white/5 border border-white/20 shadow-2xl backdrop-blur-2xl flex items-center justify-center transform group-hover/icon:scale-105 transition-all duration-500">
                  <div className="absolute inset-0 rounded-[2.2rem] bg-gradient-to-tr from-primary/30 via-transparent to-transparent opacity-50" />
                  <BookOpen className="w-12 h-12 md:w-14 md:h-14 text-white drop-shadow-lg" strokeWidth={1.5} />
                </div>
              </div>

              {/* Typography & Copy */}
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold uppercase tracking-widest text-primary mb-2 backdrop-blur-md">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>In Development</span>
                </div>
                
                <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 leading-[1.1]">
                  A new chapter <br className="hidden md:block"/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">awaits.</span>
                </h1>
                
                <p className="text-lg md:text-xl text-zinc-400 max-w-lg mx-auto font-medium tracking-tight leading-relaxed">
                  We're crafting an immersive light novel experience. Reading, tracking, and discovery will never be the same.
                </p>
              </div>

              {/* Action Button - Apple Style (High contrast pill) */}
              <button
                onClick={() => navigate("/")}
                className="mt-4 px-8 py-4 rounded-full bg-zinc-100 text-zinc-900 font-semibold text-base hover:bg-white hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 group/btn"
              >
                Return Home
                <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
              </button>
              
            </div>
          </GlassPanel>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}