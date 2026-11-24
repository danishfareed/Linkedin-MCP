import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { type AppContext, createContext } from "../../src/context.js";
import { createServer } from "../../src/server.js";
import { confirmationMessage } from "../../src/tools/confirm-in-client.js";
import { compactJson } from "../../src/tools/registry.js";
import { fakeClock, tempDir } from "./helpers.js";

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ LINKEDIN_MCP_HOME: tempDir(), ...env });
  const ctx = createContext(config, fakeClock(new Date(2026, 10, 24, 10, 0)).clock);
  const browserCalls: string[] = [];
  ctx.session = {
    run: async (fn: (nav: unknown) => Promise<unknown>) => {
      browserCalls.push("run");
      return fn({ requireSessionCookie: async () => undefined, page: {} });
    },
    close: async () => undefined,
    isOpen: () => false,
  } as unknown as BrowserSession;
  return { ctx, browserCalls };
}

async function connect(ctx: AppContext, answer?: (message: string) => ElicitResult) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" }, answer ? { capabilities: { elicitation: { form: {} } } } : {});
  const asked: string[] = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params.message);
      return answer(req.params.message);
    });
  }
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { isError: Boolean(r.isError), body: JSON.parse(r.content[0]!.text) as Record<string, any> };
  };
  return { client, call, asked };
}

describe("read-only mode", () => {
  it("hides every tool that can send something", async () => {
    const { ctx } = setup({ LINKEDIN_MCP_READ_ONLY: "true" });
    const { client } = await connect(ctx);
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const hidden of ["create_post", "schedule_post", "delete_post", "comment_on_post", "reply_to_comment", "react_to_post", "send_message", "send_connection_request", "respond_to_invitation", "confirm_action"]) {
      expect(names).not.toContain(hidden);
    }
    expect(names).toContain("get_feed");
    expect(names).toContain("session_status");
    expect(names).toContain("cancel_action");
  });

  it("rejects a value that isn't clearly true or false", () => {
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: tempDir(), LINKEDIN_MCP_READ_ONLY: "ture" })).toThrow(/LINKEDIN_MCP_READ_ONLY must be true or false/);
  });

  it("is reported by session_status", async () => {
    const { ctx } = setup({ LINKEDIN_MCP_READ_ONLY: "1" });
    const { call } = await connect(ctx);
    expect((await call("session_status")).body.read_only).toBe(true);
  });
});

describe("approval in the AI client", () => {
  it("asks the user in a dialog and only sends after they approve", async () => {
    const { ctx } = setup({ LINKEDIN_MCP_DRY_RUN: "true" });
    const { call, asked } = await connect(ctx, () => ({ action: "accept", content: { approve: true } }));
    const preview = await call("create_post", { text: "Shipping day.\n\nThanks to everyone who helped." });
    const done = await call("confirm_action", { confirmation_token: preview.body.confirmation_token });
    expect(done.isError).toBe(false);
    expect(done.body).toMatchObject({ status: "dry_run", approved_in_client: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^Publish this post on LinkedIn\?/);
    expect(asked[0]).toContain("Thanks to everyone who helped.");
  });

  it("sends nothing when the user declines, unchecks the box or dismisses the dialog", async () => {
    for (const answer of [{ action: "decline" }, { action: "accept", content: { approve: false } }, { action: "cancel" }] as ElicitResult[]) {
      const { ctx } = setup({ LINKEDIN_MCP_DRY_RUN: "true" });
      const { call } = await connect(ctx, () => answer);
      const preview = await call("create_post", { text: "Not today" });
      const r = await call("confirm_action", { confirmation_token: preview.body.confirmation_token });
      expect(r.isError).toBe(true);
      expect(r.body.error.code).toBe("USER_DECLINED");
      expect(await ctx.audit.recent(10)).toEqual([]);
      // The token is spent: approving later needs a fresh preview.
      expect((await call("confirm_action", { confirmation_token: preview.body.confirmation_token })).body.error.code).toBe("CONFIRMATION_INVALID");
    }
  });

  it("falls back to the token alone when the client can't show a dialog, or the user turned it off", async () => {
    const plain = setup({ LINKEDIN_MCP_DRY_RUN: "true" });
    const a = await connect(plain.ctx);
    const p1 = await a.call("create_post", { text: "Hello" });
    expect((await a.call("confirm_action", { confirmation_token: p1.body.confirmation_token })).body.status).toBe("dry_run");

    const off = setup({ LINKEDIN_MCP_DRY_RUN: "true", LINKEDIN_MCP_CONFIRM_IN_CLIENT: "false" });
    const b = await connect(off.ctx, () => ({ action: "decline" }));
    const p2 = await b.call("create_post", { text: "Hello" });
    expect((await b.call("confirm_action", { confirmation_token: p2.body.confirmation_token })).body.status).toBe("dry_run");
    expect(b.asked).toHaveLength(0);
  });

  it("writes the dialog text with plain links and the full message", () => {
    const text = confirmationMessage("send_connection_request", {
      action: "Send a connection request",
      profile_url: "https://www.linkedin.com/in/jane-doe/?trk=x",
      note: "Hi Jane, loved your talk on pricing. Would be great to connect and swap notes on usage-based billing sometime soon.",
    });
    expect(text).toMatch(/^Send this connection request on LinkedIn\?/);
    expect(text).toContain("Profile url: linkedin.com/in/jane-doe");
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toContain("Note:\nHi Jane, loved your talk");
  });
});

describe("session_status", () => {
  it("answers from saved state without opening the browser", async () => {
    const { ctx, browserCalls } = setup();
    const { call } = await connect(ctx);
    const r = await call("session_status");
    expect(browserCalls).toEqual([]);
    expect(r.body.checked_by).toBe("saved_state");
    expect(r.body.next_step).toMatch(/login/);
  });
});

describe("compactJson", () => {
  it("drops null and undefined fields but keeps false, zero and array entries", () => {
    expect(compactJson({ a: null, b: undefined, c: false, d: 0, e: [null, 1], f: { g: null, h: "x" } })).toBe('{"c":false,"d":0,"e":[null,1],"f":{"h":"x"}}');
  });
});
