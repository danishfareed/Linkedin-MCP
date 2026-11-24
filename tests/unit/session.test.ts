import { EventEmitter } from "node:events";
import type { BrowserContext, Page } from "patchright";
import { describe, expect, it } from "vitest";
import { Deadline } from "../../src/browser/deadline.js";
import { Pacer } from "../../src/browser/human.js";
import { BrowserSession, type LaunchedBrowser, Nav, type SessionDeps, launchAttempts } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { tempDir } from "./helpers.js";

interface Signals {
  title: string;
  text: string;
  hasGlobalNav: boolean;
  rememberMe: boolean;
}

const FEED: Signals = { title: "Feed | LinkedIn", text: "Home My Network", hasGlobalNav: true, rememberMe: false };

type Goto = (url: string, page: FakePage) => Promise<unknown>;

/** Just enough of a patchright Page for Nav and BrowserSession. */
class FakePage extends EventEmitter {
  current = "about:blank";
  closed = false;
  signals: Signals = FEED;
  readonly frame = {};
  gotoTimeouts: number[] = [];

  constructor(
    private readonly ctx: FakeContext,
    public onGoto: Goto = async (url) => ok(url),
  ) {
    super();
  }

  url() {
    return this.current;
  }
  isClosed() {
    return this.closed;
  }
  mainFrame() {
    return this.frame;
  }
  context() {
    return this.ctx;
  }
  setDefaultTimeout() {}
  async goto(url: string, opts: { timeout: number }) {
    this.gotoTimeouts.push(opts.timeout);
    this.current = url;
    return this.onGoto(url, this);
  }
  async evaluate() {
    return this.signals;
  }
  async waitForSelector() {
    return null;
  }

  /** Simulates a main-frame document response arriving (as a click navigation would). */
  respond(status: number, url: string, headers: Record<string, string> = {}) {
    const res = response(status, url, headers, this.frame);
    this.current = url;
    this.emit("response", res);
    return res;
  }
}

class FakeBrowser extends EventEmitter {
  connected = true;
  version() {
    return "158.0.8127.37";
  }
  isConnected() {
    return this.connected;
  }
}

class FakeContext extends EventEmitter {
  readonly browserObj = new FakeBrowser();
  readonly created: FakePage[] = [];
  closed = 0;
  onGoto: Goto | undefined;

  pages() {
    return this.created.filter((p) => !p.closed);
  }
  async newPage() {
    const page = new FakePage(this, this.onGoto);
    this.created.push(page);
    return page;
  }
  async cookies() {
    return [{ name: "li_at", value: "x", expires: -1 }];
  }
  browser() {
    return this.browserObj;
  }
  async close() {
    this.closed++;
    for (const p of this.created) p.closed = true;
    this.emit("close");
  }
}

function response(status: number, url: string, headers: Record<string, string> = {}, frame: object = {}) {
  return {
    status: () => status,
    url: () => url,
    headers: () => headers,
    request: () => ({ resourceType: () => "document", frame: () => frame }),
  };
}

const ok = (url: string) => response(200, url);

function setup(opts: { toolTimeoutSeconds?: number } = {}) {
  const config = loadConfig({ LINKEDIN_MCP_HOME: tempDir(), LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS: String(opts.toolTimeoutSeconds ?? 55) });
  const app = createContext(config);
  const deps: SessionDeps = { config, breaker: app.breaker, limits: app.limits, audit: app.audit, pacer: new Pacer(async () => undefined) };
  const contexts: FakeContext[] = [];
  const launch = async (): Promise<LaunchedBrowser> => {
    const ctx = new FakeContext();
    contexts.push(ctx);
    return { context: ctx as unknown as BrowserContext, channel: "chromium", version: "158.0.8127.37" };
  };
  const session = new BrowserSession(deps, launch);
  return { config, app, deps, session, contexts };
}

function navFor(deps: SessionDeps, onGoto?: Goto, deadline?: Deadline) {
  const page = new FakePage(new FakeContext(), onGoto);
  return { page, nav: new Nav(page as unknown as Page, deps, deadline) };
}

