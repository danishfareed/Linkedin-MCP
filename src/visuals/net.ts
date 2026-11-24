import { promises as dns } from "node:dns";
import { isIP, isIPv4 } from "node:net";
import { LinkedInMcpError } from "../errors.js";
import type { LookupFn, ProviderDeps } from "./types.js";

/**
 * HTTP for image providers: per-request timeouts on top of the overall
 * generation deadline, capped response sizes, provider errors mapped to
 * LinkedInMcpError, secrets scrubbed from anything a provider echoes back,
 * and downloads that can only reach public hosts the provider serves from.
 */

const MB = 1024 * 1024;

/** How a provider is named and set up, for error messages. */
export interface ProviderContext {
  label: string;
  /** For example "OPENAI_API_KEY". */
  envHint: string;
  /** Where to add credit or check access. */
  billingUrl: string;
  /** Values that must never appear in an error message (the API key). */
  secrets: string[];
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

class RequestTimeout extends Error {
  constructor() {
    super("request timed out");
    this.name = "RequestTimeout";
  }
}

/** A signal that aborts when the parent does or after `ms`. Call dispose when done so listeners don't pile up. */
function scopedSignal(parent: AbortSignal, ms: number): { signal: AbortSignal; dispose: () => void } {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(parent.reason);
  if (parent.aborted) ctrl.abort(parent.reason);
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(new RequestTimeout()), ms);
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

// ---- keeping secrets out of messages ----

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out;
}

/**
 * A provider-supplied string made safe for an error message: secrets
 * redacted, control characters removed, cut to `max` characters, and the
 * start of a secret left dangling at the cut masked as well.
 */
export function clean(text: unknown, secrets: string[], max = 200): string {
  let out = [...redact(String(text ?? ""), secrets)]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const cut = out.length > max;
  if (cut) out = out.slice(0, max - 3);
  for (const s of secrets) {
    if (!s || s.length < 4) continue;
    for (let n = Math.min(s.length - 1, out.length); n >= 4; n--) {
      if (out.endsWith(s.slice(0, n))) {
        out = `${out.slice(0, -n)}[redacted]`;
        break;
      }
    }
  }
  return cut ? `${out}...` : out;
}

/** The human part of a provider's error body, whatever its shape. Redact the body before calling this. */
export function errorDetail(body: string): string {
  let text = body.trim();
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const pick = (v: unknown): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v.map((x) => pick(x) ?? "").filter(Boolean).join("; ") || undefined;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return pick(o.message) ?? pick(o.msg) ?? pick(o.detail) ?? pick(o.error);
      }
      return undefined;
    };
    text = pick(json.error) ?? pick(json.detail) ?? pick(json.message) ?? pick(json.title) ?? text;
  } catch {
    // not JSON: keep the text
  }
  return text;
}

// ---- errors ----

/** Map an HTTP failure from a provider to an error the assistant can act on. */
export function providerHttpError(ctx: ProviderContext, status: number, body: string, retryAfter: string | null): LinkedInMcpError {
  // Redact the raw body, then again after JSON parsing has undone any escaping, then cut.
  const detail = clean(errorDetail(redact(body, ctx.secrets)), ctx.secrets, 300);
  const said = detail ? ` It said: ${detail}` : "";
  const details = { provider: ctx.label, status };
  if (status === 401) {
    return new LinkedInMcpError("INVALID_INPUT", `${ctx.label} rejected the API key.${said}`, `Check ${ctx.envHint} in the MCP server's environment, then restart the MCP client.`, details);
  }
  if (status === 402 || status === 403) {
    return new LinkedInMcpError(
      "INVALID_INPUT",
      `${ctx.label} refused the request: the account has no credit left, hit a spending limit, or can't use this model.${said}`,
      `Check the account at ${ctx.billingUrl}, or choose another model or provider.`,
      details,
    );
  }
  if (status === 404) {
    return new LinkedInMcpError("INVALID_INPUT", `${ctx.label} doesn't know this model, or the account can't see it.${said}`, "Check the model name, or leave model out to use the default.", details);
  }
  if (status === 429) {
    const seconds = Number(retryAfter);
    const wait = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
    return new LinkedInMcpError("RATE_LIMITED", `${ctx.label} is limiting requests from this account.${said}`, `Wait about ${wait} seconds before generating again.`, { ...details, retry_after_seconds: wait });
  }
  if (status >= 500) {
    return new LinkedInMcpError("NETWORK", `${ctx.label} had a problem on its side (HTTP ${status}).${said}`, "Try again in a minute, or use another provider.", details);
  }
  return new LinkedInMcpError("INVALID_INPUT", `${ctx.label} rejected the request (HTTP ${status}).${said}`, "Change the prompt or options and try again. A safety rejection means rephrasing the prompt.", details);
}

