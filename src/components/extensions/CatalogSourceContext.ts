import type { ReactNode } from 'react';

/** A verified catalogue page can retain the original extension's exact entry routes. */
export interface CatalogSourceContext {
  header: ReactNode;
  entries: ReactNode;
  actions?: ReactNode;
  open: () => void;
  canOpen: boolean;
  resume: boolean;
  onUnavailable: () => void;
}
export interface CatalogDetailProps {
  catalogId?: string;
  sourceContext?: CatalogSourceContext;
}
