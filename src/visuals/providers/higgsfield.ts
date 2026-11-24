import { randomUUID } from "node:crypto";
import { LinkedInMcpError } from "../../errors.js";
import type { AspectRatio } from "../constants.js";
import { type ProviderContext, backoff, blocked, callJson, composePrompt, encodePath, safeModelPath, sameHost, unexpected } from "../net.js";
import type { Cost, ImageProvider, ProviderDeps, ProviderRequest } from "../types.js";

/**
 * Higgsfield (https://docs.higgsfield.ai). Asynchronous: submit to a model
 * endpoint, then poll the request status until it is completed, failed,
 * nsfw or canceled. Auth: `Authorization: Key <key_id>:<key_secret>`.
 * Cost: POST /estimate/<model> with the same body returns {"usd": "0.094"}.
 */

const API = "https://api.higgsfield.ai";
const HOSTS = ["api.higgsfield.ai"];

/** SOUL models take 9:16, 16:9, 4:3, 3:4, 1:1, 2:3 and 3:2. */
const RATIO: Record<AspectRatio, string> = { "1:1": "1:1", "4:5": "3:4", "16:9": "16:9", "1.91:1": "16:9" };

interface StatusResponse {
  status?: string;
  request_id?: string;
  status_url?: string;
  images?: { url?: string }[];
  error?: string | null;
}

function context(credentials: string): ProviderContext {
  return {
    label: "Higgsfield",
    envHint: "HF_API_KEY_ID and HF_API_KEY_SECRET",
    billingUrl: "https://console.higgsfield.ai",
    secrets: [credentials, ...credentials.split(":")],
  };
}

function headers(credentials: string): Record<string, string> {
  return { Authorization: `Key ${credentials}`, "Content-Type": "application/json", Accept: "application/json" };
}

function isSoul(model: string): boolean {
  return model.startsWith("higgsfield-ai/soul/");
}

function body(req: ProviderRequest, batch: number): Record<string, unknown> {
  const b: Record<string, unknown> = { prompt: composePrompt(req), aspect_ratio: RATIO[req.aspectRatio] };
  if (isSoul(req.model)) {
    b.resolution = "1080p";
    b.batch_size = batch;
    if (req.seed !== undefined) b.seed = Math.min(1_000_000, Math.max(1, req.seed));
  }
  return b;
}

async function submitAndWait(req: ProviderRequest, batch: number, credentials: string, deps: ProviderDeps): Promise<string[]> {
  const ctx = context(credentials);
  const submitted = (
    await callJson(ctx, deps, `${API}/${encodePath(req.model)}`, {
      headers: { ...headers(credentials), "Idempotency-Key": randomUUID() },
      body: JSON.stringify(body(req, batch)),
      timeoutMs: 60_000,
    })
  ).json as StatusResponse;
  const id = submitted.request_id;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(id)) throw unexpected(ctx, "no request_id");
  const statusUrl = sameHost(submitted.status_url, HOSTS) ? submitted.status_url : `${API}/requests/${encodeURIComponent(id)}/status`;

  let state = submitted;
  let transient = 0;
  for (let attempt = 0; ; attempt++) {
    switch (state.status) {
      case "completed": {
        const urls = (state.images ?? []).map((i) => i.url).filter((u): u is string => typeof u === "string" && u.length > 0);
        if (!urls.length) throw unexpected(ctx, "completed without images");
        return urls;
      }
      case "nsfw":
        throw blocked(ctx, "input or output rejected by content moderation");
      case "failed":
        throw new LinkedInMcpError("NETWORK", `Higgsfield couldn't generate the image${state.error ? `: ${state.error}` : ""}.`, "Try again, perhaps with a different prompt. Failed requests aren't charged.", { provider: "Higgsfield", request_id: id });
      case "canceled":
        throw new LinkedInMcpError("NETWORK", "The Higgsfield request was canceled before it started.", "Try again.", { provider: "Higgsfield", request_id: id });
      case "queued":
      case "in_progress":
        break;
      default:
        throw unexpected(ctx, `status "${String(state.status)}"`);
    }
    await deps.sleep(backoff(attempt, deps.random), deps.signal);
    try {
      state = (await callJson(ctx, deps, statusUrl, { headers: headers(credentials), timeoutMs: 30_000 })).json as StatusResponse;
      transient = 0;
    } catch (err) {
      // Polling is safe to retry after network failures and 5xx (docs: Polling, Retry decisions).
      if (err instanceof LinkedInMcpError && (err.code === "NETWORK" || err.code === "TIMEOUT") && !deps.signal.aborted && ++transient <= 3) continue;
      throw err;
    }
  }
}

async function estimate(req: ProviderRequest, batch: number, requests: number, credentials: string, deps: ProviderDeps): Promise<Cost | undefined> {
  try {
    const res = await callJson(context(credentials), deps, `${API}/estimate/${encodePath(req.model)}`, {
      headers: headers(credentials),
      body: JSON.stringify(body(req, batch)),
      timeoutMs: 15_000,
    });
    const usd = Number((res.json as { usd?: unknown }).usd);
    return Number.isFinite(usd) ? { usd: Math.round(usd * requests * 10_000) / 10_000, kind: "estimate" } : undefined;
  } catch {
    return undefined;
  }
}

export const higgsfield: ImageProvider = {
  id: "higgsfield",
  label: "Higgsfield",
  defaultModel: "higgsfield-ai/soul/standard",
  envSets: [["HF_API_KEY_ID", "HF_API_KEY_SECRET"], ["HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"], ["HF_CREDENTIALS"]],
  keysUrl: "https://console.higgsfield.ai",
  docsUrl: "https://docs.higgsfield.ai/docs/quickstart.md",
  summary: "SOUL photo and fashion-editorial models, plus partner models. Pay-as-you-go from your Higgsfield balance; failed and moderated requests aren't charged.",
  credentials(env) {
    const id = env.HF_API_KEY_ID?.trim() || env.HIGGSFIELD_API_KEY_ID?.trim();
    const secret = env.HF_API_KEY_SECRET?.trim() || env.HIGGSFIELD_API_KEY_SECRET?.trim();
    if (id && secret) return `${id}:${secret}`;
    const combined = env.HF_CREDENTIALS?.trim();
    return combined && /^[^:\s]+:[^:\s]+$/.test(combined) ? combined : null;
  },
  validModel: (model) => safeModelPath(model, { min: 2, max: 5 }),
  async generate(req, credentials, deps) {
    const notes: string[] = [];
    if (req.aspectRatio === "4:5") notes.push("Higgsfield has no 4:5, so the image is 3:4; LinkedIn shows it the same way in the feed.");
    if (req.aspectRatio === "1.91:1") notes.push("Higgsfield has no 1.91:1, so the image is 16:9.");
    if (req.seed !== undefined && !isSoul(req.model)) notes.push("seed was not sent: it's only known to work with SOUL models.");
    // SOUL takes batch_size 1 or 4; other counts run as separate requests.
    const batch = isSoul(req.model) && req.count === 4 ? 4 : 1;
    const requests = batch === 4 ? 1 : req.count;
    const [cost, ...results] = await Promise.all([estimate(req, batch, requests, credentials, deps), ...Array.from({ length: requests }, () => submitAndWait(req, batch, credentials, deps))]);
    return { images: results.flat().slice(0, req.count).map((url) => ({ url })), cost, notes };
  },
};
