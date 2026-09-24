"use client";

import { toDateKey } from "@/lib/sparks";

type MonthGridProps = {
  year: number;
  month: number;
  selectedDate: string;
  datesWithSparks: Set<string>;
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthGrid({
  year,
  month,
  selectedDate,
  datesWithSparks,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: MonthGridProps) {
  const todayKey = toDateKey(new Date());
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const label = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells: Array<{ key: string; dateKey?: string; day?: number }> = [];
  for (let i = 0; i < leading; i += 1) {
    cells.push({ key: `pad-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(new Date(year, month, day));
    cells.push({ key: dateKey, dateKey, day });
  }

  return (
    <section className="rounded-3xl border border-amber-200/10 bg-stone-950/60 p-4 shadow-[0_0_80px_rgba(251,191,36,0.06)] sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-full border border-amber-200/15 px-3 py-1.5 text-sm text-amber-100/80 hover:border-amber-300/40 hover:text-amber-50"
        >
          Prev
        </button>
        <h2 className="font-serif text-2xl tracking-tight text-amber-50 sm:text-3xl">
          {label}
        </h2>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-full border border-amber-200/15 px-3 py-1.5 text-sm text-amber-100/80 hover:border-amber-300/40 hover:text-amber-50"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-[0.18em] text-amber-200/40 sm:gap-2 sm:text-xs">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell) => {
          if (!cell.dateKey || cell.day === undefined) {
            return <div key={cell.key} className="aspect-square" />;
          }

          const lit = datesWithSparks.has(cell.dateKey);
          const selected = cell.dateKey === selectedDate;
          const isToday = cell.dateKey === todayKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(cell.dateKey!)}
              className={[
                "aspect-square rounded-2xl text-sm transition sm:text-base",
                selected
                  ? "bg-amber-300 text-stone-950"
                  : lit
                    ? "day-glow text-amber-50"
                    : "text-amber-100/70 hover:bg-white/5",
                isToday && !selected ? "ring-1 ring-amber-300/50" : "",
              ].join(" ")}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </section>
  );
}
