import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { type AppContext, createContext } from "../../src/context.js";
import { createServer } from "../../src/server.js";
import { defineWrite } from "../../src/tools/write.js";
import { fakeClock, tempDir } from "./helpers.js";

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/** A context whose browser is a stub: any attempt to use it is recorded instead. */
function setup(opts: { env?: Record<string, string>; at?: Date } = {}) {
  const home = tempDir();
  const config = loadConfig({ LINKEDIN_MCP_HOME: home, ...opts.env });
  const t = fakeClock(opts.at ?? new Date(2026, 10, 24, 10, 0));
  const ctx = createContext(config, t.clock);
  const browserCalls: string[] = [];
  const fakeNav = { requireSessionCookie: async () => undefined, page: {} };
  ctx.session = {
    run: async (fn: (nav: unknown) => Promise<unknown>) => {
      browserCalls.push("run");
      return fn(fakeNav);
    },
    close: async () => undefined,
    isOpen: () => false,
  } as unknown as BrowserSession;
  return { ctx, home, t, browserCalls };
}

async function connect(ctx: AppContext) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as ToolResult;
    const text = r.content[0]!.text;
    let body: Record<string, any>;
    try {
      body = JSON.parse(text) as Record<string, any>;
    } catch {
      body = { raw: text }; // schema violations come back as the SDK's standard validation message
    }
    return { isError: Boolean(r.isError), body };
  };
  return { client, call };
}

