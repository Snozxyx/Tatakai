import React from 'react';
import Focusable from './Focusable';

type Props = {
  title: string;
  imgSrc: string;
  onSelect: () => void;
  meta?: string;
};

export default function AnimeCard({ title, imgSrc, onSelect, meta }: Props) {
  return (
    <Focusable
      tag="button"
      className="w-[160px] md:w-[220px] aspect-[2/3] overflow-hidden rounded-2xl relative group bg-tv-surface"
      onEnterPress={onSelect}
    >
      <img 
        src={imgSrc} 
        alt={title} 
        className="w-full h-full object-cover transition-transform duration-300 group-focus:scale-105"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = '/placeholder-anime.png';
        }}
      />
      
      {/* Lower scrim gradient */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent p-3 flex items-end">
        <div>
          <div className="text-sm md:text-lg font-semibold leading-tight text-white line-clamp-2">
            {title}
          </div>
          {meta && (
            <div className="text-xs text-gray-300 mt-1">
              {meta}
            </div>
          )}
        </div>
      </div>

      {/* Action overlay - visible when focused */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-focus:opacity-100 transition-opacity duration-200 bg-black/30">
        <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg pointer-events-auto">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-white">Play</span>
          </div>
        </div>
      </div>
    </Focusable>
  );
}