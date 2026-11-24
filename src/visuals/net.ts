import { LinkedInMcpError } from "../errors.js";
import type { ProviderDeps } from "./types.js";

/**
 * HTTP for image providers: per-request timeouts on top of the overall
 * generation deadline, capped response sizes, provider errors mapped to
 * LinkedInMcpError, and secrets scrubbed from anything a provider echoes back.
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

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out;
}

/** The human part of a provider's error body, whatever its shape. */
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
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** Map an HTTP failure from a provider to an error the assistant can act on. */
export function providerHttpError(ctx: ProviderContext, status: number, body: string, retryAfter: string | null): LinkedInMcpError {
  const detail = redact(errorDetail(body), ctx.secrets);
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

export function blocked(ctx: ProviderContext, why?: string): LinkedInMcpError {
  return new LinkedInMcpError(
    "INVALID_INPUT",
    `${ctx.label}'s safety filter blocked this image${why ? ` (${why})` : ""}.`,
    "Rephrase the prompt, avoiding real people, brands and anything sensitive, then try again.",
    { provider: ctx.label },
  );
}

export function unexpected(ctx: ProviderContext, what: string): LinkedInMcpError {
  return new LinkedInMcpError(
    "INTERNAL",
    `${ctx.label} sent a response linkedin-mcp doesn't understand (${what}).`,
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
  return new LinkedInMcpError("NETWORK", `Couldn't reach ${ctx.label}.`, "Check your internet connection and try again.", { provider: ctx.label, cause: cause.split("\n")[0] });
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

/** Largest generated file we keep. LinkedIn takes images up to 10 MB. */
export const MAX_DOWNLOAD_BYTES = 20 * MB;

/**
 * Download a generated image without sending any credentials. Only https
 * URLs, with a size cap and a timeout.
 */
export async function downloadImage(ctx: ProviderContext, deps: ProviderDeps, url: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw unexpected(ctx, "invalid image URL");
  }
  if (parsed.protocol !== "https:") throw unexpected(ctx, `image URL is not https (${parsed.protocol})`);
  const timeoutMs = 90_000;
  const scoped = scopedSignal(deps.signal, timeoutMs);
  const tooBig = () =>
    new LinkedInMcpError("INVALID_INPUT", `${ctx.label} returned an image larger than ${maxBytes / MB} MB.`, "Ask for a smaller size or another model.", { provider: ctx.label });
  try {
    let res: Response;
    try {
      res = await deps.fetch(parsed.href, { redirect: "follow", signal: scoped.signal });
    } catch (err) {
      throw transportError(ctx, scoped.signal.reason ?? err, deps.signal, timeoutMs);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new LinkedInMcpError("NETWORK", `Couldn't download the image ${ctx.label} made (HTTP ${res.status} from ${parsed.host}).`, "Try generating again.", { provider: ctx.label, status: res.status });
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