describe("MCP server", () => {
  it("lists every tool with annotations and the confirmation rule in write tools", async () => {
    const { ctx } = setup();
    const { client } = await connect(ctx);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "cancel_action", "comment_on_post", "confirm_action", "create_post", "delete_post", "get_audit_log", "get_company_posts",
        "get_company_profile", "get_conversation", "get_feed", "get_inbox", "get_limits", "get_my_posts",
        "get_my_profile", "get_notifications", "get_person_posts", "get_person_profile", "get_post_analytics", "get_post_comments",
        "get_profile_analytics", "list_invitations", "list_scheduled_posts", "pause", "react_to_post",
        "reply_to_comment", "respond_to_invitation", "resume", "schedule_post", "search_companies", "search_people",
        "search_posts", "send_connection_request", "send_message", "session_status", "set_limits",
      ].sort(),
    );
    expect(names).toHaveLength(35);
    for (const name of ["get_person_posts", "get_company_posts"]) {
      expect(tools.find((t) => t.name === name)!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    expect(tools.find((t) => t.name === "get_conversation")!.description).toMatch(/marks it as read/);
    for (const name of ["create_post", "schedule_post", "comment_on_post", "reply_to_comment", "send_message", "send_connection_request", "delete_post", "respond_to_invitation"]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.description).toMatch(/call confirm_action only after the user explicitly approves/);
    }
    expect(tools.find((t) => t.name === "get_feed")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "confirm_action")!.annotations?.destructiveHint).toBe(true);
  });

  it("previews a post without touching the browser, then dry-run confirms once", async () => {
    const { ctx, browserCalls } = setup({ env: { LINKEDIN_MCP_DRY_RUN: "true" } });
    const { call } = await connect(ctx);
    const preview = await call("create_post", { text: "Hello LinkedIn" });
    expect(preview.isError).toBe(false);
    expect(preview.body.status).toBe("awaiting_confirmation");
    expect(preview.body.preview).toMatchObject({ action: "Publish a post now", text: "Hello LinkedIn", characters: 14, visibility: "Anyone on or off LinkedIn" });
    expect(browserCalls).toHaveLength(0);

    const confirmed = await call("confirm_action", { confirmation_token: preview.body.confirmation_token });
    expect(confirmed.body).toMatchObject({ status: "dry_run", action: "create_post" });
    expect(browserCalls).toHaveLength(0);

    const again = await call("confirm_action", { confirmation_token: preview.body.confirmation_token });
    expect(again.isError).toBe(true);
    expect(again.body.error.code).toBe("CONFIRMATION_INVALID");

    const audit = await call("get_audit_log");
    expect(audit.body.entries[0]).toMatchObject({ tool: "create_post", result: "dry_run" });
    expect(JSON.stringify(audit.body)).not.toContain("Hello LinkedIn");
  });

  it("executes a confirmed write, counts it and audits it", async () => {
    const { ctx, browserCalls } = setup();
    let ran = 0;
    defineWrite<{ text: string }>({ kind: "test_write_ok", limit: "comment", target: () => "t", text: (p) => p.text, run: async () => ({ ran: ++ran }) });
    const { call } = await connect(ctx);
    const ticket = ctx.confirm.create({ kind: "test_write_ok", params: { text: "hi" }, preview: {} });
    const r = await call("confirm_action", { confirmation_token: ticket.confirmation_token });
    expect(r.body).toMatchObject({ status: "done", action: "test_write_ok", result: { ran: 1 } });
    expect(browserCalls).toEqual(["run"]);
    const limits = await call("get_limits");
    expect(limits.body.actions.find((a: { action: string }) => a.action === "comment").used_today).toBe(1);
    expect((await call("get_audit_log")).body.entries[0]).toMatchObject({ tool: "test_write_ok", result: "success" });
  });

  it("counts a failed attempt and audits the failure", async () => {
    const { ctx } = setup();
    defineWrite<{ text: string }>({ kind: "test_write_fail", limit: "message", target: () => null, text: (p) => p.text, run: async () => { throw new Error("boom"); } });
    const { call } = await connect(ctx);
    const ticket = ctx.confirm.create({ kind: "test_write_fail", params: { text: "x" }, preview: {} });
    const r = await call("confirm_action", { confirmation_token: ticket.confirmation_token });
    expect(r.isError).toBe(true);
    expect(r.body.error.code).toBe("INTERNAL");
    expect((await call("get_audit_log")).body.entries[0]).toMatchObject({ tool: "test_write_fail", result: "failed", error_code: "INTERNAL" });
    const limits = await call("get_limits");
    expect(limits.body.actions.find((a: { action: string }) => a.action === "message").used_today).toBe(1);
  });

  it("validates input before issuing a token", async () => {
    const { ctx } = setup();
    const { call } = await connect(ctx);
    const long = await call("create_post", { text: "x".repeat(3001) });
    expect(long.body.error.code).toBe("INVALID_INPUT");
    const both = await call("create_post", { text: "hi", images: ["/tmp/a.png"], document: { path: "/tmp/a.pdf", title: "t" } });
    expect(both.body.error.code).toBe("INVALID_INPUT");
    const badUrl = await call("comment_on_post", { post_url: "https://example.com/x", text: "hi" });
    expect(badUrl.body.error.message).toMatch(/not a LinkedIn post URL/);
    const badComment = await call("reply_to_comment", { post_url: "urn:li:activity:7260000000000000001", comment_id: "123", text: "hi" });
    expect(badComment.body.error.code).toBe("INVALID_INPUT");
    const missingImage = await call("create_post", { text: "hi", images: [join(tempDir(), "missing.png")] });
    expect(missingImage.body.error.message).toMatch(/File not found/);
  });

  it("rejects bad read inputs before the browser starts", async () => {
    const { ctx, browserCalls } = setup();
    const { call } = await connect(ctx);
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["get_person_profile", { profile: "not a profile" }, /not a LinkedIn profile/],
      ["get_person_posts", { profile: "../../etc" }, /not a LinkedIn profile/],
      ["get_company_profile", { company: "acme corp!" }, /not a LinkedIn company/],
      ["get_company_posts", { company: "https://www.linkedin.com/company/a b/" }, /not a LinkedIn company/],
      ["get_post_comments", { post_url: "https://example.com/x" }, /not a LinkedIn post URL/],
      ["get_post_analytics", { post_url: "nope" }, /not a LinkedIn post URL/],
      ["search_posts", { keywords: "  " }, /keywords/],
    ];
    for (const [name, args, message] of cases) {
      const r = await call(name, args);
      expect(r.isError, name).toBe(true);
      expect(r.body.error.code, name).toBe("INVALID_INPUT");
      expect(r.body.error.message, name).toMatch(message);
    }
    expect(browserCalls).toHaveLength(0);
  });

  it("refuses a capped read before the browser starts", async () => {
    const { ctx, browserCalls } = setup();
    const { call } = await connect(ctx);
    await call("set_limits", { search: 0, profile_view: 0 });
    expect((await call("search_posts", { keywords: "mcp" })).body.error.code).toBe("LIMIT_REACHED");
    expect((await call("get_person_posts", { profile: "jane-doe" })).body.error.code).toBe("LIMIT_REACHED");
    expect((await call("get_company_posts", { company: "northwind-labs" })).body.error.code).toBe("LIMIT_REACHED");
    expect(browserCalls).toHaveLength(0);
  });

  it("refuses writes outside working hours", async () => {
    const { ctx } = setup({ at: new Date(2026, 10, 24, 23, 30) });
    const { call } = await connect(ctx);
    const r = await call("comment_on_post", { post_url: "urn:li:activity:7260000000000000001", text: "Nice" });
    expect(r.body.error.code).toBe("OUTSIDE_WORKING_HOURS");
    // reads are not restricted by working hours
    expect((await call("get_limits")).isError).toBe(false);
  });

  it("refuses at preview time when a cap is already used up", async () => {
    const { ctx } = setup();
    const { call } = await connect(ctx);
    expect((await call("set_limits", { post: 0 })).isError).toBe(false);
    const r = await call("create_post", { text: "hi" });
    expect(r.body.error.code).toBe("LIMIT_REACHED");
    expect(r.body.error.details.resets_at).toBeTruthy();
  });

  it("rejects limits above the hard ceiling and persists valid ones", async () => {
    const { ctx, home } = setup();
    const { call } = await connect(ctx);
    const tooHigh = await call("set_limits", { reaction: 101 });
    expect(tooHigh.isError).toBe(true);
    expect(tooHigh.body.raw).toMatch(/Input validation error/);
    const ok = await call("set_limits", { reaction: 20 });
    expect(ok.body.updated).toEqual({ reaction: 20 });
    expect(loadConfig({ LINKEDIN_MCP_HOME: home }).limits).toEqual({ reaction: 20 });
  });

  it("pause blocks writes until resume", async () => {
    const { ctx } = setup();
    const { call } = await connect(ctx);
    await call("pause", { reason: "holiday" });
    expect((await call("create_post", { text: "hi" })).body.error.code).toBe("CIRCUIT_OPEN");
    const status = await call("session_status");
    expect(status.body.paused).toMatchObject({ reason: "manual", note: "holiday" });
    await call("resume");
    expect((await call("create_post", { text: "hi" })).body.status).toBe("awaiting_confirmation");
  });

  it("schedules on 15-minute slots within the allowed window", async () => {
    const { ctx } = setup();
    const { call } = await connect(ctx);
    const r = await call("schedule_post", { text: "Later", publish_at: new Date(2026, 10, 25, 9, 7).toISOString() });
    expect(r.body.status).toBe("awaiting_confirmation");
    const when = new Date(r.body.preview.publish_at.slice(0, 16).replace(" ", "T"));
    expect(when.getMinutes()).toBe(15);
    expect((await call("schedule_post", { text: "Soon", publish_at: new Date(2026, 10, 24, 10, 10).toISOString() })).body.error.message).toMatch(/at least 30 minutes/);
    expect((await call("schedule_post", { text: "Far", publish_at: new Date(2027, 5, 1).toISOString() })).body.error.message).toMatch(/90 days/);
  });

  it("reacts without a token only when the user turned reaction confirmations off", async () => {
    const withConfirm = setup();
    const a = await connect(withConfirm.ctx);
    expect((await a.call("react_to_post", { post_url: "urn:li:activity:7260000000000000001", reaction: "celebrate" })).body.status).toBe("awaiting_confirmation");

    const without = setup({ env: { LINKEDIN_MCP_CONFIRM_REACTIONS: "false", LINKEDIN_MCP_DRY_RUN: "true" } });
    const b = await connect(without.ctx);
    expect((await b.call("react_to_post", { post_url: "urn:li:activity:7260000000000000001" })).body).toMatchObject({ status: "dry_run", action: "react_to_post" });
  });

  it("warns about long connection notes in the preview", async () => {
    const { ctx } = setup();
    const { call } = await connect(ctx);
    const r = await call("send_connection_request", { profile: "jane-doe", note: "x".repeat(250) });
    expect(r.body.preview.warning).toMatch(/Premium/);
    expect(r.body.preview.profile_url).toBe("https://www.linkedin.com/in/jane-doe/");
  });

  it("accepts a real image upload in the preview", async () => {
    const { ctx } = setup();
    const file = join(tempDir(), "chart.png");
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    const { call } = await connect(ctx);
    const r = await call("create_post", { text: "Chart", images: [file] });
    expect(r.body.preview.attachments[0]).toMatchObject({ type: "image" });
  });
});
