import { LinkedInMcpError } from "../../errors.js";
import type { AspectRatio } from "../constants.js";
import { type ProviderContext, blocked, callJson, clean, composePrompt, encodePath, providerHttpError, safeModelPath, unexpected } from "../net.js";
import type { ImageProvider, ProviderDeps, ProviderRequest } from "../types.js";

/**
 * Gemini API image generation ("Nano Banana", https://ai.google.dev/gemini-api/docs/image-generation).
 * POST https://generativelanguage.googleapis.com/v1/models/<model>:generateContent
 * with `x-goog-api-key`. Images come back as base64 `inlineData` parts.
 * Imagen models are shut down; generateContent is still supported (the
 * newer Interactions API is the documented default for new projects).
 * One image per request, so counts above 1 run as parallel requests.
 */

const API = "https://generativelanguage.googleapis.com/v1/models";

/** Nano Banana supports 1:1, 4:5 and 16:9 directly; 1.91:1 is closest to 16:9. */
const RATIO: Record<AspectRatio, string> = { "1:1": "1:1", "4:5": "4:5", "16:9": "16:9", "1.91:1": "16:9" };

interface Part {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}
interface GenerateContentResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function context(key: string): ProviderContext {
  return { label: "Gemini", envHint: "GEMINI_API_KEY (or GOOGLE_API_KEY)", billingUrl: "https://aistudio.google.com/usage", secrets: [key] };
}

const SAFETY = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/;

async function one(req: ProviderRequest, key: string, deps: ProviderDeps): Promise<Buffer> {
  const ctx = context(key);
  const res = await callJson(ctx, deps, `${API}/${encodePath(req.model)}:generateContent`, {
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: composePrompt(req) }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: RATIO[req.aspectRatio] } },
    }),
    timeoutMs: 180_000,
    maxBytes: 40 * 1024 * 1024,
    // An invalid key is a 400 INVALID_ARGUMENT, not a 401.
    onError: (status, text) => (status === 400 && /API_KEY_INVALID|API key not valid/i.test(text) ? providerHttpError(ctx, 401, text, null) : undefined),
  });
  const json = res.json as GenerateContentResponse;
  const parts = json.candidates?.flatMap((c) => c.content?.parts ?? []) ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data ?? p.inline_data?.data;
    if (typeof data === "string" && data.length > 0) return Buffer.from(data, "base64");
  }
  const reason = json.promptFeedback?.blockReason ?? json.candidates?.map((c) => c.finishReason).find((r) => r && SAFETY.test(r));
  if (reason) throw blocked(ctx, reason);
  const text = parts.map((p) => p.text ?? "").join(" ").trim();
  if (text) {
    throw new LinkedInMcpError("INVALID_INPUT", `Gemini answered with text instead of an image: ${clean(text, ctx.secrets, 200)}`, "Rephrase the prompt as a description of the picture you want.", { provider: "Gemini" });
  }
  throw unexpected(ctx, "no image in the response");
}

export const gemini: ImageProvider = {
  id: "gemini",
  label: "Google Gemini",
  defaultModel: "gemini-nano-banana-2.1",
  envSets: [["GEMINI_API_KEY"], ["GOOGLE_API_KEY"]],
  keysUrl: "https://aistudio.google.com/apikey",
  docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
  // Images arrive inline as base64, so nothing is ever downloaded.
  resultHosts: [],
  summary: "Nano Banana image models: fast, good with text and edits. Billed per image on your Gemini API account; images carry a SynthID watermark.",
  // The Gemini docs: when both are set, GOOGLE_API_KEY takes precedence.
  credentials: (env) => env.GOOGLE_API_KEY?.trim() || env.GEMINI_API_KEY?.trim() || null,
  validModel: (model) => safeModelPath(model, { min: 1, max: 1 }),
  async generate(req, key, deps) {
    const notes: string[] = [];
    if (req.aspectRatio === "1.91:1") notes.push("Gemini has no 1.91:1, so the image is 16:9.");
    if (req.seed !== undefined) notes.push("Gemini image models don't take a seed here, so it was ignored.");
    const images = await Promise.all(Array.from({ length: req.count }, () => one(req, key, deps)));
    return { images: images.map((data) => ({ data })), notes };
  },
};
