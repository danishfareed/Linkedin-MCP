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
  apiTokenFile: string;
}

/**
 * Default data folder: ~/.config/linkedin-mcp (or $XDG_CONFIG_HOME/linkedin-mcp),
 * and %LOCALAPPDATA%\linkedin-mcp on Windows. Deliberately not ~/.linkedin-mcp,
 * which another LinkedIn MCP server uses and deletes on sign-out.
 */
export function defaultHome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return join(env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local"), "linkedin-mcp");
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "linkedin-mcp");
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.LINKEDIN_MCP_HOME?.trim() || defaultHome(env);
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
    apiTokenFile: join(state, "api-token.json"),
  };
}

/** How posts are published: the official API when connected (auto), always the API, or always the browser. */
export const POST_VIA = ["auto", "api", "browser"] as const;
export type PostVia = (typeof POST_VIA)[number];

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
    readOnly: z.boolean(),
    toolTimeoutSeconds: z.number().int().min(20).max(600),
    confirm: z.object({ reactions: z.boolean(), inClient: z.boolean() }).partial(),
    limits: limitOverrides,
    browser: z
      .object({
        channel: z.enum(["auto", "chrome", "chromium", "msedge"]),
        executablePath: z.string(),
        viewport: z.object({ width: z.number().int().min(800), height: z.number().int().min(600) }),
      })
      .partial(),
    http: z.object({ port: z.number().int().min(1).max(65535), token: z.string().min(16) }).partial(),
    api: z
      .object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        redirectPort: z.number().int().min(1024).max(65535),
        version: z.string().regex(/^\d{6}$/, "Use YYYYMM, for example 202609"),
      })
      .partial(),
    postVia: z.enum(POST_VIA),
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
  /** Ask the user directly through the MCP client (form elicitation) when it supports that. */
  confirmInClient: boolean;
  /** Hide every tool that sends something to LinkedIn. */
  readOnly: boolean;
  /** Budget for one tool call, kept under common client timeouts (60 s). */
  toolTimeoutMs: number;
  limits: LimitOverrides;
  browser: {
    channel: "auto" | "chrome" | "chromium" | "msedge";
    executablePath: string | undefined;
    viewport: { width: number; height: number };
  };
  http: { port: number; token: string | undefined };
  /** Your own LinkedIn developer app, for posting through the official API. */
  api: { clientId: string | undefined; clientSecret: string | undefined; redirectPort: number; version: string | undefined };
  postVia: PostVia;
}

export const DEFAULT_WORKING_HOURS = { start: "08:00", end: "21:00" } as const;

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

/** Like parseBool, but a typo must not silently turn a safety switch off. */
function parseStrictBool(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = parseBool(value);
  if (parsed === undefined) throw invalidInput(`${name} must be true or false, got "${value}"`);
  return parsed;
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

/** Env vars win over config.json in the data folder, which wins over defaults. */
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
    confirmInClient: parseStrictBool("LINKEDIN_MCP_CONFIRM_IN_CLIENT", env.LINKEDIN_MCP_CONFIRM_IN_CLIENT) ?? file.confirm?.inClient ?? true,
    readOnly: parseStrictBool("LINKEDIN_MCP_READ_ONLY", env.LINKEDIN_MCP_READ_ONLY) ?? file.readOnly ?? false,
    toolTimeoutMs: Math.min(600, Math.max(20, parseNumber(env.LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS) ?? file.toolTimeoutSeconds ?? 55)) * 1000,
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
    api: {
      clientId: env.LINKEDIN_MCP_CLIENT_ID?.trim() || file.api?.clientId,
      clientSecret: env.LINKEDIN_MCP_CLIENT_SECRET?.trim() || file.api?.clientSecret,
      redirectPort: parseNumber(env.LINKEDIN_MCP_API_REDIRECT_PORT) ?? file.api?.redirectPort ?? 8765,
      version: env.LINKEDIN_MCP_API_VERSION?.trim() || file.api?.version,
    },
    postVia: parsePostVia(env.LINKEDIN_MCP_POST_VIA) ?? file.postVia ?? "auto",
  };
}

function parsePostVia(value: string | undefined): PostVia | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if ((POST_VIA as readonly string[]).includes(v)) return v as PostVia;
  throw invalidInput(`LINKEDIN_MCP_POST_VIA must be auto, api or browser, got "${value}"`);
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
