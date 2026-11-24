import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { createServer } from "../../src/server.js";
import { fakeClock, tempDir } from "./helpers.js";

async function setup(env: Record<string, string> = {}, answer?: (message: string, schema: Record<string, unknown>) => ElicitResult) {
  const config = loadConfig({ LINKEDIN_MCP_HOME: tempDir(), LINKEDIN_MCP_DRY_RUN: "true", ...env });
  const ctx = createContext(config, fakeClock(new Date(2026, 10, 24, 10, 0)).clock);
  ctx.session = { run: async () => Promise.reject(new Error("no browser in tests")), close: async () => undefined, isOpen: () => false } as unknown as BrowserSession;
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverT);
  const client = new Client({ name: "t", version: "0" }, answer ? { capabilities: { elicitation: { form: {} } } } : {});
  const dialogs: { message: string; schema: Record<string, unknown> }[] = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const schema = req.params.mode === "url" ? {} : (req.params.requestedSchema as Record<string, unknown>);
      dialogs.push({ message: req.params.message, schema });
      return answer(req.params.message, schema);
    });
  }
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: Boolean(r.isError), body: JSON.parse(r.content[0]!.text) as Record<string, any> };
  };
  const schedule = async (day: number, text: string) =>
    (await call("schedule_post", { text, publish_at: new Date(2026, 10, day, 9, 0).toISOString() })).body.confirmation_token as string;
  const waitDone = async (jobId: string) => {
    for (let i = 0; i < 50; i++) {
      const s = await call("batch_status", { job_id: jobId });
      if (s.body.state !== "running") return s.body;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("batch did not finish");
  };
  return { ctx, call, schedule, waitDone, dialogs, client };
}

describe("confirm_batch", () => {
  it("runs a planned week in the background and reports each item", async () => {
    const { call, schedule, waitDone } = await setup();
    const tokens = [await schedule(25, "Monday post"), await schedule(26, "Tuesday post"), await schedule(27, "Wednesday post")];
    const started = await call("confirm_batch", { confirmation_tokens: tokens });
    expect(started.body).toMatchObject({ state: "running", approved: 3, skipped: 0 });
    const done = await waitDone(started.body.job_id);
    expect(done.state).toBe("done");
    expect(done.totals.dry_run).toBe(3);
    // Every token is spent.
    expect((await call("confirm_action", { confirmation_token: tokens[0] })).body.error.code).toBe("CONFIRMATION_INVALID");
  });

  it("shows every preview in one dialog with an unticked box each, and sends only the ticked ones", async () => {
    const { call, schedule, waitDone, dialogs } = await setup({}, () => ({ action: "accept", content: { item_1: true, item_2: false, item_3: true } }));
    const tokens = [await schedule(25, "First idea"), await schedule(26, "Second idea"), await schedule(27, "Third idea")];
    const started = await call("confirm_batch", { confirmation_tokens: tokens });
    expect(started.body).toMatchObject({ approved: 2, skipped: 1, approved_in_client: true });
    const dialog = dialogs[0]!;
    for (const text of ["First idea", "Second idea", "Third idea"]) expect(dialog.message).toContain(text);
    const props = dialog.schema.properties as Record<string, { type: string; default: boolean; title: string }>;
    expect(Object.keys(props)).toEqual(["item_1", "item_2", "item_3"]);
    expect(Object.values(props).every((p) => p.type === "boolean" && p.default === false)).toBe(true);
    const done = await waitDone(started.body.job_id);
    expect(done.items.map((i: { status: string }) => i.status)).toEqual(["dry_run", "skipped", "dry_run"]);
  });

  it("sends nothing when the user declines or ticks nothing", async () => {
    for (const answer of [{ action: "decline" }, { action: "accept", content: {} }] as ElicitResult[]) {
      const { call, schedule } = await setup({}, () => answer);
      const tokens = [await schedule(25, "A"), await schedule(26, "B")];
      const r = await call("confirm_batch", { confirmation_tokens: tokens });
      expect(r.body.error.code).toBe("USER_DECLINED");
      expect((await call("confirm_action", { confirmation_token: tokens[1] })).body.error.code).toBe("CONFIRMATION_INVALID");
    }
  });

  it("refuses messages and connection requests without spending any token", async () => {
    const { call, schedule } = await setup();
    const post = await schedule(25, "A post");
    const invite = (await call("send_connection_request", { profile: "https://www.linkedin.com/in/jane-doe/" })).body.confirmation_token as string;
    const r = await call("confirm_batch", { confirmation_tokens: [post, invite] });
    expect(r.body.error.code).toBe("INVALID_INPUT");
    expect(r.body.error.message).toMatch(/send_connection_request/);
    // Both tokens still work one at a time.
    expect((await call("confirm_action", { confirmation_token: post })).body.status).toBe("dry_run");
    expect((await call("confirm_action", { confirmation_token: invite })).body.status).toBe("dry_run");
  });

  it("rejects duplicate tokens and is hidden in read-only mode", async () => {
    const { call, schedule } = await setup();
    const t = await schedule(25, "A");
    expect((await call("confirm_batch", { confirmation_tokens: [t, t] })).body.error.message).toMatch(/more than once/);
    const ro = await setup({ LINKEDIN_MCP_READ_ONLY: "true" });
    const names = (await ro.client.listTools()).tools.map((x) => x.name);
    expect(names).not.toContain("confirm_batch");
    expect(names).toContain("batch_status");
  });
});
