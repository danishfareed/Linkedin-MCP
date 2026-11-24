import { promises as dns } from "node:dns";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { type LookupFunction, isIP, isIPv4 } from "node:net";
import { LinkedInMcpError } from "../errors.js";
import type { DownloadTransport, LookupFn, ProviderDeps } from "./types.js";

/**
 * HTTP for image providers: per-request timeouts on top of the overall
 * generation deadline, capped response sizes, provider errors mapped to
 * LinkedInMcpError, secrets scrubbed from anything a provider echoes back,
 * and downloads that can only connect to public addresses of the
 * provider's own file hosts.
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

/** Read a body, stopping as soon as it passes maxBytes. */
async function readCapped(body: AsyncIterable<Uint8Array>, maxBytes: number, onTooBig: () => LinkedInMcpError, close: () => void): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      close();
      throw onTooBig();
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** A fetch Response body as an async iterable (typed without DOM.AsyncIterable). */
async function* webBody(res: Response): AsyncIterable<Uint8Array> {
  if (!res.body) return;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
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
 * Call a provider's API (a fixed, known host). Redirects are refused, so
 * credentials in headers can never be forwarded elsewhere. Non-2xx responses throw.
 */
export async function callJson(ctx: ProviderContext, deps: ProviderDeps, url: string, call: JsonCall): Promise<JsonResponse> {
  const timeoutMs = call.timeoutMs ?? 120_000;
  const maxBytes = call.maxBytes ?? 2 * MB;
  const scoped = scopedSignal(deps.signal, timeoutMs);
  try {
    let res: Response;
    try {
      res = await deps.fetch(url, { method: call.method ?? (call.body === undefined ? "GET" : "POST"), headers: call.headers, body: call.body, redirect: "error", signal: scoped.signal });
    } catch (err) {
      throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
    }
    const tooBig = () => unexpected(ctx, "response too large");
    let raw: Buffer;
    try {
      if (Number(res.headers.get("content-length")) > maxBytes) throw tooBig();
      raw = await readCapped(webBody(res), maxBytes, tooBig, () => void res.body?.cancel().catch(() => undefined));
    } catch (err) {
      await res.body?.cancel().catch(() => undefined);
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

// ---- which addresses a download may reach ----

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

/** IPv4 ranges that are not public (RFC 6890 special-purpose and friends). */
const IPV4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT, including Alibaba's metadata 100.100.100.200
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including 255.255.255.255
  ["168.63.129.16", 32], // Azure host metadata
];

function inV4(ip: number, base: string, prefix: number): boolean {
  const size = 2 ** (32 - prefix);
  const start = ipv4ToInt(base);
  return ip >= start && ip < start + size;
}

function publicIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return !IPV4_BLOCKED.some(([base, prefix]) => inV4(n, base, prefix));
}

/** Expand a valid IPv6 address to 8 numeric groups. */
function ipv6Groups(ip: string): number[] {
  let addr = ip.toLowerCase().split("%")[0]!;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    const n = ipv4ToInt(v4[1]!);
    addr = `${addr.slice(0, -v4[1]!.length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const [head, tail] = addr.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0");
  return [...h, ...fill, ...t].map((g) => Number.parseInt(g || "0", 16));
}

/**
 * IPv6 is deny-by-default: only global unicast 2000::/3 is public, minus
 * documentation, Teredo and 6to4. Addresses carrying an IPv4 address
 * (::ffff:0:0/96 mapped, ::/96 compatible) are judged by that IPv4 address.
 * NAT64 (64:ff9b::/96, 64:ff9b:1::/48) falls outside 2000::/3 and is refused.
 */
function publicIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (g.length !== 8 || g.some((x) => !Number.isInteger(x) || x < 0 || x > 0xffff)) return false;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && (g[5] === 0xffff || g[5] === 0)) {
    return publicIPv4(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  }
  if ((g[0]! & 0xe000) !== 0x2000) return false; // not global unicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false; // Teredo
  if (g[0] === 0x2002) return false; // 6to4
  return true;
}

/** True for any address a download must not connect to. Anything that isn't a valid IP counts as private. */
export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) return !publicIPv4(ip);
  if (isIP(ip) === 6) return !publicIPv6(ip);
  return true;
}

export class PrivateAddressError extends Error {
  readonly code = "EPRIVATE";
  constructor(hostname: string) {
    super(`${hostname} resolves to a private or local address`);
    this.name = "PrivateAddressError";
  }
}

/**
 * A lookup for the socket itself: resolve once, refuse if ANY address is
 * not public, and hand back only those checked addresses. Because the
 * connection uses exactly this answer, a host can't pass the check and
 * then rebind to a private address.
 */
export function pinnedLookup(resolve: LookupFn): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (answers) => {
        if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) {
          callback(new PrivateAddressError(hostname), "", 4);
          return;
        }
        const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
        const usable: LookupAddress[] = answers.filter((a) => !family || a.family === family).map((a) => ({ address: a.address, family: a.family }));
        if (!usable.length) {
          callback(Object.assign(new Error(`No IPv${family} address for ${hostname}`), { code: "ENOTFOUND" }), "", 4);
          return;
        }
        if (options.all) callback(null, usable);
        else callback(null, usable[0]!.address, usable[0]!.family);
      },
      (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), "", 4),
    );
  };
}

/**
 * The real transport: node:https with the pinned lookup and a fresh
 * connection (no shared keep-alive pool, which could hold a socket opened
 * without the check). SNI and Host stay the URL's host name. Never follows
 * redirects; downloadImage does that, re-checking each hop.
 */
export const httpsTransport: DownloadTransport = (url, { signal, lookup }) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      { method: "GET", lookup, signal, agent: false, headers: { accept: "image/png,image/jpeg,image/gif,image/*;q=0.8", "accept-encoding": "identity", "user-agent": "linkedin-mcp" } },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          header: (name) => {
            const v = res.headers[name.toLowerCase()];
            return Array.isArray(v) ? v[0] : v;
          },
          body: res,
          close: () => res.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Largest generated file we keep. LinkedIn takes images up to 10 MB. */
export const MAX_DOWNLOAD_BYTES = 20 * MB;

const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export const systemLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

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
 * Checks on a URL before connecting: https on the default port, no
 * credentials, a host name (not an IP literal or local name) on the
 * provider's list. Address checks happen in the pinned lookup at connect time.
 */
function assertSafeUrl(ctx: ProviderContext, url: URL, allowHosts: readonly string[] | null): void {
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:") throw refused(ctx, url.host, `it is not https (${url.protocol})`);
  if (url.username || url.password) throw refused(ctx, url.host, "the URL carries credentials");
  if (url.port && url.port !== "443") throw refused(ctx, url.host, "it uses a non-standard port");
  if (isIP(host)) throw refused(ctx, url.host, "it is an IP address, not a host name");
  if (/^(localhost|metadata|metadata\.google\.internal)$|\.(localhost|local|internal)$/i.test(host)) throw refused(ctx, url.host, "it is a local or internal name");
  if (allowHosts && !hostAllowed(host, allowHosts)) throw refused(ctx, url.host, `it is not one of ${ctx.label}'s file hosts`);
}

export interface DownloadOptions {
  /** Hosts (and their subdomains) results may come from; null allows any public host. */
  allowHosts: readonly string[] | null;
  maxBytes?: number;
}

/**
 * Download a generated image without sending any credentials. Each hop is
 * checked, connects only to the addresses its own lookup validated, and
 * redirects are followed by hand (at most 3).
 */
export async function downloadImage(ctx: ProviderContext, deps: ProviderDeps, url: string, opts: DownloadOptions): Promise<Buffer> {
  const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const transport = deps.transport ?? httpsTransport;
  const lookup = pinnedLookup(deps.lookup ?? systemLookup);
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
    for (let hop = 0; ; hop++) {
      assertSafeUrl(ctx, current, opts.allowHosts);
      let res;
      try {
        res = await transport(current, { signal: scoped.signal, lookup });
      } catch (err) {
        if (err instanceof PrivateAddressError || (err as { code?: unknown })?.code === "EPRIVATE") throw refused(ctx, current.host, "it resolves to a private or local address");
        throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
      }
      if (REDIRECTS.has(res.status)) {
        res.close();
        const location = res.header("location");
        if (!location) throw refused(ctx, current.host, "a redirect without a destination");
        if (hop >= MAX_REDIRECTS) throw refused(ctx, current.host, "too many redirects");
        try {
          current = new URL(location, current);
        } catch {
          throw refused(ctx, current.host, "a redirect to an invalid URL");
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.close();
        throw new LinkedInMcpError("NETWORK", `Couldn't download the image ${ctx.label} made (HTTP ${res.status} from ${clean(current.host, ctx.secrets, 100)}).`, "Try generating again.", {
          provider: ctx.label,
          status: res.status,
        });
      }
      if (Number(res.header("content-length")) > maxBytes) {
        res.close();
        throw tooBig();
      }
      try {
        return await readCapped(res.body, maxBytes, tooBig, res.close);
      } catch (err) {
        res.close();
        if (err instanceof LinkedInMcpError) throw err;
        throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
      }
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
