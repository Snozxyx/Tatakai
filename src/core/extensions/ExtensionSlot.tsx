import React, { useSyncExternalStore } from 'react';
import { extensionRegistry } from './ExtensionRegistry';

interface ExtensionSlotProps {
  slotId: string;
  props?: any;
}

/**
 * Mount point for extension-contributed slot components. Subscribes to the
 * registry so slots contributed by a renderer bundle that activates AFTER this
 * component first mounts (bundles load in a boot effect) still appear.
 */
export function ExtensionSlot({ slotId, props }: ExtensionSlotProps) {
  // Re-render whenever the registry changes; snapshot is the slot array for this id.
  const components = useSyncExternalStore(
    (cb) => extensionRegistry.subscribe(cb),
    () => extensionRegistry.getSlotComponents(slotId),
    () => extensionRegistry.getSlotComponents(slotId),
  );

  if (components.length === 0) return null;

  return (
    <>
      {components.map((item) => (
        <React.Fragment key={item.id}>
          <item.component {...props} />
        </React.Fragment>
      ))}
    </>
  );
}
