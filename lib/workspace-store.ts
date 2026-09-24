import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { emptyWorkspace, paths, resources, topics, type Workspace } from "./catalog";

const directory = path.join(process.cwd(), ".local");
const file = path.join(directory, "workspace.json");
const globalStore = globalThis as typeof globalThis & { litupWrites?: Promise<unknown> };
export class InputError extends Error {}
export async function readWorkspace(): Promise<Workspace> {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (data.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.plans) || !Array.isArray(data.completed) || !data.profile || !data.reflections || !Array.isArray(data.reports)) throw new Error("Invalid workspace");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyWorkspace();
    // Never overwrite a corrupt or unreadable workspace with empty defaults.
    throw error;
  }
}
function string(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) throw new InputError("Isian tidak valid atau terlalu panjang.");
  return value.trim();
}
export function applyAction(state: Workspace, action: Record<string, unknown>): Workspace {
  const id = typeof action.id === "string" ? action.id : "";
  switch (action.type) {
    case "bookmark": {
      if (!resources.some(r => r.id === id) || typeof action.value !== "boolean") throw new InputError("Materi tidak valid.");
      state.saved = action.value ? [...new Set([...state.saved, id])] : state.saved.filter(x => x !== id); break;
    }
    case "plan": {
      if (!paths.some(p => p.id === id) || typeof action.value !== "boolean") throw new InputError("Jalur tidak valid.");
      state.plans = action.value ? [...new Set([...state.plans, id])] : state.plans.filter(x => x !== id); break;
    }
    case "complete":
    case "reflection": {
      const plan = paths.find(p => p.steps.some(s => `${p.id}:${s.id}` === id));
      if (!plan || !state.plans.includes(plan.id)) throw new InputError("Mulai jalur ini terlebih dahulu.");
      if (action.type === "complete") {
        if (typeof action.value !== "boolean") throw new InputError("Status tidak valid.");
        state.completed = action.value ? [...new Set([...state.completed, id])] : state.completed.filter(x => x !== id);
      } else state.reflections[id] = string(action.value, 3000);
      break;
    }
    case "profile": {
      if (!action.value || typeof action.value !== "object") throw new InputError("Profil tidak valid.");
      const p = action.value as Record<string, unknown>;
      const profile = { name: string(p.name, 40), goal: string(p.goal, 300), topic: string(p.topic, 50), level: string(p.level, 30), language: string(p.language, 30), minutes: Number(p.minutes) };
      if (!profile.goal || !topics.slice(1).includes(profile.topic) || !["Pemula", "Menengah"].includes(profile.level) || !["Inggris", "Indonesia"].includes(profile.language) || ![30, 60, 90, 120, 180].includes(profile.minutes)) throw new InputError("Lengkapi tujuan dan preferensi belajarmu.");
      state.profile = profile; break;
    }
    case "report": {
      if (!resources.some(r => r.id === id) || !["Tautan rusak", "Informasi tidak tepat", "Materi tidak sesuai"].includes(String(action.value))) throw new InputError("Laporan tidak valid.");
      if (state.reports.length >= 500) throw new InputError("Antrean laporan penuh.");
      state.reports.push({ resourceId: id, reason: String(action.value), createdAt: new Date().toISOString() }); break;
    }
    default: throw new InputError("Aksi tidak dikenal.");
  }
  state.updatedAt = new Date().toISOString();
  return state;
}
export async function updateWorkspace(action: Record<string, unknown>) {
  const write = async () => {
    const data = applyAction(await readWorkspace(), action);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    return data;
  };
  const result = (globalStore.litupWrites ?? Promise.resolve()).then(write);
  globalStore.litupWrites = result.catch(() => undefined);
  return result;
}
