import type { AspectRatio } from "../constants.js";
import { type ProviderContext, blocked, callJson, composePrompt, encodePath, safeModelPath, unexpected } from "../net.js";
import type { Cost, ImageProvider, ProviderDeps } from "../types.js";

/**
 * Ideogram API v2 (https://developer.ideogram.ai/v2/api-reference/images/generate).
 * POST https://api.ideogram.ai/v2/image/generate/<model> with the `Api-Key`
 * header. Synchronous by default: results arrive in `data`, links expire
 * after 24 hours. `?dry_run=true` returns a PriceQuote without generating.
 * A prompt that fails the safety check is a 422; an unsafe image comes back
 * with is_image_safe false and an empty url.
 */

const API = "https://api.ideogram.ai/v2/image/generate";

/** Ideogram 4.6 takes exact sizes: sides multiples of 32, at most 2048x2048 pixels for the 2K tier. */
const SIZE: Record<AspectRatio, string> = { "1:1": "1024x1024", "4:5": "1024x1280", "16:9": "1536x864", "1.91:1": "1536x800" };

interface GenerateResponse {
  generation_id?: string;
  data?: { url?: string | null; is_image_safe?: boolean }[];
}

function context(key: string): ProviderContext {
  return { label: "Ideogram", envHint: "IDEOGRAM_API_KEY", billingUrl: "https://ideogram.ai/platform", secrets: [key] };
}

async function quote(url: string, body: string, key: string, deps: ProviderDeps): Promise<Cost | undefined> {
  try {
    const res = await callJson(context(key), deps, `${url}?dry_run=true`, { headers: { "Api-Key": key, "Content-Type": "application/json" }, body, timeoutMs: 15_000 });
    const micros = (res.json as { usd_micros?: unknown }).usd_micros;
    const qualifier = (res.json as { qualifier?: unknown }).qualifier;
    return typeof micros === "number" ? { usd: micros / 1_000_000, kind: qualifier === "exact" ? "quote" : "estimate" } : undefined;
  } catch {
    return undefined;
  }
}

export const ideogram: ImageProvider = {
  id: "ideogram",
  label: "Ideogram",
  defaultModel: "ideogram-4-6",
  envSets: [["IDEOGRAM_API_KEY"]],
  keysUrl: "https://ideogram.ai/platform",
  docsUrl: "https://developer.ideogram.ai/v2/ideogram-api/quickstart",
  // Result links look like https://ideogram.ai/api/images/ephemeral/<id>.png (docs: Quickstart).
  resultHosts: ["ideogram.ai"],
  summary: "The best of these at legible text inside images (posters, headlines, signage). Billed per image from your Ideogram API credit.",
  credentials: (env) => env.IDEOGRAM_API_KEY?.trim() || null,
  validModel: (model) => safeModelPath(model, { min: 1, max: 1 }),
  async generate(req, key, deps) {
    const ctx = context(key);
    const url = `${API}/${encodePath(req.model)}`;
    const payload: Record<string, unknown> = { prompt: composePrompt(req), size: SIZE[req.aspectRatio], num_images: req.count };
    if (req.seed !== undefined) payload.seed = req.seed;
    const body = JSON.stringify(payload);
    const [cost, res] = await Promise.all([
      quote(url, body, key, deps),
      callJson(ctx, deps, url, {
        headers: { "Api-Key": key, "Content-Type": "application/json" },
        body,
        // A synchronous request waits up to 265 seconds on Ideogram's side.
        timeoutMs: 270_000,
        onError: (status) => (status === 422 ? blocked(ctx, "the prompt didn't pass the safety check") : undefined),
      }),
    ]);
    const data = (res.json as GenerateResponse).data;
    if (!Array.isArray(data)) throw unexpected(ctx, "no data array");
    const kept = data.filter((d) => d.is_image_safe !== false && typeof d.url === "string" && d.url.length > 0).map((d) => ({ url: d.url as string }));
    if (!kept.length) {
      if (data.some((d) => d.is_image_safe === false)) throw blocked(ctx, "the image didn't pass the safety check");
      throw unexpected(ctx, "no image URLs");
    }
    const notes = kept.length < data.length ? [`${data.length - kept.length} image(s) didn't pass Ideogram's safety check and were left out (Ideogram still bills them).`] : [];
    return { images: kept, cost, notes };
  },
};
