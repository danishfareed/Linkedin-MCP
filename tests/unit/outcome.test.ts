import { describe, expect, it } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { LinkedInMcpError } from "../../src/errors.js";
import { WriteAttempt, attemptFor, notSent, runWrite, sent, toWriteResult, unconfirmed } from "../../src/linkedin/outcome.js";
import { defineWrite, executeWrite, presentOutcome, writeBudgetMs } from "../../src/tools/write.js";
import { fakeClock, tempDir } from "./helpers.js";

describe("outcome model", () => {
  it("builds the three outcomes with retry safety that follows from the outcome", () => {
    expect(sent({ url: "u" })).toEqual({ outcome: "sent", retry_safe: false, data: { url: "u" } });
    expect(unconfirmed("r", "d")).toMatchObject({ outcome: "unconfirmed", retry_safe: false, reason: "r", detail: "d" });
    expect(notSent("already_pending", "d", { next_step: "n" })).toMatchObject({ outcome: "not_sent", retry_safe: true, reason: "already_pending", next_step: "n" });
  });

  it("treats undeclared results as unconfirmed, never sent, and fixes a wrong retry_safe", () => {
    expect(toWriteResult({ status: "sent" })).toMatchObject({ outcome: "unconfirmed", retry_safe: false, reason: "not_verified" });
    expect(toWriteResult(undefined)).toMatchObject({ outcome: "unconfirmed" });
    expect(toWriteResult({ outcome: "unconfirmed", retry_safe: true })).toMatchObject({ retry_safe: false });
    expect(toWriteResult({ outcome: "not_sent", retry_safe: false, reason: "x" })).toMatchObject({ retry_safe: true });
  });

  it("rethrows errors before the commit point and turns errors after it into unconfirmed", async () => {
    const before = {};
    await expect(
      runWrite(before, async () => {
        throw new LinkedInMcpError("SELECTOR_BROKEN", "no button", "report it");
      }),
    ).rejects.toMatchObject({ code: "SELECTOR_BROKEN" });

    const after = {};
    const r = await runWrite(after, async (attempt) => {
      attempt.commit("send button");
      throw new Error("Timeout 20000ms exceeded");
    });
    expect(r).toMatchObject({ outcome: "unconfirmed", retry_safe: false, reason: "error_after_send", commit_step: "send button", error: { code: "TIMEOUT" } });
  });

  it("cancels an attempt before the commit point so a late click can't happen", () => {
    const a = new WriteAttempt();
    expect(a.cancel("out of time")).toBe(true);
    expect(() => a.commit("send")).toThrow(/stopped before the final click/);
    expect(a.committed).toBe(false);

    const b = new WriteAttempt();
    b.commit("send");
    expect(b.cancel("out of time")).toBe(false);
    expect(b.committed).toBe(true);
    expect(b.commitStep).toBe("send");
  });

  it("shares one attempt per nav object", () => {
    const nav = {};
    expect(attemptFor(nav)).toBe(attemptFor(nav));
    expect(attemptFor({})).not.toBe(attemptFor(nav));
  });
});