export function blocked(ctx: ProviderContext, why?: unknown): LinkedInMcpError {
  const reason = why ? clean(why, ctx.secrets, 160) : "";
  return new LinkedInMcpError(
    "INVALID_INPUT",
    `${ctx.label}'s safety filter blocked this image${reason ? ` (${reason})` : ""}.`,
    "Rephrase the prompt, avoiding real people, brands and anything sensitive, then try again.",
    { provider: ctx.label },
  );
}

/** The provider gave up on the generation. `why` is provider text and is cleaned here. */
export function generationFailed(ctx: ProviderContext, why?: unknown, extra?: Record<string, unknown>): LinkedInMcpError {
  const reason = why ? clean(why, ctx.secrets, 200) : "";
  return new LinkedInMcpError("NETWORK", `${ctx.label} couldn't generate the image${reason ? `: ${reason}` : ""}.`, "Try again, or change the prompt or model.", { provider: ctx.label, ...extra });
}

export function unexpected(ctx: ProviderContext, what: unknown): LinkedInMcpError {
  return new LinkedInMcpError(
    "INTERNAL",
    `${ctx.label} sent a response linkedin-mcp doesn't understand (${clean(what, ctx.secrets, 120)}).`,
    "Try again. If it keeps happening, the provider's API may have changed: open an issue at https://github.com/danishfareed/Linkedin-MCP/issues",
    { provider: ctx.label },
  );
}

function transportError(ctx: ProviderContext, err: unknown, parent: AbortSignal, timeoutMs: number): LinkedInMcpError {
  if (parent.aborted) {
    return new LinkedInMcpError("TIMEOUT", `${ctx.label} didn't finish in time.`, "Try again with a simpler prompt or fewer images, or raise images.timeoutSeconds in config.json.", { provider: ctx.label });
  }
  if (err instanceof RequestTimeout || (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError") && err.cause instanceof RequestTimeout)) {
    return new LinkedInMcpError("TIMEOUT", `${ctx.label} didn't answer within ${Math.round(timeoutMs / 1000)} seconds.`, "Try again in a minute.", { provider: ctx.label });
  }
  const cause = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  return new LinkedInMcpError("NETWORK", `Couldn't reach ${ctx.label}.`, "Check your internet connection and try again.", { provider: ctx.label, cause: clean(cause.split("\n")[0], ctx.secrets, 160) });
}

async function readCapped(res: Response, maxBytes: number, onTooBig: () => LinkedInMcpError): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw onTooBig();
  }
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw onTooBig();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// ---- provider API calls ----

export interface JsonCall {
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: string | FormData;
  /** Per-request timeout, inside the overall deadline. Default 120 s. */
  timeoutMs?: number;
  /** Largest response accepted. Default 2 MB; base64 image responses need more. */
  maxBytes?: number;
  /** Provider-specific mapping of an error response (for example a moderation block); undefined falls back to the generic one. */
  onError?: (status: number, body: string) => LinkedInMcpError | undefined;
}

export interface JsonResponse {
  status: number;
  headers: Headers;
  json: unknown;
}

/**
 * Call a provider's API. Redirects are refused, so credentials in headers
 * can never be forwarded to another host. Non-2xx responses throw.
 */
