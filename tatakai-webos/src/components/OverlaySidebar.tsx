import React from 'react';
import Focusable from './Focusable';

type Props = { 
  open: boolean; 
  onClose: () => void; 
  items: Array<{ id: string; label: string; icon?: string }>; 
  onSelect: (_id: string) => void; 
};

export default function OverlaySidebar({ open, onClose, items, onSelect }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Sidebar */}
      <aside className="absolute left-0 top-0 bottom-0 w-[340px] bg-tv-surface border-r border-tv-border shadow-2xl">
        <div className="p-6 h-full flex flex-col">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src="/logo.png" className="h-12 w-auto" alt="Tatakai" />
              <span className="text-xl font-bold text-white">Tatakai</span>
            </div>
            <Focusable
              tag="button"
              className="p-2 rounded-lg bg-black/20 hover:bg-black/40 transition-colors"
              onEnterPress={onClose}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Focusable>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-2">
            {items.map((item) => (
              <Focusable
                key={item.id}
                tag="button"
                className="w-full text-left p-4 rounded-lg text-lg text-white hover:bg-black/20 transition-colors flex items-center space-x-3"
                onEnterPress={() => onSelect(item.id)}
              >
                {item.icon && (
                  <span className="text-2xl">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </Focusable>
            ))}
          </nav>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-tv-border">
            <Focusable
              tag="button"
              className="w-full text-left p-4 rounded-lg text-lg text-gray-400 hover:text-white hover:bg-black/20 transition-colors"
              onEnterPress={() => onSelect('settings')}
            >
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </div>
            </Focusable>
          </div>
        </div>
      </aside>
    </div>
  );
}