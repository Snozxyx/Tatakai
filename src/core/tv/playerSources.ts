/** Native menus are snapshots; resolve identities against the latest discovered servers. */
export function resolveNativeSourceSelection(
  sources: ReadonlyArray<{ id: string }>,
  event: { sourceId?: string; sourceIndex?: number },
): number | undefined {
  if (event.sourceId) {
    const index = sources.findIndex(source => source.id === event.sourceId);
    return index >= 0 ? index : undefined;
  }
  const index = event.sourceIndex;
  return Number.isInteger(index) && index! >= 0 && index! < sources.length ? index : undefined;
}
