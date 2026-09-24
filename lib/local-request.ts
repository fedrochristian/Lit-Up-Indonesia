// This release is a single-user localhost workspace, not an authenticated service.
export function localRequest(request: Request, mutation = false) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  if (mutation) {
    const origin = request.headers.get("origin");
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return false;
    if (request.headers.get("sec-fetch-site") === "cross-site") return false;
    if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  }
  return true;
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  // Bound streamed input too; Content-Length alone can be absent or dishonest.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty request");
  let text = "", size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) { await reader.cancel(); throw new Error("Request too large"); }
    text += decoder.decode(value, { stream: true });
  }
  const body = JSON.parse(text + decoder.decode());
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON");
  return body;
}
