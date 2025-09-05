import React from 'react';
import { 
  Navbar, 
  NavbarBrand, 
  NavbarContent, 
  NavbarItem,
  Button,
  Avatar
} from '@heroui/react';
import { MagnifyingGlassIcon, Bars3Icon, UserIcon } from '@heroicons/react/24/outline';

export default function TVHeader({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <Navbar 
      maxWidth="full"
      className="backdrop-blur-xl bg-background/60 border-b border-white/10"
      height="5rem"
    >
      <NavbarBrand>
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="Tatakai" 
            className="h-10 w-auto"
          />
          <span className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
            Tatakai
          </span>
        </div>
      </NavbarBrand>

      <NavbarContent justify="end">
        <NavbarItem>
          <Button
            variant="flat"
            color="default"
            startContent={<MagnifyingGlassIcon className="w-5 h-5" />}
            className="focusable bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-medium"
            size="lg"
          >
            Search
          </Button>
        </NavbarItem>
        <NavbarItem>
          <Button
            variant="flat"
            color="default"
            startContent={<UserIcon className="w-5 h-5" />}
            className="focusable bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-medium"
            size="lg"
          >
            Profile
          </Button>
        </NavbarItem>
        <NavbarItem>
          <Button
            variant="flat"
            color="primary"
            startContent={<Bars3Icon className="w-5 h-5" />}
            onPress={onOpenNav}
            className="focusable font-medium"
            size="lg"
          >
            Menu
          </Button>
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
}