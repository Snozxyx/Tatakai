import React from 'react';
import { extensionRegistry } from './ExtensionRegistry';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Sparkles, Activity } from 'lucide-react';

/**
 * This is a demonstration of how an extension (bundle.js) 
 * would interact with the Tatakai Extension API.
 */

export function initDemoExtension() {
  const extensionId = 'tatakai.demo.freedom';

  // 1. Register a custom page
  extensionRegistry.registerPage({
    id: `${extensionId}.custom-page`,
    path: '/ext-demo-page',
    label: 'Demo Page',
    component: () => (
      <div className="min-h-screen bg-background p-12">
        <h1 className="text-4xl font-bold mb-4">Extension Custom Page</h1>
        <p className="text-muted-foreground mb-8">This entire page was injected by an extension!</p>
        <GlassPanel className="p-8 max-w-2xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Sparkles className="text-primary" />
            Dynamic Content
          </h2>
          <p className="text-sm">Extensions can render any React component here.</p>
        </GlassPanel>
      </div>
    )
  });

  // 2. Register a UI Slot component
  extensionRegistry.registerSlot({
    id: `${extensionId}.slot-after-title`,
    slotId: 'anime-details-after-title',
    component: ({ anime }: { anime: any }) => (
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 mt-2 p-2 rounded-xl bg-primary/10 border border-primary/20 w-fit"
      >
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
          Extension Insight: {anime?.info?.stats?.type || 'Unknown'} detected
        </span>
      </motion.div>
    )
  });

  // 3. Register a search provider
  extensionRegistry.registerSearchProvider({
    id: `${extensionId}.search-provider`,
    name: 'Demo Source',
    search: async (query: string) => {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 600));
      
      if (query.toLowerCase().includes('demo')) {
        return [
          { 
            title: 'Demo Result 1', 
            type: 'Direct Stream', 
            image: 'https://images.unsplash.com/photo-1541562232579-512a21360020?w=100',
            url: 'https://tatakai.app'
          },
          { 
            title: 'Demo Result 2', 
            type: 'Cloud Drive', 
            image: 'https://images.unsplash.com/photo-1578632738908-6624ce957c8f?w=100',
            url: 'https://tatakai.app'
          }
        ];
      }
      return [];
    }
  });

  console.log('[DemoExtension] Initialized freedom demo');
}

// Framer motion hack since it might not be global
const motion = (window as any).motion || { div: (props: any) => <div {...props} /> };
