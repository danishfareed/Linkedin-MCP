import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { invalidInput } from "./errors.js";
import { updateJson } from "./state/store.js";

export interface Paths {
  home: string;
  profile: string;
  state: string;
  configFile: string;
  limitsFile: string;
  breakerFile: string;
  accountFile: string;
  auditFile: string;
  httpTokenFile: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.LINKEDIN_MCP_HOME?.trim() || join(homedir(), ".linkedin-mcp");
  const state = join(home, "state");
  return {
    home,
    profile: join(home, "profile"),
    state,
    configFile: join(home, "config.json"),
    limitsFile: join(state, "limits.json"),
    breakerFile: join(state, "breaker.json"),
    accountFile: join(state, "account.json"),
    auditFile: join(state, "audit.jsonl"),
    httpTokenFile: join(home, "http-token"),
  };
}

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM, for example 08:00");

const limitOverrides = z
  .object({
    post: z.number().int().min(0),
    comment: z.number().int().min(0),
    reaction: z.number().int().min(0),
    connection: z.number().int().min(0),
    message: z.number().int().min(0),
    profile_view: z.number().int().min(0),
    search: z.number().int().min(0),
    page_load: z.number().int().min(0),
  })
  .partial();

export const fileConfigSchema = z
  .object({
    headless: z.boolean(),
    dryRun: z.boolean(),
    idleTimeoutMinutes: z.number().positive().max(24 * 60),
    workingHours: z.union([
      z.literal("off"),
      z.object({ start: timeOfDay, end: timeOfDay }),
    ]),
    confirm: z.object({ reactions: z.boolean() }).partial(),
    limits: limitOverrides,
    browser: z
      .object({
        channel: z.enum(["auto", "chrome", "chromium", "msedge"]),
        executablePath: z.string(),
        viewport: z.object({ width: z.number().int().min(800), height: z.number().int().min(600) }),
      })
      .partial(),
    http: z.object({ port: z.number().int().min(1).max(65535), token: z.string().min(16) }).partial(),
  })
  .partial();

export type FileConfig = z.infer<typeof fileConfigSchema>;
export type LimitOverrides = z.infer<typeof limitOverrides>;

export interface Config {
  paths: Paths;
  headless: boolean;
  dryRun: boolean;
  idleTimeoutMs: number;
  workingHours: { start: string; end: string } | "off";
  confirmReactions: boolean;
  limits: LimitOverrides;
  browser: {
    channel: "auto" | "chrome" | "chromium" | "msedge";
    executablePath: string | undefined;
    viewport: { width: number; height: number };
  };
  http: { port: number; token: string | undefined };
}

export const DEFAULT_WORKING_HOURS = { start: "08:00", end: "21:00" } as const;

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseWorkingHours(value: string): Config["workingHours"] {
  const v = value.trim().toLowerCase();
  if (v === "off" || v === "none" || v === "any") return "off";
  const match = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(v);
  if (!match) throw invalidInput(`LINKEDIN_MCP_WORKING_HOURS must look like "08:00-21:00" or "off", got "${value}"`);
  const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
  const parsed = z.object({ start: timeOfDay, end: timeOfDay }).safeParse({ start: pad(match[1]!), end: pad(match[2]!) });
  if (!parsed.success) throw invalidInput(`Invalid working hours "${value}"`);
  return parsed.data;
}

export function readFileConfig(paths: Paths): FileConfig {
  let raw: string;
  try {
    raw = readFileSync(paths.configFile, "utf8");
  } catch {
    return {};
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw invalidInput(`${paths.configFile} is not valid JSON.`);
  }
  const parsed = fileConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw invalidInput(`${paths.configFile} has invalid settings: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** Env vars win over ~/.linkedin-mcp/config.json, which wins over defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const paths = resolvePaths(env);
  const file = readFileConfig(paths);

  const envHours = env.LINKEDIN_MCP_WORKING_HOURS;
  const channel = env.LINKEDIN_MCP_BROWSER_CHANNEL?.trim().toLowerCase();
  if (channel && !["auto", "chrome", "chromium", "msedge"].includes(channel)) {
    throw invalidInput(`LINKEDIN_MCP_BROWSER_CHANNEL must be auto, chrome, chromium or msedge, got "${channel}"`);
  }

  const idleMinutes = parseNumber(env.LINKEDIN_MCP_IDLE_TIMEOUT_MINUTES) ?? file.idleTimeoutMinutes ?? 10;

  return {
    paths,
    headless: parseBool(env.LINKEDIN_MCP_HEADLESS) ?? file.headless ?? true,
    dryRun: parseBool(env.LINKEDIN_MCP_DRY_RUN) ?? file.dryRun ?? false,
    idleTimeoutMs: Math.max(1, idleMinutes) * 60_000,
    workingHours: envHours ? parseWorkingHours(envHours) : (file.workingHours ?? { ...DEFAULT_WORKING_HOURS }),
    confirmReactions: parseBool(env.LINKEDIN_MCP_CONFIRM_REACTIONS) ?? file.confirm?.reactions ?? true,
    limits: file.limits ?? {},
    browser: {
      channel: (channel as Config["browser"]["channel"] | undefined) ?? file.browser?.channel ?? "auto",
      executablePath: env.LINKEDIN_MCP_CHROME_PATH?.trim() || file.browser?.executablePath,
      viewport: file.browser?.viewport ?? { width: 1440, height: 900 },
    },
    http: {
      port: parseNumber(env.LINKEDIN_MCP_PORT) ?? file.http?.port ?? 3333,
      token: env.LINKEDIN_MCP_HTTP_TOKEN?.trim() || file.http?.token,
    },
  };
}

/** Merge a patch into config.json (used by set_limits). */
export async function patchFileConfig(paths: Paths, mutate: (current: FileConfig) => FileConfig): Promise<FileConfig> {
  return updateJson<FileConfig>(paths.configFile, {}, (current) => {
    const parsed = fileConfigSchema.safeParse(current);
    if (!parsed.success) {
      throw invalidInput(`${paths.configFile} has invalid settings. Fix or delete it, then try again.`);
    }
    return fileConfigSchema.parse(mutate(parsed.data));
  });
}