describe("launchAttempts", () => {
  it("falls back to full Chromium by channel, never the headless shell", () => {
    const base = loadConfig({ LINKEDIN_MCP_HOME: tempDir() });
    expect(launchAttempts({ ...base, browser: { ...base.browser, channel: "auto" } })).toEqual([{ channel: "chrome" }, { channel: "chromium" }]);
    expect(launchAttempts({ ...base, browser: { ...base.browser, channel: "chromium" } })).toEqual([{ channel: "chromium" }]);
    expect(launchAttempts({ ...base, browser: { ...base.browser, channel: "msedge" } })).toEqual([{ channel: "msedge" }]);
    expect(launchAttempts({ ...base, browser: { ...base.browser, executablePath: "/opt/chrome" } })).toEqual([{ channel: "custom", executablePath: "/opt/chrome" }]);
    for (const a of launchAttempts(base)) expect(a.channel || a.executablePath).toBeTruthy();
  });
});

describe("Nav rate limiting", () => {
  it("trips the breaker and throws RATE_LIMITED on LinkedIn's 999", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async (url) => response(999, url));
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retry_after_seconds: 4 * 3600 } });
    const state = await app.breaker.state();
    expect(state).toMatchObject({ open: true, reason: "rate_limited", note: "HTTP 999" });
    const audit = await app.audit.recent(5);
    expect(audit[0]).toMatchObject({ result: "guard_tripped", detail: "rate_limited (HTTP 999)" });
  });

  it("uses Retry-After on a 429", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async (url) => response(429, url, { "retry-after": "900" }));
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retry_after_seconds: 900 } });
    const state = await app.breaker.state();
    expect(new Date(state.until!).getTime() - new Date(state.tripped_at!).getTime()).toBe(900_000);
  });

  it("treats a redirect loop as throttling", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async () => {
      throw new Error("page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.linkedin.com/feed/");
    });
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "RATE_LIMITED", details: { cause: "redirect loop" } });
    expect((await app.breaker.state()).reason).toBe("rate_limited");
  });

  it("keeps checkpoints separate from rate limits", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async (url, page) => {
      page.current = "https://www.linkedin.com/checkpoint/challenge/abc";
      page.signals = { ...FEED, hasGlobalNav: false, title: "Security Verification" };
      return ok(url);
    });
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "CHECKPOINT" });
    expect((await app.breaker.state()).reason).toBe("captcha");
  });

  it("catches throttling on a navigation started by a click when the page runs the guard", async () => {
    const { app, session, contexts } = setup();
    await expect(
      session.run(async (nav) => {
        (nav.page as unknown as FakePage).respond(999, "https://www.linkedin.com/feed/update/urn:li:activity:1/");
        await nav.guard();
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect((await app.breaker.state()).reason).toBe("rate_limited");
    expect(contexts).toHaveLength(1);
  });

  it("treats a throttling status from another site as a network problem, not LinkedIn throttling", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async (_url, page) => {
      page.current = "http://proxy.example/blocked";
      page.signals = { title: "Too many requests", text: "", hasGlobalNav: false, rememberMe: false };
      return response(429, page.current);
    });
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "NETWORK" });
    expect((await app.breaker.state()).open).toBe(false);
  });
});

describe("Nav guard", () => {
  it("raises NETWORK for an offsite page without pausing or closing anything", async () => {
    const { app, session, contexts } = setup();
    await expect(
      session.run(async (nav) => {
        const page = nav.page as unknown as FakePage;
        page.onGoto = async (url, p) => {
          p.current = "http://wifi.hotel.example/portal";
          p.signals = { title: "Hotel Wi-Fi", text: "Accept the terms", hasGlobalNav: false, rememberMe: false };
          return ok(url);
        };
        await nav.goto("https://www.linkedin.com/feed/");
      }),
    ).rejects.toMatchObject({ code: "NETWORK", details: { cause: "offsite" } });
    expect((await app.breaker.state()).open).toBe(false);
    expect(contexts[0]!.closed).toBe(0);
    expect(session.isOpen()).toBe(true);
  });

  it("pauses on the account picker as a login wall", async () => {
    const { deps, app } = setup();
    const { nav } = navFor(deps, async (url, page) => {
      page.signals = { title: "LinkedIn", text: "Welcome back", hasGlobalNav: false, rememberMe: true };
      return ok(url);
    });
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "NOT_LOGGED_IN" });
    expect((await app.breaker.state()).reason).toBe("login_wall");
  });
});

