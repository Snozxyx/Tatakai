export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseCalendarDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  return calendarDateKey(value) === raw ? value : null;
}

export function calendarDay(start: Date, offset: number): Date {
  const value = new Date(start);
  value.setDate(value.getDate() + offset);
  return value;
}

/** Local-time periods and exact airing slots, in chronological agenda order. */
export function groupDailyAirings<T extends { airingAt: number }>(
  entries: T[]
) {
  const periods = [
    { id: "overnight", start: 0, end: 6 },
    { id: "morning", start: 6, end: 12 },
    { id: "afternoon", start: 12, end: 18 },
    { id: "evening", start: 18, end: 24 },
  ];
  return periods
    .map((period) => {
      const slots = new Map<number, T[]>();
      for (const entry of [...entries].sort(
        (a, b) => a.airingAt - b.airingAt
      )) {
        const hour = new Date(entry.airingAt * 1000).getHours();
        if (hour < period.start || hour >= period.end) continue;
        const minute = Math.floor(entry.airingAt / 60) * 60;
        slots.set(minute, [...(slots.get(minute) || []), entry]);
      }
      return {
        ...period,
        slots: [...slots].map(([airingAt, entries]) => ({ airingAt, entries })),
      };
    })
    .filter((period) => period.slots.length > 0);
}
