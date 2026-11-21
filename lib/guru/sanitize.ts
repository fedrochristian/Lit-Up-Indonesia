import { VIDEO_ID_RE } from "../jelajahi/whitelist";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"'\]]+/gi;
export const LINK_REMOVED = "(tautan dihapus)";

function whitelistedVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("www.") ? `https://${url}` : url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let id: string | null = null;
    if (host === "youtube.com" && parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else if (host === "youtu.be") id = parsed.pathname.slice(1);
    return id && VIDEO_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Removes every link except YouTube links to a video on the Jelajahi whitelist. */
export function stripNonWhitelistLinks(text: string, isWhitelisted: (videoId: string) => boolean): string {
  return text.replace(URL_RE, (match) => {
    const trimmed = match.replace(/[.,;:!?]+$/, "");
    const tail = match.slice(trimmed.length);
    const id = whitelistedVideoId(trimmed);
    return id && isWhitelisted(id) ? match : LINK_REMOVED + tail;
  });
}
