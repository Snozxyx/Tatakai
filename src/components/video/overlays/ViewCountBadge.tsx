import { Eye } from "lucide-react";

interface ViewCountBadgeProps {
  viewCount: number;
  isVisible: boolean;
}

export function ViewCountBadge({ viewCount, isVisible }: ViewCountBadgeProps) {
  if (!isVisible || viewCount <= 0) return null;

  return (
    <div className="absolute top-3 right-3 md:top-4 md:right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md text-white/90 text-xs md:text-sm font-medium z-10 transition-all duration-300 border border-white/10">
      <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
      <span className="font-semibold">
        {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : viewCount}
      </span>
      <span className="text-white/50 hidden sm:inline">views</span>
    </div>
  );
}
