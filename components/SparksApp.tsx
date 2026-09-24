"use client";

import { useMemo, useState } from "react";
import { DayPanel } from "@/components/DayPanel";
import { MonthGrid } from "@/components/MonthGrid";
import { toDateKey, type Spark } from "@/lib/sparks";
import { useSparks } from "@/lib/use-sparks";

function startOfMonth(from: Date) {
  return new Date(from.getFullYear(), from.getMonth(), 1);
}

export function SparksApp() {
  const { sparks, sparksByDate, ready, addSpark, updateSpark, deleteSpark } =
    useSparks();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [editing, setEditing] = useState<Spark | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const datesWithSparks = useMemo(
    () => new Set(sparks.map((spark) => spark.date)),
    [sparks],
  );

  const daySparks = sparksByDate.get(selectedDate) ?? [];

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setEditing(null);
    setPanelOpen(true);
  }

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-amber-100/50">
        Lighting up…
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
      <div className="space-y-6">
        {sparks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-200/20 px-4 py-5 text-center text-sm text-amber-100/70">
            Your constellation is empty. Pick a day and save the first spark.
          </p>
        ) : null}

        <MonthGrid
          year={cursor.getFullYear()}
          month={cursor.getMonth()}
          selectedDate={selectedDate}
          datesWithSparks={datesWithSparks}
          onSelectDate={selectDate}
          onPrevMonth={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          onNextMonth={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
        />
      </div>

      <div
        className={[
          "lg:sticky lg:top-8 lg:block",
          panelOpen
            ? "fixed inset-0 z-20 bg-stone-950/80 p-4 lg:static lg:bg-transparent lg:p-0"
            : "hidden lg:block",
        ].join(" ")}
      >
        <DayPanel
          selectedDate={selectedDate}
          sparks={daySparks}
          editing={editing}
          onClose={() => setPanelOpen(false)}
          onEdit={setEditing}
          onCancelEdit={() => setEditing(null)}
          onSave={(input) => {
            if (editing) {
              updateSpark(editing.id, input);
              setEditing(null);
            } else {
              addSpark(input);
            }
          }}
          onDelete={(id) => {
            if (editing?.id === id) {
              setEditing(null);
            }
            deleteSpark(id);
          }}
        />
      </div>
    </div>
  );
}
