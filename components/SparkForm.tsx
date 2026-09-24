"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SPARK_TAGS, type Spark, type SparkTag } from "@/lib/sparks";

type SparkFormProps = {
  selectedDate: string;
  editing: Spark | null;
  onCancelEdit: () => void;
  onSave: (input: {
    date: string;
    title: string;
    note: string;
    tag: SparkTag;
  }) => void;
};

const TAG_LABELS: Record<SparkTag, string> = {
  music: "Music",
  people: "People",
  place: "Place",
  other: "Other",
};

export function SparkForm({
  selectedDate,
  editing,
  onCancelEdit,
  onSave,
}: SparkFormProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState<SparkTag>("other");

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setNote(editing.note);
      setTag(editing.tag);
      return;
    }
    setTitle("");
    setNote("");
    setTag("other");
  }, [editing, selectedDate]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    onSave({
      date: selectedDate,
      title: trimmed,
      note: note.trim(),
      tag,
    });
    setTitle("");
    setNote("");
    setTag("other");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl text-amber-50">
          {editing ? "Edit spark" : "Add a spark"}
        </h3>
        {editing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-sm text-amber-200/70 hover:text-amber-100"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <label className="block text-sm text-amber-100/70">
        What lit you up?
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={120}
          placeholder="A moment, a song, a person…"
          className="mt-1 w-full rounded-xl border border-amber-200/15 bg-stone-950/80 px-3 py-2 text-amber-50 outline-none placeholder:text-amber-100/30 focus:border-amber-300/50"
        />
      </label>

      <label className="block text-sm text-amber-100/70">
        Note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={400}
          placeholder="Optional detail"
          className="mt-1 w-full resize-y rounded-xl border border-amber-200/15 bg-stone-950/80 px-3 py-2 text-amber-50 outline-none placeholder:text-amber-100/30 focus:border-amber-300/50"
        />
      </label>

      <label className="block text-sm text-amber-100/70">
        Tag
        <select
          value={tag}
          onChange={(event) => setTag(event.target.value as SparkTag)}
          className="mt-1 w-full rounded-xl border border-amber-200/15 bg-stone-950/80 px-3 py-2 text-amber-50 outline-none focus:border-amber-300/50"
        >
          {SPARK_TAGS.map((value) => (
            <option key={value} value={value}>
              {TAG_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="w-full rounded-full bg-amber-300 px-4 py-2.5 text-sm font-medium text-stone-950 hover:bg-amber-200"
      >
        {editing ? "Save changes" : "Save spark"}
      </button>
    </form>
  );
}
