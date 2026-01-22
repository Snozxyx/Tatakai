import React from 'react';

interface Point { date: string; count: number }

export function Sparkline({ series, width = 80, height = 28, stroke = 'currentColor' }: { series: Point[] | null | undefined; width?: number; height?: number; stroke?: string }) {
  if (!series || series.length === 0) {
    // Render empty placeholder
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-40 text-muted-foreground">
        <rect x="0" y="0" width={width} height={height} rx="4" fill="currentColor" opacity="0.03" />
      </svg>
    );
  }

  const values = series.map(s => s.count);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const stepX = width / Math.max(1, series.length - 1);

  const points = series.map((s, i) => {
    const x = i * stepX;
    const y = height - ((s.count - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
