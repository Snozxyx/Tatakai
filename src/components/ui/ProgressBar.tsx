interface ProgressBarProps {
  progress: number;
  className?: string;
}

export function ProgressBar({ progress, className = "" }: ProgressBarProps) {
  return (
    <div className={`h-1 w-full bg-muted rounded-full overflow-hidden ${className}`}>
      <div
        className="ui-progress-fill h-full w-full origin-left bg-gradient-to-r from-primary to-secondary"
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }}
      />
    </div>
  );
}
