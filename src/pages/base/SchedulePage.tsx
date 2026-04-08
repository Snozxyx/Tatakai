import { useAnimelokSchedule } from "@/hooks/useAnimelok";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Calendar, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { TimelineSchedule } from "@/components/anime/TimelineSchedule";

export default function SchedulePage() {
  const { data, isLoading } = useAnimelokSchedule();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        <Header />

        <div className="mb-12">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Return</span>
          </button>

          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center shadow-xl shadow-blue-500/10">
              <Calendar className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-white/90">Release Timeline</h1>
              <p className="text-muted-foreground mt-1.5 font-medium">Daily global simulcast releases</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-16">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-8">
                <Skeleton className="h-10 w-48 rounded-xl" />
                <div className="space-y-4">
                  {[...Array(3)].map((_, j) => <Skeleton key={j} className="h-24 w-full rounded-2xl" />)}
                </div>
              </div>
            ))}
          </div>
        ) : data && data.schedule ? (
          <TimelineSchedule schedule={data.schedule} accentColor="#60a5fa" />
        ) : (
          <GlassPanel className="p-12 text-center border-dashed border-white/10">
            <p className="text-muted-foreground font-medium">The schedule is currently unavailable</p>
          </GlassPanel>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
