import { isCustomizationObject } from './customization';

/** Only fields changed in this draft are committed; null persists deliberate resets. */
export function diffCustomizationValue(before: unknown, after: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(after)) return undefined;
  if (!isCustomizationObject(after)) return after === undefined ? null : after;
  const result: Record<string, unknown> = {};
  const previous = isCustomizationObject(before) ? before : {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(after)])) {
    const changed = diffCustomizationValue(previous[key], after[key]);
    if (changed !== undefined) result[key] = changed;
  }
  return Object.keys(result).length ? result : undefined;
}
