export const SPARK_TAGS = ["music", "people", "place", "other"] as const;

export type SparkTag = (typeof SPARK_TAGS)[number];

export type Spark = {
  id: string;
  date: string;
  title: string;
  note: string;
  tag: SparkTag;
  createdAt: number;
};

export const SPARKS_STORAGE_KEY = "lit-up-sparks";
export const SPARKS_SEEDED_KEY = "lit-up-seeded";

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDays(from: Date, days: number): string {
  const next = new Date(from);
  next.setDate(from.getDate() + days);
  return toDateKey(next);
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `spark-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSpark(input: {
  date: string;
  title: string;
  note?: string;
  tag?: SparkTag;
}): Spark {
  return {
    id: createId(),
    date: input.date,
    title: input.title.trim(),
    note: (input.note ?? "").trim(),
    tag: input.tag ?? "other",
    createdAt: Date.now(),
  };
}

export function defaultSeedSparks(now = new Date()): Spark[] {
  const today = toDateKey(now);
  return [
    createSpark({
      date: today,
      title: "Golden hour on the walk home",
      note: "The streetlights came on just as the sky went peach.",
      tag: "place",
    }),
    createSpark({
      date: shiftDays(now, -2),
      title: "A song I had not heard in years",
      note: "It still hits the same.",
      tag: "music",
    }),
    createSpark({
      date: shiftDays(now, -5),
      title: "Coffee with someone who really listened",
      note: "Left feeling lighter than I arrived.",
      tag: "people",
    }),
    createSpark({
      date: shiftDays(now, -9),
      title: "A sentence in a book that stopped me",
      tag: "other",
    }),
  ];
}

export function loadSparks(): Spark[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SPARKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Spark[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (spark) =>
        spark &&
        typeof spark.id === "string" &&
        typeof spark.date === "string" &&
        typeof spark.title === "string",
    );
  } catch {
    return [];
  }
}

export function saveSparks(sparks: Spark[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SPARKS_STORAGE_KEY, JSON.stringify(sparks));
}

export function seedIfNeeded(): Spark[] {
  if (typeof window === "undefined") {
    return [];
  }

  const alreadySeeded = window.localStorage.getItem(SPARKS_SEEDED_KEY) === "1";
  if (alreadySeeded) {
    return loadSparks();
  }

  const existing = loadSparks();
  const sparks = existing.length > 0 ? existing : defaultSeedSparks();
  saveSparks(sparks);
  window.localStorage.setItem(SPARKS_SEEDED_KEY, "1");
  return sparks;
}
