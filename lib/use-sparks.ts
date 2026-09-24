"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSpark,
  seedIfNeeded,
  saveSparks,
  type Spark,
  type SparkTag,
} from "@/lib/sparks";

export function useSparks() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSparks(seedIfNeeded());
    setReady(true);
  }, []);

  const persist = useCallback((next: Spark[]) => {
    setSparks(next);
    saveSparks(next);
  }, []);

  const addSpark = useCallback(
    (input: { date: string; title: string; note?: string; tag?: SparkTag }) => {
      persist([createSpark(input), ...sparks]);
    },
    [persist, sparks],
  );

  const updateSpark = useCallback(
    (
      id: string,
      patch: { title: string; note?: string; tag?: SparkTag; date?: string },
    ) => {
      persist(
        sparks.map((spark) =>
          spark.id === id
            ? {
                ...spark,
                title: patch.title.trim(),
                note: (patch.note ?? "").trim(),
                tag: patch.tag ?? spark.tag,
                date: patch.date ?? spark.date,
              }
            : spark,
        ),
      );
    },
    [persist, sparks],
  );

  const deleteSpark = useCallback(
    (id: string) => {
      persist(sparks.filter((spark) => spark.id !== id));
    },
    [persist, sparks],
  );

  const sparksByDate = useMemo(() => {
    const map = new Map<string, Spark[]>();
    for (const spark of sparks) {
      const list = map.get(spark.date) ?? [];
      list.push(spark);
      map.set(spark.date, list);
    }
    return map;
  }, [sparks]);

  return {
    sparks,
    sparksByDate,
    ready,
    addSpark,
    updateSpark,
    deleteSpark,
  };
}
