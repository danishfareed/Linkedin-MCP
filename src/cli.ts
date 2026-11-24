#!/usr/bin/env node
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ArgError, type CliArgs, HELP, parseArgs } from "./args.js";
import { interactiveLogin } from "./browser/login.js";
import { INSTALL_BROWSER_ARGS, patchrightCliPath, patchrightVersion } from "./browser/patchright.js";
import { browserRecordFile } from "./browser/profile.js";
import { hasSessionCookie } from "./browser/session.js";
import { loadConfig } from "./config.js";
import { type AppContext, VERSION, createContext } from "./context.js";
import { runDoctor } from "./doctor.js";
import { LinkedInMcpError, toMcpError } from "./errors.js";
import { serveHttp } from "./http.js";
import { createServer } from "./server.js";

function onShutdown(ctx: AppContext, extra?: () => Promise<void>): void {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await extra?.().catch(() => undefined);
    await ctx.session.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
}

async function serve(ctx: AppContext, args: CliArgs): Promise<void> {
  if (args.http) {
    const http = await serveHttp(ctx, args.port ?? ctx.config.http.port);
    console.error(`linkedin-mcp ${VERSION} listening on ${http.url}`);
    console.error(`Bearer token: ${http.token}`);
    console.error(`(stored in ${ctx.config.paths.httpTokenFile}; set LINKEDIN_MCP_HTTP_TOKEN to choose your own)`);
    onShutdown(ctx, http.close);
    return;
  }
  const server = createServer(ctx);
  const transport = new StdioServerTransport();
  onShutdown(ctx, () => server.close());
  // When the client goes away, stdin closes: shut the browser down with it.
  process.stdin.on("close", () => {
    void ctx.session.close().then(() => process.exit(0));
  });
  await server.connect(transport);
  console.error(`linkedin-mcp ${VERSION} running on stdio${ctx.config.dryRun ? " (dry run)" : ""}`);
}

async function status(ctx: AppContext, args: CliArgs): Promise<void> {
  const account = await ctx.account.get();
  const breaker = await ctx.breaker.state();
  const limits = await ctx.limits.status();
  let signedIn: string = "unknown (run with --verify to check)";
  if (args.verify) {
    signedIn = (await ctx.session.run((nav) => hasSessionCookie(nav.page.context()), { quiet: true })) ? "yes" : "no";
    await ctx.session.close();
  }
  console.log(`linkedin-mcp ${VERSION}`);
  console.log(`Data folder:   ${ctx.config.paths.home}`);
  console.log(`Account:       ${account.name ?? "(not signed in yet)"}${account.profile_url ? `  ${account.profile_url}` : ""}`);
  console.log(`Signed in:     ${signedIn}`);
  console.log(`Paused:        ${breaker.open ? `yes (${breaker.reason}) until ${breaker.until ?? "you resume"}` : "no"}`);
  console.log(`Warm-up:       ${limits.warmup.active ? `on, ends ${limits.warmup.ends_at ?? "14 days after first sign-in"}` : "finished"}`);
  console.log(`Dry run:       ${ctx.config.dryRun ? "on" : "off"}`);
  console.log(`Working hours: ${ctx.config.workingHours === "off" ? "off" : `${ctx.config.workingHours.start}-${ctx.config.workingHours.end}`}`);
  console.log("");
  console.log("Limit                              Today      Week");
  for (const a of limits.actions) {
    const today = `${a.used_today}/${a.daily_cap}`.padEnd(10);
    const week = a.weekly_cap === null ? "-" : `${a.used_this_week}/${a.weekly_cap}`;
    console.log(`${a.label.padEnd(34)} ${today} ${week}`);
  }
}

async function logout(ctx: AppContext, args: CliArgs): Promise<void> {
  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await rl.question(`This deletes the saved LinkedIn browser profile at ${ctx.config.paths.profile}.\nType "yes" to continue: `);
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }
  await rm(ctx.config.paths.profile, { recursive: true, force: true });
  await rm(browserRecordFile(ctx.config.paths), { force: true });
  await ctx.account.clear();
  console.log("Signed out: the browser profile was deleted. Limits history and the audit log were kept.");
}

async function doctor(ctx: AppContext, args: CliArgs): Promise<void> {
  console.log(`linkedin-mcp ${VERSION} doctor${args.offline ? " (offline)" : ""}\n`);
  const icon = { ok: "✓", warn: "!", fail: "✗", skip: "-" } as const;
  const checks = await runDoctor(ctx, {
    live: !args.offline,
    checkUpdates: !args.offline,
    onCheck: (c) => console.log(`${icon[c.level]} ${c.name}: ${c.detail}`),
  });
  await ctx.session.close();
  const failed = checks.filter((c) => c.level === "fail");
  console.log(failed.length ? `\n${failed.length} check(s) failed. See https://github.com/danishfareed/Linkedin-MCP#troubleshooting` : "\nAll checks passed.");
  process.exitCode = failed.length ? 1 : 0;
}

/**
 * Runs the CLI of the patchright copy linkedin-mcp depends on. `npx patchright
 * install` could fetch a different patchright release, which downloads a
 * Chromium build ours can't use.
 */
async function installBrowser(): Promise<void> {
  const cli = patchrightCliPath();
  console.log(`Downloading Chromium for patchright ${patchrightVersion() ?? ""}, the version linkedin-mcp ${VERSION} uses.`);
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...INSTALL_BROWSER_ARGS], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  });
  if (code !== 0) {
    throw new LinkedInMcpError(
      "BROWSER_UNAVAILABLE",
      `The Chromium download failed (exit code ${code}).`,
      "Check your internet connection and try again, or install Google Chrome (https://www.google.com/chrome/) instead.",
    );
  }
  console.log("Chromium is ready. linkedin-mcp uses it when Google Chrome isn't installed, or when LINKEDIN_MCP_BROWSER_CHANNEL=chromium.");
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ArgError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  }
  if (args.command === "help") return void console.log(HELP);
  if (args.command === "version") return void console.log(VERSION);
  // Needs no config, so a broken config.json can't block it.
  if (args.command === "install-browser") return installBrowser();

  const config = loadConfig();
  if (args.headed) config.headless = false;
  if (args.dryRun) config.dryRun = true;
  const ctx = createContext(config);

  switch (args.command) {
    case "serve":
      return serve(ctx, args);
    case "login": {
      const result = await interactiveLogin(ctx, { keepOpen: args.keepOpen });
      console.log(result.already_signed_in ? `Already signed in as ${result.name ?? "your account"}.` : `Signed in as ${result.name ?? "your account"}. You can now use linkedin-mcp from your AI assistant.`);
      return;
    }
    case "status":
      return status(ctx, args);
    case "doctor":
      return doctor(ctx, args);
    case "resume":
      await ctx.breaker.reset();
      await ctx.audit.record({ tool: "resume", target: null, text_hash: null, result: "resumed", detail: "cli" });
      console.log("Resumed. If LinkedIn showed a security check, make sure you resolved it first.");
      return;
    case "logout":
      return logout(ctx, args);
  }
}

main().catch((err: unknown) => {
  const e = err instanceof LinkedInMcpError ? err : toMcpError(err);
  console.error(`Error (${e.code}): ${e.message}`);
  console.error(e.nextStep);
  process.exit(1);
});