describe("presentOutcome", () => {
  it("tells the assistant plainly whether a retry is safe", () => {
    const s = presentOutcome("send_message", "message", sent());
    expect(s).toMatchObject({ status: "sent", retry_safe: false });
    expect(s.next_step).toMatch(/Don't repeat/);

    const u = presentOutcome("send_message", "message", unconfirmed("message_not_shown", "no new message appeared."));
    expect(u).toMatchObject({ status: "unconfirmed", retry_safe: false, reason: "message_not_shown" });
    expect(u.message).toMatch(/final click went through/);
    expect(u.message).toMatch(/no new message appeared\.$/);
    expect(u.next_step).toMatch(/^Do not retry/);

    const n = presentOutcome("send_connection_request", "connection", notSent("already_pending", "you already have a pending invitation"));
    expect(n).toMatchObject({ status: "not_sent", retry_safe: true, reason: "already_pending" });
    expect(n.message).toBe("Nothing was sent: you already have a pending invitation.");
    expect(n.limit_note).toMatch(/counted once against today's connection requests limit/);
    expect(presentOutcome("respond_to_invitation", null, notSent("x", "y")).limit_note).toBeUndefined();
  });
});

describe("writeBudgetMs", () => {
  it("leaves room to answer before the client's own timeout", () => {
    expect(writeBudgetMs(55_000)).toBe(50_000);
    expect(writeBudgetMs(20_000)).toBe(15_000);
    expect(writeBudgetMs(400)).toBe(300);
  });
});

/** A context whose browser is a stub that hands `run` a fake nav. */
function setup(toolTimeoutMs?: number) {
  const config = loadConfig({ LINKEDIN_MCP_HOME: tempDir() });
  if (toolTimeoutMs) config.toolTimeoutMs = toolTimeoutMs;
  const ctx = createContext(config, fakeClock(new Date(2026, 10, 24, 10, 0)).clock);
  ctx.session = {
    run: async (fn: (nav: unknown) => Promise<unknown>) => fn({ requireSessionCookie: async () => undefined, page: {} }),
    close: async () => undefined,
  } as unknown as BrowserSession;
  const used = async (action: string) => (await ctx.limits.status()).actions.find((a) => a.action === action)!.used_today;
  return { ctx, used };
}

describe("executeWrite", () => {
  it("audits a verified write as success", async () => {
    const { ctx } = setup();
    defineWrite({
      kind: "t_sent",
      limit: "comment",
      target: () => "t",
      text: () => "hi",
      run: (nav) =>
        runWrite(nav, async (a) => {
          a.commit("post");
          return sent({ id: 1 });
        }),
    });
    const r = await executeWrite(ctx, "t_sent", {});
    expect(r).toMatchObject({ status: "sent", retry_safe: false, result: { id: 1 } });
    expect((await ctx.audit.recent(1))[0]).toMatchObject({ tool: "t_sent", result: "success" });
  });

  it("audits not_sent, counts the attempt exactly once and says so", async () => {
    const { ctx, used } = setup();
    defineWrite({ kind: "t_not_sent", limit: "connection", target: () => "p", text: () => null, run: (nav) => runWrite(nav, async () => notSent("already_pending", "already invited")) });
    const r = await executeWrite(ctx, "t_not_sent", {});
    expect(r).toMatchObject({ status: "not_sent", retry_safe: true, reason: "already_pending" });
    expect(r.limit_note).toBeDefined();
    expect(await used("connection")).toBe(1);
    expect((await ctx.audit.recent(1))[0]).toMatchObject({ result: "not_sent", reason: "already_pending" });
  });

  it("reports an error after the final click as unconfirmed, not as an error", async () => {
    const { ctx } = setup();
    defineWrite({
      kind: "t_after",
      limit: "message",
      target: () => "x",
      text: () => "hello",
      // No runWrite wrapper: executeWrite itself must notice the commit point.
      run: async (nav) => {
        attemptFor(nav).commit("send button");
        throw new LinkedInMcpError("CHECKPOINT", "security check", "resolve it in the browser");
      },
    });
    const r = await executeWrite(ctx, "t_after", {});
    expect(r).toMatchObject({ status: "unconfirmed", retry_safe: false, commit_step: "send button", error: { code: "CHECKPOINT" } });
    expect(r.next_step).toMatch(/resolve it in the browser/);
    expect((await ctx.audit.recent(1))[0]).toMatchObject({ result: "unconfirmed", error_code: "CHECKPOINT" });
  });

  it("keeps errors before the final click as errors and marks that nothing was sent", async () => {
    const { ctx } = setup();
    defineWrite({ kind: "t_before", limit: "message", target: () => "x", text: () => "hello", run: async () => { throw new LinkedInMcpError("SELECTOR_BROKEN", "gone", "report"); } });
    await expect(executeWrite(ctx, "t_before", {})).rejects.toMatchObject({ code: "SELECTOR_BROKEN", details: { nothing_sent: true } });
    expect((await ctx.audit.recent(1))[0]).toMatchObject({ result: "failed", error_code: "SELECTOR_BROKEN" });
  });

  it("reports a legacy result without an outcome as unconfirmed", async () => {
    const { ctx } = setup();
    defineWrite({ kind: "t_legacy", limit: null, target: () => null, text: () => null, run: async () => ({ status: "deleted" }) });
    expect(await executeWrite(ctx, "t_legacy", {})).toMatchObject({ status: "unconfirmed", reason: "not_verified" });
  });

  it("stops a slow write before its final click and reports a safe timeout", async () => {
    const { ctx } = setup(400);
    let lateCommit: unknown = null;
    defineWrite({
      kind: "t_slow_before",
      limit: "comment",
      target: () => null,
      text: () => null,
      run: async (nav) => {
        await new Promise((r) => setTimeout(r, 600));
        try {
          attemptFor(nav).commit("post");
        } catch (err) {
          lateCommit = err;
        }
        return sent();
      },
    });
    await expect(executeWrite(ctx, "t_slow_before", {})).rejects.toMatchObject({ code: "TIMEOUT", details: { nothing_sent: true } });
    await new Promise((r) => setTimeout(r, 400));
    expect(lateCommit).toBeInstanceOf(LinkedInMcpError);
  });

  it("reports a write that ran out of time after its final click as unconfirmed", async () => {
    const { ctx } = setup(400);
    defineWrite({
      kind: "t_slow_after",
      limit: "comment",
      target: () => null,
      text: () => null,
      run: async (nav) => {
        attemptFor(nav).commit("post");
        await new Promise((r) => setTimeout(r, 600));
        return sent();
      },
    });
    const r = await executeWrite(ctx, "t_slow_after", {});
    expect(r).toMatchObject({ status: "unconfirmed", retry_safe: false, reason: "timeout_after_send", commit_step: "post" });
    // When verification finishes later, the audit log records it.
    await new Promise((r) => setTimeout(r, 500));
    const [latest, earlier] = await ctx.audit.recent(2);
    expect(earlier).toMatchObject({ result: "unconfirmed" });
    expect(latest).toMatchObject({ result: "success", detail: expect.stringMatching(/after the tool call/) });
  });
});
