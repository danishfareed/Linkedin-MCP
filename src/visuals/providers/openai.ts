import type { AspectRatio } from "../constants.js";
import { type ProviderContext, blocked, callJson, composePrompt, unexpected } from "../net.js";
import type { ImageProvider } from "../types.js";

/**
 * OpenAI Image API (https://developers.openai.com/api/reference/resources/images/methods/generate).
 * POST /v1/images/generations with `Authorization: Bearer`. GPT Image models
 * always return base64 (`data[].b64_json`). gpt-image-1 was shut down on
 * 2026-10-23; GPT Image 2.x takes custom WIDTHxHEIGHT sizes (multiples of 16,
 * 655,360 to 8,294,400 pixels), older models only 1024x1024, 1536x1024, 1024x1536.
 */

const API = "https://api.openai.com/v1/images/generations";

const CUSTOM: Record<AspectRatio, string> = { "1:1": "1024x1024", "4:5": "1024x1280", "16:9": "1536x864", "1.91:1": "1536x800" };
const STANDARD: Record<AspectRatio, string> = { "1:1": "1024x1024", "4:5": "1024x1536", "16:9": "1536x1024", "1.91:1": "1536x1024" };

function context(key: string): ProviderContext {
  return { label: "OpenAI", envHint: "OPENAI_API_KEY", billingUrl: "https://platform.openai.com/settings/organization/billing", secrets: [key] };
}

function customSizes(model: string): boolean {
  return /^gpt-image-[2-9]/.test(model);
}

export const openai: ImageProvider = {
  id: "openai",
  label: "OpenAI",
  defaultModel: "gpt-image-2.5-flare",
  envSets: [["OPENAI_API_KEY"]],
  keysUrl: "https://platform.openai.com/api-keys",
  docsUrl: "https://developers.openai.com/api/docs/guides/image-generation",
  // GPT Image models return base64 only, so nothing is ever downloaded.
  resultHosts: [],
  summary: "GPT Image models: strong prompt following and good text in images. Billed per token on your OpenAI account.",
  credentials: (env) => env.OPENAI_API_KEY?.trim() || null,
  validModel: (model) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model),
  async generate(req, key, deps) {
    const ctx = context(key);
    const notes: string[] = [];
    const custom = customSizes(req.model);
    const size = (custom ? CUSTOM : STANDARD)[req.aspectRatio];
    if (!custom && req.aspectRatio !== "1:1") notes.push(`${req.model} only makes 1:1, 3:2 and 2:3 images, so this one is ${size}.`);
    if (req.seed !== undefined) notes.push("OpenAI's image models don't take a seed, so it was ignored.");
    const res = await callJson(ctx, deps, API, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: req.model, prompt: composePrompt(req), n: req.count, size, output_format: "png" }),
      // Complex prompts can take up to 2 minutes (docs: Limitations).
      timeoutMs: 180_000,
      maxBytes: 80 * 1024 * 1024,
      onError: (status, text) => (status === 400 && /moderation_blocked/.test(text) ? blocked(ctx, "moderation_blocked") : undefined),
    });
    const data = (res.json as { data?: { b64_json?: unknown }[] }).data;
    if (!Array.isArray(data)) throw unexpected(ctx, "no data array");
    const images = data.map((d) => d.b64_json).filter((b): b is string => typeof b === "string" && b.length > 0).map((b) => ({ data: Buffer.from(b, "base64") }));
    if (!images.length) throw unexpected(ctx, "no images in data");
    return { images, notes };
  },
};
