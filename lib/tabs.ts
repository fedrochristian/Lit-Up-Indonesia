/** Locked order: FEDRO-DECISION LU-TAB-ORDER-20261121-1547 and LU-TAB-NAME-GURUKU-20261121-1547. */
export const TAB_IDS = ["jelajahi", "belajarku", "guruku", "komunitas"] as const;
export type TabId = (typeof TAB_IDS)[number];

export const TAB_LABELS: Record<TabId, string> = {
  jelajahi: "Jelajahi",
  belajarku: "Belajarku",
  guruku: "Guruku",
  komunitas: "Komunitas",
};

export function parseTab(value: unknown): TabId {
  return (TAB_IDS as readonly unknown[]).includes(value) ? (value as TabId) : "jelajahi";
}
