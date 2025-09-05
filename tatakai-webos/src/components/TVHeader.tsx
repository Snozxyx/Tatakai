import React from 'react';
import { MagnifyingGlassIcon, Bars3Icon } from '@heroicons/react/24/outline';
import Focusable from './Focusable';

export default function TVHeader({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="w-full flex items-center justify-between px-safeH py-4 bg-tvbg/80 backdrop-blur-md border-b border-tv-border">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="Tatakai" className="h-10 w-auto" />
        <span className="text-xl font-bold text-white hidden sm:block">Tatakai</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search Button */}
        <Focusable 
          tag="button" 
          className="px-4 py-2 rounded-lg bg-tv-surface hover:bg-black/40 transition-colors flex items-center space-x-2 min-h-[44px]"
        >
          <MagnifyingGlassIcon className="w-5 h-5 text-white" />
          <span className="text-white hidden sm:block">Search</span>
        </Focusable>

        {/* Menu Button */}
        <Focusable 
          tag="button" 
          className="px-4 py-2 rounded-lg bg-tv-surface hover:bg-black/40 transition-colors flex items-center space-x-2 min-h-[44px]"
          onEnterPress={onOpenNav}
        >
          <Bars3Icon className="w-5 h-5 text-white" />
          <span className="text-white hidden sm:block">Menu</span>
        </Focusable>
      </div>
    </header>
  );
}