export async function callJson(ctx: ProviderContext, deps: ProviderDeps, url: string, call: JsonCall): Promise<JsonResponse> {
  const timeoutMs = call.timeoutMs ?? 120_000;
  const scoped = scopedSignal(deps.signal, timeoutMs);
  try {
    let res: Response;
    try {
      res = await deps.fetch(url, { method: call.method ?? (call.body === undefined ? "GET" : "POST"), headers: call.headers, body: call.body, redirect: "error", signal: scoped.signal });
    } catch (err) {
      throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
    }
    let raw: Buffer;
    try {
      raw = await readCapped(res, call.maxBytes ?? 2 * MB, () => unexpected(ctx, "response too large"));
    } catch (err) {
      if (err instanceof LinkedInMcpError) throw err;
      throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
    }
    const text = raw.toString("utf8");
    if (!res.ok) throw call.onError?.(res.status, text) ?? providerHttpError(ctx, res.status, text, res.headers.get("retry-after"));
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw unexpected(ctx, "not JSON");
    }
    return { status: res.status, headers: res.headers, json };
  } finally {
    scoped.dispose();
  }
}

// ---- downloads ----

/** Largest generated file we keep. LinkedIn takes images up to 10 MB. */
export const MAX_DOWNLOAD_BYTES = 20 * MB;

const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export const systemLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

function ipv4Parts(ip: string): [number, number, number, number] {
  return ip.split(".").map(Number) as [number, number, number, number];
}

function privateIPv4(ip: string): boolean {
  const [a, b, c, d] = ipv4Parts(ip);
  return (
    a === 0 || // 0.0.0.0/8, "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10, including Alibaba's metadata 100.100.100.200
    (a === 169 && b === 254) || // link-local, cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 168 && b === 63 && c === 129 && d === 16) || // Azure host metadata
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expand an IPv6 address to 8 numeric groups. */
function ipv6Groups(ip: string): number[] {
  let addr = ip.toLowerCase().split("%")[0]!;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = ipv4Parts(v4[1]!);
    addr = `${addr.slice(0, -v4[1]!.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0");
  return [...h, ...fill, ...t].map((g) => Number.parseInt(g || "0", 16));
}

/** True for addresses a download must never reach: loopback, private, link-local, CGNAT, unspecified, metadata. */
export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) return privateIPv4(ip);
  if (isIP(ip) !== 6) return true;
  const g = ipv6Groups(ip);
  if (g.length !== 8) return true;
  const embedded = () => `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return privateIPv4(embedded()); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateIPv4(embedded()); // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7 (AWS metadata fd00:ec2::254)
  if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0) return true; // link-local, old site-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  return false;
}

function refused(ctx: ProviderContext, host: string, why: string): LinkedInMcpError {
  return new LinkedInMcpError(
    "NETWORK",
    `Refused to download the image ${ctx.label} made from ${clean(host, ctx.secrets, 100)}: ${why}.`,
    "linkedin-mcp only downloads generated images over public https from the provider's own file hosts. Try again; if it keeps happening, open an issue at https://github.com/danishfareed/Linkedin-MCP/issues",
    { provider: ctx.label },
  );
}

/** The host is one of `allow` or a subdomain of one. */
export function hostAllowed(host: string, allow: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allow.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Check one URL before fetching it: https on the default port, no
 * credentials, a host name (not an IP literal or local name) on the
 * provider's list, and every address it resolves to public.
 */
async function assertSafeUrl(ctx: ProviderContext, url: URL, allowHosts: readonly string[] | null, lookup: LookupFn): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:") throw refused(ctx, url.host, `it is not https (${url.protocol})`);
  if (url.username || url.password) throw refused(ctx, url.host, "the URL carries credentials");
  if (url.port && url.port !== "443") throw refused(ctx, url.host, "it uses a non-standard port");
  if (isIP(host)) throw refused(ctx, url.host, "it is an IP address, not a host name");
  if (/^(localhost|metadata|metadata\.google\.internal)$|\.(localhost|local|internal)$/i.test(host)) throw refused(ctx, url.host, "it is a local or internal name");
  if (allowHosts && !hostAllowed(host, allowHosts)) throw refused(ctx, url.host, `it is not one of ${ctx.label}'s file hosts`);
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host);
  } catch (err) {
    throw new LinkedInMcpError("NETWORK", `Couldn't look up ${clean(host, ctx.secrets, 100)} to download the image.`, "Check your internet connection and try again.", {
      provider: ctx.label,
      cause: clean(err instanceof Error ? err.message : err, ctx.secrets, 120),
    });
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw refused(ctx, url.host, "it resolves to a private or local address");
}

