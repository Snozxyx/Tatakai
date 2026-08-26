import React from 'react';
import { extensionRegistry } from './ExtensionRegistry';

interface ExtensionSlotProps {
  slotId: string;
  props?: any;
}

export function ExtensionSlot({ slotId, props }: ExtensionSlotProps) {
  const components = extensionRegistry.getSlotComponents(slotId);

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
