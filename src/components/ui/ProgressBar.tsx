interface ProgressBarProps {
  progress: number;
  className?: string;
}

export function ProgressBar({ progress, className = "" }: ProgressBarProps) {
  return (
    <div className={`h-1 w-full bg-muted rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
