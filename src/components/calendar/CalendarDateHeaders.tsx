import { calendarDateKey, calendarDay } from "@/lib/calendarDates";
import uiI18n from "@/lib/uiI18n";
import { cn } from "@/lib/utils";

export function CalendarDateHeaders({ weekStart, days, todayKey, label, onSelect }: {
  weekStart: Date; days: number[]; todayKey: string; label: string; onSelect?: (date: Date) => void;
}) {
  return <div className={cn("calendar-day-headers", days.length === 7 && "calendar-week")}
    style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
    <span className="calendar-zone">{label}</span>
    {days.map(day => {
      const date = calendarDay(weekStart, day);
      const isToday = calendarDateKey(date) === todayKey;
      return <button type="button" key={day} className={cn("calendar-day-heading", isToday && "is-today")}
        aria-label={date.toLocaleDateString(uiI18n.language, { dateStyle: "full" })}
        aria-current={isToday ? "date" : undefined} onClick={() => onSelect?.(date)}>
        <span>{date.toLocaleDateString(uiI18n.language, { weekday: "short" })}</span>
        <span className="calendar-date-number">{date.getDate()}</span>
      </button>;
    })}
  </div>;
}
