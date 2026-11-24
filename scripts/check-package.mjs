#!/usr/bin/env node
// Installs the packed tarball into an empty folder, the way `npx` users get it,
// then talks to the installed binary over MCP stdio. Catches broken `files`,
// missing dependencies, a bad shebang or a server that fails to start.
//
//   npm run build && npm run check-package

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const work = mkdtempSync(join(tmpdir(), "linkedin-mcp-package-"));
const fail = (msg) => {
  console.error(`check-package: ${msg}`);
  process.exitCode = 1;
};

try {
  const [{ filename }] = JSON.parse(execFileSync(npm, ["pack", "--json", "--pack-destination", work], { cwd: root, encoding: "utf8", shell: process.platform === "win32" }));
  const app = join(work, "app");
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(app)})`]);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "check", private: true }));
  execFileSync(npm, ["install", "--no-audit", "--no-fund", join(work, filename)], { cwd: app, stdio: "inherit", shell: process.platform === "win32" });

  const bin = join(app, "node_modules", pkg.name, "dist", "cli.js");
  const version = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).trim();
  if (!version.includes(pkg.version)) fail(`--version printed "${version}", expected ${pkg.version}`);

  const home = join(work, "home");
  const transport = new StdioClientTransport({ command: process.execPath, args: [bin], env: { ...process.env, LINKEDIN_MCP_HOME: home }, stderr: "inherit" });
  const client = new Client({ name: "check-package", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length < 30) fail(`only ${tools.length} tools listed`);
  const status = await client.callTool({ name: "session_status", arguments: {} });
  const body = JSON.parse(status.content[0].text);
  if (status.isError || body.checked_by !== "saved_state") fail(`session_status returned ${status.content[0].text}`);
  await client.close();
  if (!process.exitCode) console.log(`check-package: ${pkg.name}@${pkg.version} installs and serves ${tools.length} tools`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
