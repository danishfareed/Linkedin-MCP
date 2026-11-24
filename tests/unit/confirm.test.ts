import { describe, expect, it } from "vitest";
import type { LinkedInMcpError } from "../../src/errors.js";
import { ConfirmationManager, TOKEN_TTL_MS, canonicalJson, hashParams } from "../../src/safety/confirm.js";
import { fakeClock } from "./helpers.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as LinkedInMcpError).code;
  }
  return undefined;
}

describe("canonicalJson / hashParams", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(hashParams("k", { x: 1, y: 2 })).toBe(hashParams("k", { y: 2, x: 1 }));
  });

  it("changes when any parameter or the kind changes", () => {
    const base = hashParams("create_post", { text: "hello" });
    expect(hashParams("create_post", { text: "hello!" })).not.toBe(base);
    expect(hashParams("comment_on_post", { text: "hello" })).not.toBe(base);
  });
});

describe("ConfirmationManager", () => {
  it("issues a token with preview and expiry, and redeems it once", () => {
    const t = fakeClock(new Date("2026-11-24T10:00:00Z"));
    const cm = new ConfirmationManager(t.clock);
    const ticket = cm.create({ kind: "create_post", params: { text: "Hi" }, preview: { text: "Hi" } });

    expect(ticket.status).toBe("awaiting_confirmation");
    expect(ticket.preview).toEqual({ text: "Hi" });
    expect(new Date(ticket.expires_at).getTime()).toBe(t.clock().getTime() + TOKEN_TTL_MS);

    const action = cm.redeem(ticket.confirmation_token);
    expect(action.kind).toBe("create_post");
    expect(action.params).toEqual({ text: "Hi" });

    expect(codeOf(() => cm.redeem(ticket.confirmation_token))).toBe("CONFIRMATION_INVALID");
  });

  it("rejects expired tokens", () => {
    const t = fakeClock(new Date("2026-11-24T10:00:00Z"));
    const cm = new ConfirmationManager(t.clock);
    const ticket = cm.create({ kind: "x", params: {}, preview: {} });
    t.advance(TOKEN_TTL_MS + 1);
    expect(codeOf(() => cm.redeem(ticket.confirmation_token))).toBe("CONFIRMATION_INVALID");
  });

  it("binds the token to its own parameters (swapped MACs fail)", () => {
    const cm = new ConfirmationManager();
    const a = cm.create({ kind: "send_message", params: { to: "a", text: "one" }, preview: {} });
    const b = cm.create({ kind: "send_message", params: { to: "b", text: "two" }, preview: {} });
    const [idA] = a.confirmation_token.split(".");
    const [, macB] = b.confirmation_token.split(".");
    expect(codeOf(() => cm.redeem(`${idA}.${macB}`))).toBe("CONFIRMATION_INVALID");
    // and the forged attempt burned token A
    expect(codeOf(() => cm.redeem(a.confirmation_token))).toBe("CONFIRMATION_INVALID");
    expect(cm.redeem(b.confirmation_token).params).toEqual({ to: "b", text: "two" });
  });

  it("freezes a copy of the parameters at preview time", () => {
    const cm = new ConfirmationManager();
    const params = { text: "original", images: ["a.png"] };
    const ticket = cm.create({ kind: "create_post", params, preview: {} });
    params.text = "changed";
    params.images.push("b.png");
    const action = cm.redeem(ticket.confirmation_token);
    expect(action.params).toEqual({ text: "original", images: ["a.png"] });
    expect(Object.isFrozen(action.params)).toBe(true);
  });

  it("rejects malformed and unknown tokens", () => {
    const cm = new ConfirmationManager();
    expect(codeOf(() => cm.redeem("nonsense"))).toBe("CONFIRMATION_INVALID");
    expect(codeOf(() => cm.redeem("abc.def"))).toBe("CONFIRMATION_INVALID");
  });

  it("cancels a pending token", () => {
    const cm = new ConfirmationManager();
    const ticket = cm.create({ kind: "x", params: {}, preview: {} });
    expect(cm.cancel(ticket.confirmation_token)).toBe(true);
    expect(codeOf(() => cm.redeem(ticket.confirmation_token))).toBe("CONFIRMATION_INVALID");
  });
});
