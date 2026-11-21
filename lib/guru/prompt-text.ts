/**
 * Guruku text slots. This is the only file to edit when the merged safety rule
 * arrives: paste the text, set the rule ID, flip `status` to "final". No other
 * code reads safety wording from anywhere else.
 *
 * While `status` is "awaiting_merged_text", Guruku stays closed (no model call,
 * no spend reservation) in every environment, and `npm run preflight` fails.
 *
 * The MD's LU-GURU-SAFETY-20261121 wording is intentionally NOT used here: it
 * conflicts with the PRD lock (steer any topic back to learning rather than
 * refusing non-learning topics; AI disclosure; look into an answer before
 * calling it a mistake; hard-stop message). Elon is merging both into one text.
 */

export type GuruPromptStatus = "awaiting_merged_text" | "final";

export type GuruPromptText = {
  status: GuruPromptStatus;
  /** e.g. "LU-GURU-SAFETY-2026112X"; printed into the system prompt as a header. */
  safetyRuleId: string | null;
  /** The merged safety rule, carried verbatim in every system prompt. */
  safetyRule: string | null;
};

export const GURU_PROMPT: GuruPromptText = {
  // TODO(LU-GURU-SAFETY): awaiting LU-GURU-SAFETY merged text from Elon.
  status: "awaiting_merged_text",
  safetyRuleId: null,
  safetyRule: null,
};

/**
 * Product facts the model must not contradict. Not safety wording; keep them
 * true to what the app does.
 */
export const GURU_APP_CONTEXT = [
  "Kamu adalah Guruku, tutor belajar berbasis AI di aplikasi Lit Up untuk pelajar Indonesia.",
  "Fakta aplikasi: kamu hanya membaca teks. Kamu tidak menonton video, tidak membuka tautan, dan tidak punya ingatan dari sesi sebelumnya. Jangan pernah mengaku sebaliknya.",
  "Tulis dalam teks biasa tanpa HTML. Boleh pakai daftar pendek.",
].join("\n");

export const GURU_MODE_INSTRUCTION = {
  normal: "Jawab ringkas dan jelas, paling banyak sekitar 250 kata.",
  short: "Mode jawaban singkat: jawab paling banyak 3 kalimat.",
} as const;

/**
 * Learner-facing copy. Interim wording; replace with the merged text's wording
 * where it specifies any. `hardStop` must keep opening with "Guru sedang istirahat".
 */
export const GURU_UI_TEXT = {
  // TODO(LU-GURU-SAFETY): confirm against the merged text from Elon.
  aiDisclosure: "Guruku adalah AI, bukan manusia. Jawabannya bisa keliru, jadi cek lagi hal yang penting.",
  // TODO(LU-GURU-SAFETY): confirm against the merged text from Elon.
  hardStop:
    "Guru sedang istirahat. Kuota bulan ini sudah habis, jadi Guruku belum bisa menjawab. Jelajahi dan Belajarku tetap bisa dibuka.",
  /** Shown when the provider's safety filter blocks a reply. */
  // TODO(LU-GURU-SAFETY): confirm against the merged text from Elon (PRD lock: steer back to learning).
  refusal: "Yuk, kita kembali ke belajar. Coba tanyakan hal lain yang ingin kamu pahami.",
  /** Shown while `GURU_PROMPT.status` is not "final". */
  pending: "Guruku belum aktif. Aturan keselamatannya sedang difinalkan. Jelajahi dan Belajarku tetap bisa dibuka.",
} as const;
