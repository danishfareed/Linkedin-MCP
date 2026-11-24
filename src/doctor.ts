import { existsSync } from "node:fs";
import { patchrightVersion } from "./browser/patchright.js";
import { readBrowserRecord } from "./browser/profile.js";
import { type BrowserInfo, hasSessionCookie } from "./browser/session.js";
import { type AppContext, VERSION, withBrowser } from "./context.js";
import { toMcpError } from "./errors.js";
import { compareVersions } from "./util/version.js";
import { checkComposer } from "./linkedin/pages/composer.js";
import { readFeedPosts } from "./linkedin/pages/feed.js";
import { listInvitations, readInbox, readNotifications, readProfileAnalytics } from "./linkedin/pages/lists.js";
import { readMyProfile } from "./linkedin/pages/profile.js";

export interface Check {
  name: string;
  ok: boolean;
  /** "warn" means it ran but found nothing, which can be normal (e.g. no invitations). */
  level: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

type Probe = { name: string; run: (ctx: AppContext) => Promise<{ level: Check["level"]; detail: string }> };

const LIVE_PROBES: Probe[] = [
  {
    name: "Your profile (/in/me)",
    run: async (ctx) => {
      const me = await withBrowser(ctx, (nav) => readMyProfile(nav, ["about"]));
      return me.name ? { level: "ok", detail: `Signed in as ${me.name}` } : { level: "fail", detail: "Profile loaded but the name was not found (profileTop selectors)." };
    },
  },
  {
    name: "Feed",
    run: async (ctx) => {
      const { posts, note } = await withBrowser(ctx, (nav) => readFeedPosts(nav, 3));
      const withText = posts.filter((p) => p.text).length;
      const withLink = posts.filter((p) => p.url).length;
      if (!posts.length) return { level: "fail", detail: note ?? "No posts found (feedPost selectors)." };
      const detail = `${posts.length} posts read, ${withText} with text, ${withLink} with a link.${note ? ` ${note}` : ""}`;
      return { level: withText && withLink ? "ok" : "warn", detail };
    },
  },
  {
    name: "Notifications",
    run: async (ctx) => {
      const n = await withBrowser(ctx, (nav) => readNotifications(nav, 3));
      return n.length ? { level: "ok", detail: `${n.length} notifications read.` } : { level: "warn", detail: "No notifications found. Normal for a quiet account; otherwise the notification selectors are broken." };
    },
  },
  {
    name: "Messaging inbox",
    run: async (ctx) => {
      const c = await withBrowser(ctx, (nav) => readInbox(nav, 3));
      return c.length ? { level: "ok", detail: `${c.length} conversations read.` } : { level: "warn", detail: "No conversations found. Normal for an empty inbox; otherwise the conversation selectors are broken." };
    },
  },
  {
    name: "Invitations",
    run: async (ctx) => {
      const i = await withBrowser(ctx, (nav) => listInvitations(nav, "received", 3));
      return { level: i.length ? "ok" : "warn", detail: i.length ? `${i.length} invitations read.` : "No pending invitations found (may be normal)." };
    },
  },
  {
    name: "Analytics dashboard",
    run: async (ctx) => {
      const a = await withBrowser(ctx, (nav) => readProfileAnalytics(nav));
      const found = Object.entries(a.metrics).filter(([, m]) => m.value !== null).map(([k]) => k);
      return { level: found.length >= 2 ? "ok" : "warn", detail: `Read: ${found.join(", ") || "nothing"}` };
    },
  },
  {
    name: "Post composer (opens and closes, types nothing)",
    run: async (ctx) => {
      const c = await withBrowser(ctx, (nav) => checkComposer(nav));
      return c.schedule_button ? { level: "ok", detail: "Editor and schedule button found." } : { level: "warn", detail: "Editor found, schedule button not found (schedule_post may fail)." };
    },
  },
];

const PACKAGE = "@danishfareed/linkedin-mcp";
const LATEST_URL = `https://registry.npmjs.org/${PACKAGE}/latest`;

/**
 * The newest published version, or null if npm can't be reached within 3 s.
 * A plain GET of public package metadata: nothing about the user is sent.
 */
export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(LATEST_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

/** Pure: the update check's result line. */
export function updateCheck(current: string, latest: string | null): Omit<Check, "name"> {
  if (!latest) return { ok: true, level: "skip", detail: "Couldn't reach the npm registry, so updates weren't checked." };
  if (compareVersions(latest, current) > 0) {
    return {
      ok: true,
      level: "warn",
      detail: `${latest} is available (you have ${current}). Point your AI client at \`npx ${PACKAGE}@latest\` (or run \`npm install -g ${PACKAGE}@latest\`), then restart it.`,
    };
  }
  return { ok: true, level: "ok", detail: `${current} is the latest release.` };
}

const CHANNEL_NAMES: Record<string, string> = { chrome: "Google Chrome", chromium: "Chromium", msedge: "Microsoft Edge", custom: "Custom browser" };

/** Pure: which browser is in use, and its version. */
export function describeBrowser(info: BrowserInfo | null, bundledBy: string | null): string {
  if (!info) return "Unknown (the browser did not report its version).";
  const name = CHANNEL_NAMES[info.channel] ?? info.channel;
  const extra = info.channel === "chromium" && bundledBy ? `, installed for patchright ${bundledBy}` : info.executablePath ? `, ${info.executablePath}` : "";
  return `${name} ${info.version ?? "(version unknown)"} (channel: ${info.channel}${extra})`;
}

/** Read-only health check. Uses about 8 page loads when signed in. */
export async function runDoctor(
  ctx: AppContext,
  opts: { live?: boolean; checkUpdates?: boolean; fetchLatest?: () => Promise<string | null>; onCheck?: (c: Check) => void } = {},
): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (c: Check) => {
    checks.push(c);
    opts.onCheck?.(c);
  };

  const [major] = process.versions.node.split(".").map(Number) as [number];
  add({ name: "Node.js 20 or newer", ok: major >= 20, level: major >= 20 ? "ok" : "fail", detail: `Running ${process.versions.node}` });

  if (opts.checkUpdates !== false) {
    add({ name: "linkedin-mcp version", ...updateCheck(VERSION, await (opts.fetchLatest ?? fetchLatestVersion)()) });
  }

  const profileExists = existsSync(ctx.config.paths.profile);
  add({ name: "Browser profile", ok: profileExists, level: profileExists ? "ok" : "warn", detail: profileExists ? ctx.config.paths.profile : "Not created yet. Run the login command." });

  let signedIn = false;
  try {
    signedIn = await ctx.session.run((nav) => hasSessionCookie(nav.page.context()), { quiet: true });
    const record = await readBrowserRecord(ctx.config.paths);
    add({
      name: "Browser starts",
      ok: true,
      level: "ok",
      detail: `${describeBrowser(ctx.session.browserInfo(), patchrightVersion())}${record ? `. Profile last opened by version ${record.version}.` : ""}`,
    });
  } catch (err) {
    const e = toMcpError(err);
    add({ name: "Browser starts", ok: false, level: "fail", detail: `${e.message} ${e.nextStep}` });
    return checks;
  }
  add({ name: "Signed in to LinkedIn", ok: signedIn, level: signedIn ? "ok" : "fail", detail: signedIn ? "Session cookie present." : "Not signed in. Run the login command." });

  const breaker = await ctx.breaker.state();
  add({
    name: "Automation not paused",
    ok: !breaker.open,
    level: breaker.open ? "fail" : "ok",
    detail: breaker.open ? `Paused (${breaker.reason}) since ${breaker.tripped_at}${breaker.until ? ` until ${breaker.until}` : ""}.` : "Running.",
  });

  if (opts.live === false || !signedIn || breaker.open) {
    for (const p of LIVE_PROBES) add({ name: p.name, ok: false, level: "skip", detail: !signedIn ? "Skipped: not signed in." : breaker.open ? "Skipped: automation is paused." : "Skipped." });
    return checks;
  }

  for (const probe of LIVE_PROBES) {
    try {
      const r = await probe.run(ctx);
      add({ name: probe.name, ok: r.level !== "fail", level: r.level, detail: r.detail });
    } catch (err) {
      const e = toMcpError(err);
      add({ name: probe.name, ok: false, level: "fail", detail: `${e.code}: ${e.message}` });
      if (["CHECKPOINT", "CIRCUIT_OPEN", "NOT_LOGGED_IN", "LIMIT_REACHED", "RATE_LIMITED", "NETWORK"].includes(e.code)) break;
    }
  }
  return checks;
}
