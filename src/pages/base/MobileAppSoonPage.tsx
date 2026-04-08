import { Link } from "react-router-dom";
import { ArrowRight, BellRing, Clock3, Download, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";

export default function MobileAppSoonPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-6 max-w-7xl mx-auto pb-24 md:pb-8">
        <section className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide">
            <Clock3 className="w-3.5 h-3.5" />
            Mobile App Coming Soon
          </div>

          <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold leading-tight">
            Tatakai Mobile Is In Progress
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            We are polishing performance, offline downloads, and sync so the mobile release feels as smooth as web and desktop.
            The app page will open here as soon as the build is ready.
          </p>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            In parallel, we are actively developing desktop builds for Windows, Linux, and macOS with advanced capabilities like P2P-assisted streaming, stronger failover, and unified watch-state sync.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <GlassPanel className="lg:col-span-2 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-xl md:text-2xl font-semibold">What Is Being Built</h2>
                <p className="text-sm md:text-base text-muted-foreground mt-2">
                  A focused app experience with fast startup, better player stability, and stronger offline support.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Download className="w-4 h-4 text-primary" />
                  Offline Packs
                </div>
                <p className="text-xs text-muted-foreground mt-2">Queue episodes and keep watching without network drops.</p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  P2P + Stable Playback
                </div>
                <p className="text-xs text-muted-foreground mt-2">P2P-assisted delivery, provider failover, and stream health checks tuned for unstable networks.</p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BellRing className="w-4 h-4 text-primary" />
                  Smart Alerts
                </div>
                <p className="text-xs text-muted-foreground mt-2">Episode notifications without noisy spam or duplicate pushes.</p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Cross-Device Sync
                </div>
                <p className="text-xs text-muted-foreground mt-2">Continue exactly where you left off between web, desktop, and mobile.</p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Desktop Track
                </div>
                <p className="text-xs text-muted-foreground mt-2">Windows, Linux, and macOS feature rollout remains active in parallel with mobile.</p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 md:p-7 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Release Window</h3>
              <p className="text-sm text-muted-foreground mt-2">Targeting staged rollout after stability and store review checks.</p>

              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-border/40 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Phase 1</p>
                  <p className="text-sm font-medium">Android Closed Beta</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Phase 2</p>
                  <p className="text-sm font-medium">Public Android Release</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Phase 3</p>
                  <p className="text-sm font-medium">iOS TestFlight</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <Button asChild className="gap-2">
                <a href="https://dsc.gg/tatakai" target="_blank" rel="noreferrer">
                  Join Discord For Updates
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/">
                  Back To Home
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </GlassPanel>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
