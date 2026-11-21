import "server-only";
import { randomUUID } from "node:crypto";
import { sendOperatorAlert } from "../alert";
import { readGuruConfig, type GuruConfig } from "../config";
import { crashCourseSource } from "../jelajahi/whitelist";
import { turnSignature } from "../hash";
import { logEvent } from "../server-events";
import { rpc } from "../supabase/admin";
import { callGemini } from "./gemini";
import type { GuruDeps } from "./handler";

/** Throws (and Guruku fails closed) if config or the API key is missing. */
export function liveGuruDeps(): GuruDeps {
  const config: GuruConfig = readGuruConfig();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return {
    config,
    rpc,
    callModel: (req) => callGemini(req, apiKey),
    logEvent,
    alert: sendOperatorAlert,
    isWhitelisted: (id) => crashCourseSource.hasVideo(id),
    newRequestId: randomUUID,
    now: () => new Date(),
    signTurn: (accountHash, text) => turnSignature(accountHash, text),
  };
}
