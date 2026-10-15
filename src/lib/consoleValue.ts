/** Console inspection must never crash on Errors, bigint, DOM nodes or cycles. */
export function consoleValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(
        value,
        (_key, item) => {
          if (typeof item === 'bigint') return `${item}n`;
          if (item instanceof Error)
            return {
              name: item.name,
              message: item.message,
              stack: item.stack,
            };
          if (typeof item === 'object' && item !== null) {
            if (seen.has(item)) return '[Circular]';
            seen.add(item);
          }
          return item;
        },
        2
      ) ?? String(value)
    );
  } catch {
    try {
      return String(value);
    } catch {
      return '[Uninspectable]';
    }
  }
}
