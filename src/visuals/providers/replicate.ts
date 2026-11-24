import { LinkedInMcpError } from "../../errors.js";
import type { AspectRatio } from "../constants.js";
import { type ProviderContext, backoff, blocked, callJson, composePrompt, encodePath, generationFailed, safeModelPath, sameHost, unexpected } from "../net.js";
import type { ImageProvider } from "../types.js";

/**
 * Replicate HTTP API (https://replicate.com/docs/reference/http).
 * POST /v1/models/<owner>/<name>/predictions with `Authorization: Bearer`
 * and `Prefer: wait=60` (sync mode); a prediction still running after that
 * is polled at `urls.get`. Output files are replicate.delivery URLs that
 * expire after an hour.
 */

const API = "https://api.replicate.com/v1";
const HOSTS = ["api.replicate.com"];

/** FLUX on Replicate: 1:1, 16:9, 21:9, 3:2, 2:3, 4:5, 5:4, 3:4, 4:3, 9:16, 9:21. */
const RATIO: Record<AspectRatio, string> = { "1:1": "1:1", "4:5": "4:5", "16:9": "16:9", "1.91:1": "16:9" };

interface Prediction {
  id?: string;
  status?: string;
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
}

const TERMINAL = new Set(["succeeded", "failed", "canceled", "aborted"]);

function context(token: string): ProviderContext {
  return { label: "Replicate", envHint: "REPLICATE_API_TOKEN", billingUrl: "https://replicate.com/account/billing", secrets: [token] };
}

function outputUrls(output: unknown): string[] {
  const list = Array.isArray(output) ? output : [output];
  return list.filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
}

export const replicate: ImageProvider = {
  id: "replicate",
  label: "Replicate",
  defaultModel: "black-forest-labs/flux-schnell",
  envSets: [["REPLICATE_API_TOKEN"]],
  keysUrl: "https://replicate.com/account/api-tokens",
  docsUrl: "https://replicate.com/docs/topics/predictions/create-a-prediction",
  // "Output files are served by replicate.delivery and its subdomains" (docs: Output files).
  resultHosts: ["replicate.delivery"],
  summary: "Runs official and community models (FLUX by default). Billed by compute time or per output, depending on the model.",
  credentials: (env) => env.REPLICATE_API_TOKEN?.trim() || null,
  validModel: (model) => safeModelPath(model, { min: 2, max: 2 }),
  async generate(req, token, deps) {
    const ctx = context(token);
    const notes: string[] = [];
    if (req.aspectRatio === "1.91:1") notes.push("FLUX on Replicate has no 1.91:1, so the image is 16:9.");
    const input: Record<string, unknown> = { prompt: composePrompt(req), aspect_ratio: RATIO[req.aspectRatio], num_outputs: req.count, output_format: "png" };
    if (req.seed !== undefined) input.seed = req.seed;
    const auth = { Authorization: `Bearer ${token}` };
    let p = (
      await callJson(ctx, deps, `${API}/models/${encodePath(req.model)}/predictions`, {
        headers: { ...auth, "Content-Type": "application/json", Prefer: "wait=60" },
        body: JSON.stringify({ input }),
        timeoutMs: 75_000,
      })
    ).json as Prediction;
    if (typeof p.id !== "string" || !/^[A-Za-z0-9]{1,100}$/.test(p.id)) throw unexpected(ctx, "no prediction id");
    const getUrl = sameHost(p.urls?.get, HOSTS) ? p.urls.get : `${API}/predictions/${encodeURIComponent(p.id)}`;

    let transient = 0;
    for (let attempt = 0; !TERMINAL.has(p.status ?? ""); attempt++) {
      if (p.status !== "starting" && p.status !== "processing") throw unexpected(ctx, `status "${String(p.status)}"`);
      await deps.sleep(backoff(attempt, deps.random, 1500, 8000), deps.signal);
      try {
        p = (await callJson(ctx, deps, getUrl, { headers: auth, timeoutMs: 30_000 })).json as Prediction;
        transient = 0;
      } catch (err) {
        if (err instanceof LinkedInMcpError && (err.code === "NETWORK" || err.code === "TIMEOUT") && !deps.signal.aborted && ++transient <= 3) continue;
        throw err;
      }
    }
    if (p.status === "failed") {
      if (/nsfw|safety/i.test(String(p.error ?? ""))) throw blocked(ctx, p.error);
      throw generationFailed(ctx, p.error);
    }
    if (p.status !== "succeeded") throw new LinkedInMcpError("NETWORK", `The Replicate prediction was ${p.status === "aborted" ? "aborted" : "canceled"}.`, "Try again.", { provider: "Replicate" });
    const urls = outputUrls(p.output);
    if (!urls.length) throw unexpected(ctx, "no image URLs in the output");
    return { images: urls.slice(0, req.count).map((url) => ({ url })), notes };
  },
};
