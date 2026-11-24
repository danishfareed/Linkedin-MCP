import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { LinkedInMcpError } from "../../src/errors.js";
import { type GenerateDeps, ImageJobs, generateImages } from "../../src/visuals/generate.js";
import { imageSize, sniffImage } from "../../src/visuals/image-file.js";
import { listMedia, slugify } from "../../src/visuals/media.js";
import { chooseProvider, providerStatus } from "../../src/visuals/providers/index.js";
import type { ImageSettings } from "../../src/visuals/providers/index.js";
import { tempDir } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_B64, "base64");
const docs = JSON.parse(readFileSync(join(here, "../fixtures/visuals-providers.json"), "utf8").replaceAll("__PNG_BASE64__", PNG_B64));

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  redirect?: string;
}
type Handler = (call: Call) => Response | Promise<Response>;

/** A fetch that answers from a route table. An array of handlers is served in order; the last one repeats. */
function fakeFetch(routes: [RegExp, Handler | Handler[]][]) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : "",
      redirect: init?.redirect,
    };
    calls.push(call);
    for (const [pattern, handler] of routes) {
      if (!pattern.test(call.url)) continue;
      const h = Array.isArray(handler) ? (handler.length > 1 ? handler.shift()! : handler[0]!) : handler;
      return h(call);
    }
    throw new TypeError(`fetch failed: no route for ${call.url}`);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const image = (bytes: Buffer = PNG) => () => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/png" } });

const settings = (over: Partial<ImageSettings> = {}): ImageSettings => ({ provider: undefined, model: undefined, models: {}, timeoutSeconds: 300, ...over });

function setup(env: NodeJS.ProcessEnv, fetch: typeof globalThis.fetch) {
  const media = join(tempDir(), "media");
  const deps: GenerateDeps = { fetch, env, now: () => new Date(2026, 10, 24, 15, 30, 5), random: () => 0, sleep: async () => undefined };
  return { media, deps };
}

const request = { prompt: "A quiet alpine lake at sunrise, editorial photography", aspectRatio: "4:5" as const, count: 1 };

async function rejection(p: Promise<unknown>): Promise<LinkedInMcpError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(LinkedInMcpError);
    return err as LinkedInMcpError;
  }
  throw new Error("expected a rejection");
}

