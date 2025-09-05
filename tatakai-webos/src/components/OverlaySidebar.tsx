import React from 'react';
import { Button, Divider, Card, CardBody } from '@heroui/react';
import { XMarkIcon, CogIcon } from '@heroicons/react/24/outline';

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
      <aside className="absolute left-0 top-0 bottom-0 w-80">
        <Card className="h-full bg-content1/95 backdrop-blur-xl border-r border-white/10 rounded-none rounded-r-2xl shadow-2xl">
          <CardBody className="p-0 h-full flex flex-col">
            {/* Header */}
            <div className="p-6 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <img 
                  src="/logo.png" 
                  className="h-10 w-auto" 
                  alt="Tatakai" 
                />
                <span className="text-xl font-bold gradient-text">
                  Tatakai
                </span>
              </div>
              <Button
                isIconOnly
                variant="flat"
                color="default"
                onPress={onClose}
                className="focusable bg-white/10 hover:bg-white/20"
                size="lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>

            {/* Navigation Items */}
            <nav className="p-4 flex-1 space-y-2">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant="flat"
                  color="default"
                  startContent={item.icon && <item.icon className="w-5 h-5" />}
                  onPress={() => onSelect(item.id)}
                  className="focusable w-full justify-start text-left bg-transparent hover:bg-white/10 text-white/90 hover:text-white font-medium text-base h-14"
                >
                  {item.label}
                </Button>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <Button
                variant="flat"
                color="default"
                startContent={<CogIcon className="w-5 h-5" />}
                onPress={() => onSelect('settings')}
                className="focusable w-full justify-start bg-transparent hover:bg-white/10 text-white/70 hover:text-white font-medium text-base h-14"
              >
                Settings
              </Button>
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}