import React from 'react';
import { XMarkIcon, CogIcon } from '@heroicons/react/24/outline';
import Focusable from './Focusable';

type Props = { 
  open: boolean; 
  onClose: () => void; 
  items: Array<{ id: string; label: string; icon?: React.ComponentType<{ className?: string }> }>; 
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
              <XMarkIcon className="w-6 h-6 text-white" />
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
                  <item.icon className="w-6 h-6" />
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
                <CogIcon className="w-6 h-6" />
                <span>Settings</span>
              </div>
            </Focusable>
          </div>
        </div>
      </aside>
    </div>
  );
}