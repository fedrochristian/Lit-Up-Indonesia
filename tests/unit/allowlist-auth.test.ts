import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { emailSha256, isAllowlisted, MAX_ALLOWLIST, parseAllowlist } from "../../lib/allowlist";
import { INVALID_EMAIL_MESSAGE, NEUTRAL_MESSAGE, requestMagicLink, type MagicLinkDeps } from "../../lib/auth/magic-link";

const TEAM = "fedro@example.com, tri.test@example.com; steve@example.com elon@example.com,leo@example.com,charlie@example.com,peter@example.com";

function harness(allowlistRaw = TEAM, overrides: Partial<MagicLinkDeps> = {}) {
  const sent: { email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string } }[] = [];
  const events: { name: string; props: Record<string, unknown> }[] = [];
  const deps: MagicLinkDeps = {
    allowlist: parseAllowlist(allowlistRaw),
    redirectTo: "https://lit-up-indonesia-abc123-team.vercel.app/auth/confirm",
    rateLimit: async () => true,
    sendOtp: async (email, options) => {
      sent.push({ email, options });
      return { error: null };
    },
    logEvent: async (name, props) => {
      events.push({ name, props });
    },
    logError: () => {},
    ...overrides,
  };
  return { deps, sent, events };
}

describe("allowlist parsing (fails closed)", () => {
  test("parses mixed separators and normalizes case/whitespace", () => {
    const list = parseAllowlist(TEAM);
    assert.equal(list.ok, true);
    assert.equal(isAllowlisted(list, "  Fedro@Example.COM "), true);
    assert.equal(isAllowlisted(list, "peter@example.com"), true);
  });

  test("exact match only: plus-address and lookalike variants are not allowlisted", () => {
    const list = parseAllowlist(TEAM);
    assert.equal(isAllowlisted(list, "fedro+x@example.com"), false);
    assert.equal(isAllowlisted(list, "fedro@example.co"), false);
    assert.equal(isAllowlisted(list, ""), false);
    assert.equal(isAllowlisted(list, null), false);
  });

  test("empty, malformed, or more than 13 accounts allows nobody", () => {
    assert.equal(parseAllowlist("").ok, false);
    assert.equal(parseAllowlist(undefined).ok, false);
    assert.equal(parseAllowlist("fedro@example.com, not-an-email").ok, false);
    const fourteen = Array.from({ length: MAX_ALLOWLIST + 1 }, (_, i) => `t${i}@example.com`).join(",");
    const tooMany = parseAllowlist(fourteen);
    assert.equal(tooMany.ok, false);
    assert.equal(isAllowlisted(tooMany, "t0@example.com"), false);
    const thirteen = Array.from({ length: MAX_ALLOWLIST }, (_, i) => `t${i}@example.com`).join(",");
    assert.equal(parseAllowlist(thirteen).ok, true);
  });

  test("emailSha256 matches the SQL hook digest of the normalized email", () => {
    const expected = createHash("sha256").update("fedro@example.com").digest("hex");
    assert.equal(emailSha256(" FEDRO@example.com "), expected);
  });
});

describe("magic-link request: allowlist enforced server-side before any email is sent", () => {
  test("an email off the allowlist is rejected: no OTP sent, neutral message, auth_denied logged", async () => {
    const { deps, sent, events } = harness();
    const result = await requestMagicLink("stranger@example.com", deps);
    assert.equal(sent.length, 0, "signInWithOtp must not be called");
    assert.equal(result.sent, false);
    assert.equal(result.message, NEUTRAL_MESSAGE);
    assert.deepEqual(events, [
      { name: "auth_link_requested", props: { allowlisted: false } },
      { name: "auth_denied", props: { reason: "not_allowlisted" } },
    ]);
    assert.ok(!JSON.stringify(events).includes("stranger"), "no raw email in events");
  });

  test("an allowlisted email is accepted: OTP sent with account creation allowed and the preview redirect", async () => {
    const { deps, sent, events } = harness();
    const result = await requestMagicLink("Tri.Test@Example.com", deps);
    assert.equal(result.sent, true);
    assert.equal(result.message, NEUTRAL_MESSAGE, "same neutral message either way");
    assert.deepEqual(sent, [
      {
        email: "tri.test@example.com",
        options: { shouldCreateUser: true, emailRedirectTo: "https://lit-up-indonesia-abc123-team.vercel.app/auth/confirm" },
      },
    ]);
    assert.deepEqual(events, [{ name: "auth_link_requested", props: { allowlisted: true } }]);
  });

  test("a misconfigured allowlist (14 entries) rejects even a listed email", async () => {
    const raw = Array.from({ length: 14 }, (_, i) => `t${i}@example.com`).join(",");
    const { deps, sent } = harness(raw);
    await requestMagicLink("t0@example.com", deps);
    assert.equal(sent.length, 0);
  });

  test("invalid input and rate limiting never reach Supabase", async () => {
    const invalid = harness();
    assert.equal((await requestMagicLink("nope", invalid.deps)).message, INVALID_EMAIL_MESSAGE);
    assert.equal((await requestMagicLink(42, invalid.deps)).status, "invalid");
    assert.equal(invalid.sent.length, 0);

    const limited = harness(TEAM, { rateLimit: async () => false });
    assert.equal((await requestMagicLink("fedro@example.com", limited.deps)).status, "rate_limited");
    assert.equal(limited.sent.length, 0);
  });

  test("a Supabase send error still shows the neutral message", async () => {
    const errors: string[] = [];
    const { deps } = harness(TEAM, { sendOtp: async () => ({ error: "rate limit" }), logError: (m) => errors.push(m) });
    const result = await requestMagicLink("fedro@example.com", deps);
    assert.equal(result.message, NEUTRAL_MESSAGE);
    assert.equal(result.sent, false);
    assert.equal(errors.length, 1);
  });
});
