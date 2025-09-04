import React from 'react';

export default function SkeletonCard() {
  return (
    <div className="w-[160px] md:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden bg-tv-surface relative">
      {/* Main skeleton */}
      <div className="w-full h-full shimmer" />
      
      {/* Bottom overlay skeleton */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent p-3 flex items-end">
        <div className="w-full space-y-2">
          {/* Title skeleton */}
          <div className="h-4 bg-gray-600 rounded shimmer" style={{ width: '80%' }} />
          {/* Meta skeleton */}
          <div className="h-3 bg-gray-700 rounded shimmer" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}