describe("image files", () => {
  it("recognises image types by content and reads PNG and JPEG sizes", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(imageSize(PNG)).toEqual({ width: 1, height: 1 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03]);
    expect(sniffImage(jpeg)).toBe("jpeg");
    expect(imageSize(jpeg)).toEqual({ width: 1080, height: 1350 });
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(Buffer.from("<html>nope</html>"))).toBeNull();
  });

  it("makes short readable slugs", () => {
    expect(slugify("Hello, World! Café time")).toBe("hello-world-cafe-time");
    expect(slugify("A quiet alpine lake at sunrise, editorial photography", 30)).toBe("a-quiet-alpine-lake-at-sunrise");
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("Higgsfield", () => {
  const env = { HF_API_KEY_ID: "key-id-123", HF_API_KEY_SECRET: "secret-456" };

  it("submits, polls to completion, estimates cost and saves the image", async () => {
    const { fetch, calls } = fakeFetch([
      [/\/estimate\//, json(docs.higgsfield.estimate)],
      [/\/higgsfield-ai\/soul\/standard$/, json(docs.higgsfield.queued)],
      [/\/requests\/.+\/status$/, [json(docs.higgsfield.in_progress), json(docs.higgsfield.completed)]],
      [/cdn\.example\.com/, image()],
    ]);
    const { media, deps } = setup(env, fetch);
    const result = await generateImages(request, settings(), media, deps);

    expect(result).toMatchObject({ provider: "higgsfield", model: "higgsfield-ai/soul/standard", cost_usd: 0.094, cost_kind: "estimate" });
    expect(result.images).toHaveLength(1);
    const file = result.images[0]!;
    expect(file.path.startsWith(join(media, "2026-11"))).toBe(true);
    expect(basename(file.path)).toBe("20261124-153005-a-quiet-alpine-lake-at-sunrise-editorial-higgsfield.png");
    expect(readFileSync(file.path)).toEqual(PNG);
    expect(result.notes.join(" ")).toMatch(/3:4/);

    const submit = calls.find((c) => c.url === "https://api.higgsfield.ai/higgsfield-ai/soul/standard")!;
    expect(submit.headers.authorization).toBe("Key key-id-123:secret-456");
    expect(submit.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(submit.redirect).toBe("error");
    expect(JSON.parse(submit.body)).toMatchObject({ prompt: request.prompt, aspect_ratio: "3:4", batch_size: 1, resolution: "1080p" });
    expect(calls.some((c) => c.url === "https://api.higgsfield.ai/estimate/higgsfield-ai/soul/standard")).toBe(true);
    // The download carries no credentials.
    const download = calls.find((c) => c.url.startsWith("https://cdn.example.com"))!;
    expect(download.headers.authorization).toBeUndefined();
  });

  it("never sends credentials to a status URL on another host", async () => {
    const evil = { ...docs.higgsfield.queued, status_url: "https://attacker.example/steal" };
    const { fetch, calls } = fakeFetch([
      [/\/estimate\//, json(docs.higgsfield.estimate)],
      [/\/higgsfield-ai\/soul\/standard$/, json(evil)],
      [/api\.higgsfield\.ai\/requests\/.+\/status$/, json(docs.higgsfield.completed)],
      [/cdn\.example\.com/, image()],
    ]);
    const { media, deps } = setup(env, fetch);
    await generateImages(request, settings(), media, deps);
    expect(calls.some((c) => c.url.includes("attacker.example"))).toBe(false);
  });

  it("maps moderation, failures, bad keys and a full queue to clear errors", async () => {
    const run = async (routes: [RegExp, Handler | Handler[]][]) => {
      const { fetch } = fakeFetch([[/\/estimate\//, json(docs.higgsfield.estimate)], ...routes]);
      const { media, deps } = setup(env, fetch);
      return rejection(generateImages(request, settings(), media, deps));
    };
    const nsfw = await run([[/soul\/standard$/, json(docs.higgsfield.queued)], [/status$/, json(docs.higgsfield.nsfw)]]);
    expect(nsfw.code).toBe("INVALID_INPUT");
    expect(nsfw.message).toMatch(/safety filter/);

    const failed = await run([[/soul\/standard$/, json(docs.higgsfield.queued)], [/status$/, json(docs.higgsfield.failed)]]);
    expect(failed.code).toBe("NETWORK");

    const auth = await run([[/soul\/standard$/, json(docs.higgsfield.unauthorized, 401)]]);
    expect(auth.code).toBe("INVALID_INPUT");
    expect(auth.nextStep).toMatch(/HF_API_KEY_ID/);

    const busy = await run([[/soul\/standard$/, json(docs.higgsfield.queue_full, 429, { "retry-after": "30" })]]);
    expect(busy.code).toBe("RATE_LIMITED");
    expect(busy.details).toMatchObject({ retry_after_seconds: 30 });
    expect(busy.message).toMatch(/Too many queued generations/);
  });

  it("retries a status poll after a network blip", async () => {
    const { fetch } = fakeFetch([
      [/\/estimate\//, json(docs.higgsfield.estimate)],
      [/soul\/standard$/, json(docs.higgsfield.queued)],
      [
        /status$/,
        [
          () => {
            throw new TypeError("fetch failed");
          },
          json(docs.higgsfield.completed),
        ],
      ],
      [/cdn\.example\.com/, image()],
    ]);
    const { media, deps } = setup(env, fetch);
    await expect(generateImages(request, settings(), media, deps)).resolves.toMatchObject({ provider: "higgsfield" });
  });
});

describe("OpenAI", () => {
  const env = { OPENAI_API_KEY: "sk-test-abcdef" };

  it("asks for an exact 4:5 size and saves each base64 image", async () => {
    const two = { ...docs.openai.ok, data: [docs.openai.ok.data[0], docs.openai.ok.data[0]] };
    const { fetch, calls } = fakeFetch([[/api\.openai\.com\/v1\/images\/generations$/, json(two)]]);
    const { media, deps } = setup(env, fetch);
    const result = await generateImages({ ...request, count: 2, style: "warm film look", seed: 7 }, settings(), media, deps);
    expect(result.model).toBe("gpt-image-2.5-flare");
    expect(result.images.map((i) => basename(i.path))).toEqual([
      "20261124-153005-a-quiet-alpine-lake-at-sunrise-editorial-openai-1.png",
      "20261124-153005-a-quiet-alpine-lake-at-sunrise-editorial-openai-2.png",
    ]);
    const body = JSON.parse(calls[0]!.body);
    expect(body).toMatchObject({ model: "gpt-image-2.5-flare", n: 2, size: "1024x1280", output_format: "png" });
    expect(body.prompt).toContain("Style: warm film look");
    expect(calls[0]!.headers.authorization).toBe("Bearer sk-test-abcdef");
    expect(result.notes.join(" ")).toMatch(/seed/);
  });

  it("reports a moderation block, and never repeats the key in errors", async () => {
    const blockedFetch = fakeFetch([[/generations$/, json(docs.openai.moderation_blocked, 400)]]);
    const a = setup(env, blockedFetch.fetch);
    const blocked = await rejection(generateImages(request, settings(), a.media, a.deps));
    expect(blocked.message).toMatch(/safety filter/);

    const echo = fakeFetch([[/generations$/, json({ error: { message: "Incorrect API key provided: sk-test-abcdef" } }, 401)]]);
    const b = setup(env, echo.fetch);
    const auth = await rejection(generateImages(request, settings(), b.media, b.deps));
    expect(auth.message).not.toContain("sk-test-abcdef");
    expect(auth.message).toContain("[redacted]");
  });
});

describe("Gemini", () => {
  it("calls generateContent with the API key header and saves inline images", async () => {
    const { fetch, calls } = fakeFetch([[/generativelanguage\.googleapis\.com\/v1\/models\/gemini-nano-banana-2\.1:generateContent$/, json(docs.gemini.ok)]]);
    const { media, deps } = setup({ GEMINI_API_KEY: "AIza-test" }, fetch);
    const result = await generateImages({ ...request, count: 2 }, settings(), media, deps);
    expect(result.images).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("AIza-test");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } } });
  });

  it("treats an invalid key and an image safety stop as clear errors", async () => {
    const bad = fakeFetch([[/generateContent$/, json(docs.gemini.bad_key, 400)]]);
    const a = setup({ GEMINI_API_KEY: "AIza-test" }, bad.fetch);
    expect((await rejection(generateImages(request, settings(), a.media, a.deps))).message).toMatch(/rejected the API key/);
    const unsafe = fakeFetch([[/generateContent$/, json(docs.gemini.image_safety)]]);
    const b = setup({ GEMINI_API_KEY: "AIza-test" }, unsafe.fetch);
    expect((await rejection(generateImages(request, settings(), b.media, b.deps))).message).toMatch(/IMAGE_SAFETY/);
  });
});

describe("fal.ai", () => {
  it("queues, polls, fetches the result and drops images flagged by the safety checker", async () => {
    const result2 = { ...docs.fal.result, images: [docs.fal.result.images[0], { url: "https://v3.fal.media/files/out-2.png" }], has_nsfw_concepts: [false, true] };
    const { fetch, calls } = fakeFetch([
      [/api\.fal\.ai\/v1\/models\/pricing\/estimate$/, json(docs.fal.estimate)],
      [/queue\.fal\.run\/fal-ai\/flux\/dev$/, json(docs.fal.submitted)],
      [/\/status$/, [json(docs.fal.in_progress, 202), json(docs.fal.completed)]],
      [/queue\.fal\.run\/fal-ai\/flux\/requests\/[^/]+$/, json(result2)],
      [/v3\.fal\.media/, image()],
    ]);
    const { media, deps } = setup({ FAL_KEY: "fal-key-1:secret" }, fetch);
    const result = await generateImages({ ...request, count: 2, seed: 42 }, settings(), media, deps);
    expect(result).toMatchObject({ provider: "fal", model: "fal-ai/flux/dev", cost_usd: 0.033 });
    expect(result.images).toHaveLength(1);
    expect(result.notes.join(" ")).toMatch(/flagged/);
    const submit = calls.find((c) => c.url === "https://queue.fal.run/fal-ai/flux/dev")!;
    expect(submit.headers.authorization).toBe("Key fal-key-1:secret");
    expect(JSON.parse(submit.body)).toMatchObject({ image_size: { width: 1024, height: 1280 }, num_images: 2, seed: 42, output_format: "png" });
  });
});

describe("Replicate", () => {
  it("waits with Prefer, polls the prediction and downloads the output", async () => {
    const { fetch, calls } = fakeFetch([
      [/api\.replicate\.com\/v1\/models\/black-forest-labs\/flux-schnell\/predictions$/, json(docs.replicate.starting, 201)],
      [/api\.replicate\.com\/v1\/predictions\/[a-z0-9]+$/, json(docs.replicate.succeeded)],
      [/replicate\.delivery/, image()],
    ]);
    const { media, deps } = setup({ REPLICATE_API_TOKEN: "r8_token" }, fetch);
    const result = await generateImages({ ...request, aspectRatio: "1.91:1" }, settings({ provider: "replicate" }), media, deps);
    expect(result.images).toHaveLength(1);
    const create = calls[0]!;
    expect(create.headers.prefer).toBe("wait=60");
    expect(create.headers.authorization).toBe("Bearer r8_token");
    expect(JSON.parse(create.body)).toMatchObject({ input: { aspect_ratio: "16:9", num_outputs: 1, output_format: "png" } });
    expect(result.notes.join(" ")).toMatch(/16:9/);
  });
});

describe("Ideogram", () => {
  it("generates synchronously, quotes the price and leaves out unsafe images", async () => {
    const { fetch, calls } = fakeFetch([
      [/\?dry_run=true$/, json(docs.ideogram.quote)],
      [/api\.ideogram\.ai\/v2\/image\/generate\/ideogram-4-6$/, json(docs.ideogram.ok)],
      [/ideogram\.ai\/api\/images\/ephemeral/, image()],
    ]);
    const { media, deps } = setup({ IDEOGRAM_API_KEY: "ideo-key" }, fetch);
    const result = await generateImages({ ...request, count: 2 }, settings({ provider: "ideogram" }), media, deps);
    expect(result).toMatchObject({ cost_usd: 0.12, cost_kind: "quote" });
    expect(result.images).toHaveLength(1);
    expect(result.notes.join(" ")).toMatch(/safety check/);
    const gen = calls.find((c) => c.url.endsWith("/ideogram-4-6"))!;
    expect(gen.headers["api-key"]).toBe("ideo-key");
    expect(JSON.parse(gen.body)).toMatchObject({ size: "1024x1280", num_images: 2 });
  });

  it("maps a 422 to a safety rejection and a 402 to a billing problem", async () => {
    const unsafe = fakeFetch([[/dry_run/, json(docs.ideogram.quote)], [/ideogram-4-6$/, json({ detail: "Prompt failed safety check" }, 422)]]);
    const a = setup({ IDEOGRAM_API_KEY: "k" }, unsafe.fetch);
    expect((await rejection(generateImages(request, settings({ provider: "ideogram" }), a.media, a.deps))).message).toMatch(/safety/);
    const broke = fakeFetch([[/dry_run/, json(docs.ideogram.quote)], [/ideogram-4-6$/, json(docs.ideogram.insufficient_funds, 402)]]);
    const b = setup({ IDEOGRAM_API_KEY: "k" }, broke.fetch);
    const err = await rejection(generateImages(request, settings({ provider: "ideogram" }), b.media, b.deps));
    expect(err.message).toMatch(/no credit/);
    expect(err.nextStep).toMatch(/ideogram\.ai/);
  });
});

describe("downloads and failures", () => {
  const env = { HF_API_KEY_ID: "id", HF_API_KEY_SECRET: "secret" };
  const routes = (download: Handler): [RegExp, Handler | Handler[]][] => [
    [/\/estimate\//, json(docs.higgsfield.estimate)],
    [/soul\/standard$/, json(docs.higgsfield.queued)],
    [/status$/, json(docs.higgsfield.completed)],
    [/cdn\.example\.com/, download],
  ];

  it("refuses downloads that aren't real postable images or are too large", async () => {
    for (const [handler, pattern] of [
      [() => new Response("<html>sign in to wifi</html>", { status: 200 }), /isn't an image/],
      [() => new Response(new Uint8Array(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), { status: 200 }), /WEBP image/],
      [() => new Response("x", { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } }), /larger than/],
    ] as [Handler, RegExp][]) {
      const { fetch } = fakeFetch(routes(handler));
      const { media, deps } = setup(env, fetch);
      expect((await rejection(generateImages(request, settings(), media, deps))).message).toMatch(pattern);
    }
  });

  it("refuses non-https image URLs", async () => {
    const insecure = { ...docs.higgsfield.completed, images: [{ url: "http://cdn.example.com/image-1.png" }] };
    const { fetch } = fakeFetch([[/\/estimate\//, json(docs.higgsfield.estimate)], [/soul\/standard$/, json(docs.higgsfield.queued)], [/status$/, json(insecure)]]);
    const { media, deps } = setup(env, fetch);
    expect((await rejection(generateImages(request, settings(), media, deps))).message).toMatch(/not https/);
  });

  it("reports an unreachable provider as NETWORK and a blown deadline as TIMEOUT", async () => {
    const down = fakeFetch([]);
    const a = setup(env, down.fetch);
    expect((await rejection(generateImages(request, settings(), a.media, a.deps))).code).toBe("NETWORK");

    const slow = fakeFetch([
      [/\/estimate\//, json(docs.higgsfield.estimate)],
      [/soul\/standard$/, json(docs.higgsfield.queued)],
      [/status$/, json(docs.higgsfield.in_progress)],
    ]);
    const b = setup(env, slow.fetch);
    // Real sleeps against a 0-second budget: the first poll wait is aborted by the deadline.
    b.deps.sleep = (ms, signal) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(signal.reason);
        });
      });
    const err = await rejection(generateImages(request, { ...settings(), timeoutSeconds: 0.05 }, b.media, b.deps));
    expect(err.code).toBe("TIMEOUT");
  });
});

describe("choosing a provider", () => {
  it("explains what to do when none is set up", () => {
    const err = (() => {
      try {
        chooseProvider(settings(), {});
      } catch (e) {
        return e as LinkedInMcpError;
      }
      throw new Error("expected an error");
    })();
    expect(err.message).toMatch(/No AI image provider/);
    expect(err.nextStep).toMatch(/image_providers/);
  });

  it("uses the configured provider, the only one set up, or the first of several", () => {
    expect(chooseProvider(settings(), { IDEOGRAM_API_KEY: "k" })).toMatchObject({ provider: { id: "ideogram" }, chosenBy: "only_configured" });
    expect(chooseProvider(settings(), { IDEOGRAM_API_KEY: "k", OPENAI_API_KEY: "k" })).toMatchObject({ provider: { id: "openai" }, chosenBy: "first_configured" });
    expect(chooseProvider(settings({ provider: "ideogram" }), { IDEOGRAM_API_KEY: "k", OPENAI_API_KEY: "k" })).toMatchObject({ provider: { id: "ideogram" }, chosenBy: "config" });
    expect(chooseProvider(settings({ provider: "ideogram", model: "ideogram-4-5" }), { IDEOGRAM_API_KEY: "k", OPENAI_API_KEY: "k" }, "openai").model).toBe("gpt-image-2.5-flare");
    expect(chooseProvider(settings({ models: { fal: "fal-ai/flux-pro/v1.1" } }), { FAL_KEY: "k" }).model).toBe("fal-ai/flux-pro/v1.1");
    expect(() => chooseProvider(settings({ provider: "higgsfield" }), { OPENAI_API_KEY: "k" })).toThrow(/Higgsfield isn't set up/);
  });

  it("refuses model names that could escape the URL path", () => {
    for (const model of ["../../etc", "fal-ai/../x", "a b", "https://evil.example/x"]) {
      expect(() => chooseProvider(settings(), { FAL_KEY: "k" }, "fal", model)).toThrow(/isn't a valid/);
    }
    expect(() => chooseProvider(settings(), { REPLICATE_API_TOKEN: "k" }, "replicate", "owner/name/extra")).toThrow(/isn't a valid/);
  });

  it("lists every provider's status without exposing keys", () => {
    const status = providerStatus(settings(), { OPENAI_API_KEY: "sk-secret-value" });
    expect(status.map((s) => s.provider)).toEqual(["higgsfield", "openai", "gemini", "fal", "replicate", "ideogram"]);
    expect(status.find((s) => s.provider === "openai")).toMatchObject({ configured: true, active: true });
    expect(status.find((s) => s.provider === "higgsfield")!.setup).toMatch(/HF_API_KEY_ID \+ HF_API_KEY_SECRET/);
    expect(JSON.stringify(status)).not.toContain("sk-secret-value");
  });
});

describe("ImageJobs", () => {
  it("returns null while a job runs, the result once it's done, and its error if it fails", async () => {
    const jobs = new ImageJobs();
    let finish!: (v: never) => void;
    const id = jobs.start(() => new Promise((resolve) => (finish = resolve as never)));
    expect(await jobs.wait(id, 5)).toBeNull();
    finish({ provider: "openai", images: [] } as never);
    await expect(jobs.wait(id, 1000)).resolves.toMatchObject({ provider: "openai" });

    const failing = jobs.start(() => Promise.reject(new LinkedInMcpError("NETWORK", "down", "later")));
    await expect(jobs.wait(failing, 1000)).rejects.toMatchObject({ code: "NETWORK" });
    await expect(jobs.wait("img_missing", 10)).rejects.toThrow(/No image job/);
  });
});

describe("listMedia", () => {
  it("lists recent generated files, newest first, skipping symlinks and other folders", async () => {
    const media = join(tempDir(), "media");
    mkdirSync(join(media, "2026-10"), { recursive: true });
    mkdirSync(join(media, "2026-11"), { recursive: true });
    mkdirSync(join(media, "drafts"), { recursive: true });
    writeFileSync(join(media, "2026-10", "old.png"), PNG);
    writeFileSync(join(media, "2026-11", "deck.pdf"), "%PDF-1.7");
    writeFileSync(join(media, "2026-11", "notes.txt"), "x");
    writeFileSync(join(media, "drafts", "hidden.png"), PNG);
    const { utimesSync } = await import("node:fs");
    utimesSync(join(media, "2026-10", "old.png"), new Date(2026, 9, 1), new Date(2026, 9, 1));
    if (process.platform !== "win32") symlinkSync(join(media, "2026-10", "old.png"), join(media, "2026-11", "link.png"));

    const all = await listMedia(media, 10);
    expect(all.files.map((f) => f.name)).toEqual(["deck.pdf", "old.png"]);
    expect(all.files[0]).toMatchObject({ kind: "document" });
    expect((await listMedia(media, 10, "image")).files.map((f) => f.name)).toEqual(["old.png"]);
    expect(await listMedia(media, 1)).toMatchObject({ total: 2 });
    expect(await listMedia(join(media, "missing"), 5)).toEqual({ files: [], total: 0 });
  });
});

describe("image and brand settings", () => {
  it("reads config.json and lets env vars override it", () => {
    const home = tempDir();
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ images: { provider: "fal", models: { fal: "fal-ai/flux-pro/v1.1" }, timeoutSeconds: 120 }, brand: { theme: "paper", accentColor: "#C2410C", name: "Ada" } }),
    );
    const fromFile = loadConfig({ LINKEDIN_MCP_HOME: home });
    expect(fromFile.images).toEqual({ provider: "fal", model: undefined, models: { fal: "fal-ai/flux-pro/v1.1" }, timeoutSeconds: 120 });
    expect(fromFile.brand).toMatchObject({ theme: "paper", accentColor: "#C2410C", name: "Ada", webFonts: true });

    const fromEnv = loadConfig({
      LINKEDIN_MCP_HOME: home,
      LINKEDIN_MCP_IMAGE_PROVIDER: "Ideogram",
      LINKEDIN_MCP_IMAGE_MODEL: "ideogram-4-5",
      LINKEDIN_MCP_BRAND_THEME: "cobalt",
      LINKEDIN_MCP_BRAND_PRIMARY: "#112233",
      LINKEDIN_MCP_BRAND_FONT: "fraunces",
      LINKEDIN_MCP_WEB_FONTS: "false",
    });
    expect(fromEnv.images).toMatchObject({ provider: "ideogram", model: "ideogram-4-5" });
    expect(fromEnv.brand).toMatchObject({ theme: "cobalt", primaryColor: "#112233", accentColor: "#C2410C", font: "fraunces", webFonts: false });
  });

  it("rejects unknown providers, themes, fonts and colors", () => {
    const home = tempDir();
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_IMAGE_PROVIDER: "midjourney" })).toThrow(/LINKEDIN_MCP_IMAGE_PROVIDER must be one of/);
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_BRAND_PRIMARY: "blue" })).toThrow(/hex color/);
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_BRAND_FONT: "comic-sans" })).toThrow(/LINKEDIN_MCP_BRAND_FONT/);
    writeFileSync(join(home, "config.json"), JSON.stringify({ brand: { theme: "neon" } }));
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: home })).toThrow(/invalid settings/);
  });
});
