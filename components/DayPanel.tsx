"use client";

import { parseDateKey, type Spark, type SparkTag } from "@/lib/sparks";
import { SparkForm } from "@/components/SparkForm";

type DayPanelProps = {
  selectedDate: string;
  sparks: Spark[];
  editing: Spark | null;
  onClose: () => void;
  onEdit: (spark: Spark) => void;
  onCancelEdit: () => void;
  onSave: (input: {
    date: string;
    title: string;
    note: string;
    tag: SparkTag;
  }) => void;
  onDelete: (id: string) => void;
};

const TAG_LABELS: Record<SparkTag, string> = {
  music: "Music",
  people: "People",
  place: "Place",
  other: "Other",
};

export function DayPanel({
  selectedDate,
  sparks,
  editing,
  onClose,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: DayPanelProps) {
  const heading = parseDateKey(selectedDate).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <aside className="flex h-full max-h-[min(90vh,720px)] flex-col overflow-hidden rounded-3xl border border-amber-200/10 bg-stone-950/80 shadow-[0_0_80px_rgba(251,191,36,0.08)]">
      <div className="flex items-start justify-between gap-3 border-b border-amber-200/10 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/50">
            Day
          </p>
          <h2 className="font-serif text-2xl text-amber-50">{heading}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-amber-100/60 hover:text-amber-50 lg:hidden"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {sparks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-200/15 px-4 py-6 text-center text-sm text-amber-100/55">
            Nothing logged yet. Add the small thing that made this day glow.
          </p>
        ) : (
          <ul className="space-y-3">
            {sparks.map((spark) => (
              <li
                key={spark.id}
                className="rounded-2xl border border-amber-200/10 bg-black/30 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-amber-50">{spark.title}</p>
                    {spark.note ? (
                      <p className="mt-1 text-sm text-amber-100/60">
                        {spark.note}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-amber-300/70">
                      {TAG_LABELS[spark.tag]}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(spark)}
                      className="text-sm text-amber-200/80 hover:text-amber-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(spark.id)}
                      className="text-sm text-rose-200/70 hover:text-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <SparkForm
          selectedDate={selectedDate}
          editing={editing}
          onCancelEdit={onCancelEdit}
          onSave={onSave}
        />
      </div>
    </aside>
  );
}
