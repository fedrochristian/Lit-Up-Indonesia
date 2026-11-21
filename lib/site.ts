/**
 * Origin for sign-in redirects. Production uses NEXT_PUBLIC_SITE_URL; previews
 * and local dev use the request origin, which must match a redirect URL
 * pattern in Supabase Auth (otherwise Supabase falls back to its Site URL).
 */
export function siteOrigin(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === "production" && env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
