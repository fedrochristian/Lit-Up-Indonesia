import { InputError, readWorkspace, updateWorkspace } from "@/lib/workspace-store";
import { localRequest, readBody } from "@/lib/local-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!localRequest(request)) return Response.json({ error: "Local workspace only." }, { status: 403 });
  try { return Response.json(await readWorkspace(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Data lokal tidak dapat dibaca. Data asli tetap tersimpan; periksa .local/workspace.json." }, { status: 500 }); }
}
export async function POST(request: Request) {
  if (!localRequest(request, true)) return Response.json({ error: "Permintaan tidak diizinkan." }, { status: 403 });
  let action;
  try { action = await readBody(request); } catch { return Response.json({ error: "Permintaan tidak valid (maks. 20 KB)." }, { status: 400 }); }
  try { return Response.json(await updateWorkspace(action)); }
  catch (error) { return Response.json({ error: error instanceof InputError ? error.message : "Belum tersimpan. Periksa penyimpanan lokal dan coba lagi." }, { status: error instanceof InputError ? 400 : 500 }); }
}
