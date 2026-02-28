import { useNavigate } from 'react-router-dom';
import { Shield, Terminal, AlertTriangle } from 'lucide-react';

export default function DevtoolsBlockedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 overflow-hidden relative">
      {/* Background animated noise */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-[#050505] to-[#050505]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjYSkiIG9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-20" />

      <div className="relative z-10 max-w-lg w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-red-500/20 blur-3xl scale-150" />
            <div className="relative bg-red-950/60 border border-red-800/50 rounded-full p-8 backdrop-blur-sm">
              <Terminal className="w-16 h-16 text-red-400" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="uppercase tracking-[0.3em] text-xs font-bold">Security Alert</span>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Developer Console<br />
            <span className="text-red-400">Not Allowed</span>
          </h1>
        </div>

        {/* Description */}
        <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-6 backdrop-blur-sm space-y-3 text-left">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-zinc-300 text-sm leading-relaxed">
              Tatakai has detected that developer tools are open. For security reasons,
              the application cannot run while the developer console is active.
            </p>
          </div>
          <div className="border-t border-red-900/40 pt-3">
            <p className="text-zinc-500 text-xs">
              Close the developer tools (F12 or Ctrl+Shift+I) and refresh the page to continue.
            </p>
          </div>
        </div>

        {/* Code block decoration */}
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4 text-left font-mono text-xs text-zinc-500 backdrop-blur-sm select-none">
          <span className="text-red-500">▶</span> <span className="text-zinc-400">Tatakai</span>
          <span className="text-zinc-600"> | </span>
          <span className="text-yellow-500/70">SECURITY</span>
          <span className="text-zinc-600"> :: </span>
          <span className="text-zinc-400">devtools.detected</span>
          <span className="text-zinc-600"> → </span>
          <span className="text-red-400">access.denied</span>
        </div>

        {/* Action */}
        <button
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-all duration-200 border border-zinc-700/50 hover:border-zinc-600/50 text-sm"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
