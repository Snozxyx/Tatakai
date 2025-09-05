import React from 'react';
import { Button } from '@heroui/react';
import { MagnifyingGlassIcon, Bars3Icon } from '@heroicons/react/24/outline';

export default function TVHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const headerStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17, 17, 17, 0.8)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '1rem'
  };

  const logoContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  };

  const logoStyle = {
    height: '2.5rem',
    width: 'auto'
  };

  const titleStyle = {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#ffffff'
  };

  const buttonContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  };

  return (
    <header style={headerStyle} className="px-safeH">
      <div style={logoContainerStyle}>
        <img src="/logo.png" alt="Tatakai" style={logoStyle} />
        <span style={titleStyle}>Tatakai</span>
      </div>

      <div style={buttonContainerStyle}>
        {/* Search Button */}
        <Button
          variant="flat"
          color="default"
          startContent={<MagnifyingGlassIcon className="w-5 h-5" />}
          className="focusable"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            minHeight: '44px'
          }}
        >
          Search
        </Button>

        {/* Menu Button */}
        <Button
          variant="flat"
          color="default"
          startContent={<Bars3Icon className="w-5 h-5" />}
          onPress={onOpenNav}
          className="focusable"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            minHeight: '44px'
          }}
        >
          Menu
        </Button>
      </div>
    </header>
  );
}