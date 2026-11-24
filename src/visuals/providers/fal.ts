import { LinkedInMcpError } from "../../errors.js";
import type { AspectRatio } from "../constants.js";
import { type ProviderContext, backoff, blocked, callJson, composePrompt, encodePath, safeModelPath, sameHost, unexpected } from "../net.js";
import type { Cost, ImageProvider, ProviderDeps, ProviderRequest } from "../types.js";

/**
 * fal.ai queue API (https://fal.ai/docs/api-reference/inference-api/index).
 * Submit with POST https://queue.fal.run/<model>, poll `status_url` until
 * COMPLETED (202 while waiting, 200 when done; failures are COMPLETED with
 * an `error`), then GET `response_url` for the model output. Auth:
 * `Authorization: Key $FAL_KEY`. Cost: the Platform API's pricing estimate.
 */

const QUEUE = "https://queue.fal.run";
const QUEUE_HOSTS = ["queue.fal.run", "queue.falrun.com"];
const ESTIMATE = "https://api.fal.ai/v1/models/pricing/estimate";

/** FLUX takes any width and height; these are multiples of 16 close to each ratio. */
const SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "16:9": { width: 1536, height: 864 },
  "1.91:1": { width: 1536, height: 800 },
};

interface QueueStatus {
  status?: string;
  request_id?: string;
  status_url?: string | null;
  response_url?: string | null;
  error?: string;
  error_type?: string;
}
interface ModelOutput {
  images?: { url?: string }[];
  has_nsfw_concepts?: boolean[];
}

function context(key: string): ProviderContext {
  return { label: "fal.ai", envHint: "FAL_KEY", billingUrl: "https://fal.ai/dashboard/billing", secrets: [key] };
}

function headers(key: string): Record<string, string> {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json", Accept: "application/json" };
}

/** Status and result URLs use only the owner and app, never the endpoint path (docs: Model IDs and paths). */
function ownerApp(model: string): string {
  return encodePath(model.split("/").slice(0, 2).join("/"));
}

async function estimate(model: string, key: string, deps: ProviderDeps): Promise<Cost | undefined> {
  try {
    const res = await callJson(context(key), deps, ESTIMATE, {
      headers: headers(key),
      body: JSON.stringify({ estimate_type: "historical_api_price", endpoints: { [model]: { call_quantity: 1 } } }),
      timeoutMs: 15_000,
    });
    const { total_cost, currency } = res.json as { total_cost?: unknown; currency?: unknown };
    return typeof total_cost === "number" && currency === "USD" ? { usd: Math.round(total_cost * 10_000) / 10_000, kind: "estimate" } : undefined;
  } catch {
    return undefined;
  }
}

async function run(req: ProviderRequest, key: string, deps: ProviderDeps): Promise<ModelOutput> {
  const ctx = context(key);
  const input: Record<string, unknown> = {
    prompt: composePrompt(req),
    image_size: SIZE[req.aspectRatio],
    num_images: req.count,
    output_format: "png",
    enable_safety_checker: true,
  };
  if (req.seed !== undefined) input.seed = req.seed;
  const submitted = (await callJson(ctx, deps, `${QUEUE}/${encodePath(req.model)}`, { headers: headers(key), body: JSON.stringify(input), timeoutMs: 60_000 })).json as QueueStatus;
  const id = submitted.request_id;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(id)) throw unexpected(ctx, "no request_id");
  const base = `${QUEUE}/${ownerApp(req.model)}/requests/${encodeURIComponent(id)}`;
  const statusUrl = sameHost(submitted.status_url, QUEUE_HOSTS) ? submitted.status_url : `${base}/status`;
  const responseUrl = sameHost(submitted.response_url, QUEUE_HOSTS) ? submitted.response_url : base;

  let state = submitted;
  let transient = 0;
  for (let attempt = 0; state.status !== "COMPLETED"; attempt++) {
    if (state.status !== "IN_QUEUE" && state.status !== "IN_PROGRESS") throw unexpected(ctx, `status "${String(state.status)}"`);
    await deps.sleep(backoff(attempt, deps.random, 1000, 5000), deps.signal);
    try {
      state = (await callJson(ctx, deps, statusUrl, { headers: headers(key), timeoutMs: 30_000 })).json as QueueStatus;
      transient = 0;
    } catch (err) {
      if (err instanceof LinkedInMcpError && (err.code === "NETWORK" || err.code === "TIMEOUT") && !deps.signal.aborted && ++transient <= 3) continue;
      throw err;
    }
  }
  if (state.error) {
    throw new LinkedInMcpError("NETWORK", `fal.ai couldn't generate the image: ${state.error}`, "Try again, or change the prompt or model.", { provider: "fal.ai", error_type: state.error_type });
  }
  // The result returns the model's own status and body; a failed run comes back as its error.
  return (await callJson(ctx, deps, responseUrl, { headers: headers(key), timeoutMs: 60_000 })).json as ModelOutput;
}

export const fal: ImageProvider = {
  id: "fal",
  label: "fal.ai",
  defaultModel: "fal-ai/flux/dev",
  envSets: [["FAL_KEY"]],
  keysUrl: "https://fal.ai/dashboard/keys",
  docsUrl: "https://fal.ai/docs/api-reference/inference-api/index",
  summary: "FLUX and hundreds of other hosted models through one queue API. Billed per output (FLUX.1 [dev] is per megapixel) on your fal account.",
  credentials: (env) => env.FAL_KEY?.trim() || null,
  validModel: (model) => safeModelPath(model, { min: 2, max: 4 }),
  async generate(req, key, deps) {
    const ctx = context(key);
    const notes: string[] = [];
    const [cost, out] = await Promise.all([estimate(req.model, key, deps), run(req, key, deps)]);
    const images = out.images ?? [];
    const flagged = out.has_nsfw_concepts ?? [];
    // Flagged images come back black; drop them rather than save a black square.
    const kept = images.filter((img, i) => typeof img.url === "string" && img.url.length > 0 && flagged[i] !== true).map((img) => ({ url: img.url as string }));
    if (!kept.length) {
      if (flagged.some(Boolean)) throw blocked(ctx, "the safety checker flagged the result");
      throw unexpected(ctx, "no images in the result");
    }
    if (kept.length < images.length) notes.push(`${images.length - kept.length} image(s) were flagged by fal's safety checker and left out.`);
    return { images: kept, cost, notes };
  },
};