export interface DownloadOptions {
  /** Hosts (and their subdomains) results may come from; null allows any public host. */
  allowHosts: readonly string[] | null;
  maxBytes?: number;
}

/**
 * Download a generated image without sending any credentials. Redirects are
 * followed by hand (at most 3) so every hop gets the same checks.
 */
export async function downloadImage(ctx: ProviderContext, deps: ProviderDeps, url: string, opts: DownloadOptions): Promise<Buffer> {
  const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const lookup = deps.lookup ?? systemLookup;
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw unexpected(ctx, "invalid image URL");
  }
  const timeoutMs = 90_000;
  const scoped = scopedSignal(deps.signal, timeoutMs);
  const tooBig = () =>
    new LinkedInMcpError("INVALID_INPUT", `${ctx.label} returned an image larger than ${maxBytes / MB} MB.`, "Ask for a smaller size or another model.", { provider: ctx.label });
  try {
    let res: Response;
    for (let hop = 0; ; hop++) {
      await assertSafeUrl(ctx, current, opts.allowHosts, lookup);
      try {
        res = await deps.fetch(current.href, { redirect: "manual", signal: scoped.signal });
      } catch (err) {
        throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
      }
      if (!REDIRECTS.has(res.status)) break;
      await res.body?.cancel().catch(() => undefined);
      const location = res.headers.get("location");
      if (!location) throw refused(ctx, current.host, "a redirect without a destination");
      if (hop >= MAX_REDIRECTS) throw refused(ctx, current.host, "too many redirects");
      try {
        current = new URL(location, current);
      } catch {
        throw refused(ctx, current.host, "a redirect to an invalid URL");
      }
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new LinkedInMcpError("NETWORK", `Couldn't download the image ${ctx.label} made (HTTP ${res.status} from ${clean(current.host, ctx.secrets, 100)}).`, "Try generating again.", {
        provider: ctx.label,
        status: res.status,
      });
    }
    try {
      return await readCapped(res, maxBytes, tooBig);
    } catch (err) {
      if (err instanceof LinkedInMcpError) throw err;
      throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
    }
  } finally {
    scoped.dispose();
  }
}

// ---- small helpers ----

/** Only follow a provider-supplied URL with credentials when it points at the provider's own API host. */
export function sameHost(url: unknown, hosts: string[]): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && hosts.includes(u.host);
  } catch {
    return false;
  }
}

/** Poll delay: start at `first`, grow by 1.5x up to `max`, with a little jitter. */
export function backoff(attempt: number, random: () => number, first = 2000, max = 10_000): number {
  return Math.min(max, first * 1.5 ** attempt) + Math.floor(random() * 500);
}

/** Style and negative prompt folded into the prompt, for models without separate fields. */
export function composePrompt(req: { prompt: string; style?: string; negativePrompt?: string }): string {
  let p = req.prompt.trim();
  if (req.style?.trim()) p += `\n\nStyle: ${req.style.trim()}`;
  if (req.negativePrompt?.trim()) p += `\n\nAvoid: ${req.negativePrompt.trim()}`;
  return p;
}

/** A model id that is safe to put in a URL path: segments of letters, digits, dot, dash, underscore. */
export function safeModelPath(model: string, segments: { min: number; max: number }): boolean {
  const parts = model.split("/");
  if (parts.length < segments.min || parts.length > segments.max) return false;
  return parts.every((p) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && p !== "." && p !== ".." && !p.includes(".."));
}

export function encodePath(model: string): string {
  return model.split("/").map(encodeURIComponent).join("/");
}