describe("Nav deadline", () => {
  it("refuses to navigate once the budget is gone", async () => {
    const { deps } = setup();
    let now = 0;
    const deadline = new Deadline(1000, () => now);
    const { nav, page } = navFor(deps, undefined, deadline);
    now = 1000;
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "navigation" } });
    expect(page.gotoTimeouts).toHaveLength(0);
  });

  it("caps the page-load timeout to what is left of the budget", async () => {
    const { deps } = setup();
    let now = 0;
    const deadline = new Deadline(55_000, () => now);
    now = 45_000;
    const { nav, page } = navFor(deps, async (url, p) => {
      p.current = url;
      return ok(url);
    }, deadline);
    await nav.goto("https://www.linkedin.com/feed/");
    expect(page.gotoTimeouts[0]).toBe(10_000);
  });

  it("turns a page-load timeout at the end of the budget into a deadline TIMEOUT", async () => {
    const { deps } = setup();
    let now = 0;
    const deadline = new Deadline(10_000, () => now);
    const { nav } = navFor(deps, async () => {
      now = 10_000;
      const err = new Error("page.goto: Timeout 10000ms exceeded.");
      err.name = "TimeoutError";
      throw err;
    }, deadline);
    await expect(nav.goto("https://www.linkedin.com/feed/")).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "navigation" } });
  });

  it("exposes the deadline to page code through nav.deadline", async () => {
    const { session, config } = setup({ toolTimeoutSeconds: 30 });
    const remaining = await session.run(async (nav) => nav.deadline.remainingMs(), { quiet: true });
    expect(remaining).toBeGreaterThan(29_000);
    expect(remaining).toBeLessThanOrEqual(config.toolTimeoutMs);
  });

  it("counts time spent queued behind another call", async () => {
    const { session } = setup({ toolTimeoutSeconds: 20 });
    const realNow = Date.now;
    let shift = 0;
    Date.now = () => realNow() + shift;
    try {
      const first = session.run(async () => {
        shift = 25_000; // the first call runs long
      }, { quiet: true });
      const second = session.run(async () => "ran", { quiet: true });
      await first;
      await expect(second).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "queue" } });
    } finally {
      Date.now = realNow;
    }
  });
});

describe("BrowserSession crash recovery", () => {
  it("closes the browser when the tab crashes, reports it, and relaunches on the next call", async () => {
    const { session, contexts } = setup();
    await expect(
      session.run(async (nav) => {
        const page = nav.page as unknown as FakePage;
        page.emit("crash", page);
        throw new Error("Target crashed");
      }, { quiet: true }),
    ).rejects.toMatchObject({ code: "BROWSER_UNAVAILABLE", details: { reason: "crash" } });
    expect(contexts[0]!.closed).toBe(1);
    expect(session.isOpen()).toBe(false);

    await expect(session.run(async () => "ok", { quiet: true })).resolves.toBe("ok");
    expect(contexts).toHaveLength(2);
  });

  it("relaunches after the browser dies between calls", async () => {
    const { session, contexts } = setup();
    await session.run(async () => undefined, { quiet: true });
    contexts[0]!.browserObj.connected = false;
    contexts[0]!.browserObj.emit("disconnected");
    expect(session.isOpen()).toBe(false);
    await session.run(async () => undefined, { quiet: true });
    expect(contexts).toHaveLength(2);
  });

  it("reports a browser that disappears mid-call", async () => {
    const { session, contexts } = setup();
    await expect(
      session.run(async () => {
        contexts[0]!.browserObj.connected = false;
        contexts[0]!.browserObj.emit("disconnected");
        throw new Error("Target page, context or browser has been closed");
      }, { quiet: true }),
    ).rejects.toMatchObject({ code: "BROWSER_UNAVAILABLE", details: { reason: "disconnected" } });
  });

  it("does not report its own close() as a lost browser", async () => {
    const { session } = setup();
    await session.run(async () => undefined, { quiet: true });
    await session.close();
    await expect(session.run(async () => "fine", { quiet: true })).resolves.toBe("fine");
  });

  it("remembers which browser it started", async () => {
    const { session } = setup();
    expect(session.browserInfo()).toBeNull();
    await session.run(async () => undefined, { quiet: true });
    expect(session.browserInfo()).toEqual({ channel: "chromium", version: "158.0.8127.37" });
  });
});
