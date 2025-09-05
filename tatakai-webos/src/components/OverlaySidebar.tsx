import React from 'react';
import { Button, Divider } from '@heroui/react';
import { XMarkIcon, CogIcon } from '@heroicons/react/24/outline';

type Props = { 
  open: boolean; 
  onClose: () => void; 
  items: Array<{ id: string; label: string; icon?: React.ComponentType<{ className?: string }> }>; 
  onSelect: (_id: string) => void; 
};

export default function OverlaySidebar({ open, onClose, items, onSelect }: Props) {
  if (!open) return null;

  const backdropStyle = {
    position: 'fixed' as const,
    inset: '0',
    zIndex: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)'
  };

  const sidebarStyle = {
    position: 'absolute' as const,
    left: '0',
    top: '0',
    bottom: '0',
    width: '340px',
    backgroundColor: 'rgba(17, 17, 17, 0.95)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  };

  const headerStyle = {
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem'
  };

  const logoContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  };

  const logoStyle = {
    height: '3rem',
    width: 'auto'
  };

  const titleStyle = {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#ffffff'
  };

  const navStyle = {
    padding: '0 1.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    flex: '1'
  };

  const footerStyle = {
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    padding: '0 1.5rem 1.5rem'
  };

  return (
    <div style={{ position: 'fixed', inset: '0', zIndex: 50 }}>
      {/* Backdrop */}
      <div 
        style={backdropStyle}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Sidebar */}
      <aside style={sidebarStyle}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={headerStyle}>
            <div style={logoContainerStyle}>
              <img src="/logo.png" style={logoStyle} alt="Tatakai" />
              <span style={titleStyle}>Tatakai</span>
            </div>
            <Button
              isIconOnly
              variant="flat"
              color="default"
              onPress={onClose}
              className="focusable"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff'
              }}
            >
              <XMarkIcon className="w-6 h-6" />
            </Button>
          </div>

          {/* Navigation Items */}
          <nav style={navStyle}>
            {items.map((item) => (
              <Button
                key={item.id}
                variant="flat"
                color="default"
                startContent={item.icon && <item.icon className="w-6 h-6" />}
                onPress={() => onSelect(item.id)}
                className="focusable"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: '1.125rem',
                  padding: '1rem',
                  minHeight: '56px'
                }}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Footer */}
          <div style={footerStyle}>
            <Divider style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', marginBottom: '1rem' }} />
            <Button
              variant="flat"
              color="default"
              startContent={<CogIcon className="w-6 h-6" />}
              onPress={() => onSelect('settings')}
              className="focusable"
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                backgroundColor: 'transparent',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '1.125rem',
                padding: '1rem',
                minHeight: '56px'
              }}
            >
              Settings
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}