import { randomBytes } from "node:crypto";
import { LinkedInMcpError, toMcpError } from "../errors.js";
import type { ImageProviderId } from "./constants.js";
import { EXTENSION, POSTABLE, imageSize, sniffImage } from "./image-file.js";
import { saveMedia, slugify } from "./media.js";
import { type ProviderContext, downloadImage, sleep, systemLookup } from "./net.js";
import { type ImageSettings, chooseProvider } from "./providers/index.js";
import type { Cost, FetchFn, GenerateRequest, LookupFn, ProviderImage } from "./types.js";

/**
 * Provider-agnostic generation: pick the provider and model, run it under a
 * deadline, download and check every image, and save it to the media folder.
 */

const MB = 1024 * 1024;
const LINKEDIN_IMAGE_MAX = 10 * MB;

export interface GenerateDeps {
  fetch: FetchFn;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  random: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** DNS for download checks; the system resolver when absent. */
  lookup?: LookupFn;
}

export const defaultGenerateDeps = (): GenerateDeps => ({ fetch: globalThis.fetch, env: process.env, now: () => new Date(), random: Math.random, sleep, lookup: systemLookup });

export interface GeneratedFile {
  path: string;
  width?: number;
  height?: number;
  size_kb: number;
}

export interface GenerateResult {
  provider: ImageProviderId;
  provider_name: string;
  model: string;
  images: GeneratedFile[];
  cost_usd?: number;
  cost_kind?: Cost["kind"];
  notes: string[];
}

export interface GenerateOptions extends GenerateRequest {
  provider?: ImageProviderId;
  model?: string;
}

async function toBytes(img: ProviderImage, ctx: ProviderContext, allowHosts: readonly string[] | null, deps: GenerateDeps, signal: AbortSignal): Promise<Buffer> {
  if ("data" in img) return img.data;
  return downloadImage(ctx, { fetch: deps.fetch, signal, sleep: deps.sleep, random: deps.random, lookup: deps.lookup }, img.url, { allowHosts });
}

export async function generateImages(opts: GenerateOptions, settings: ImageSettings, mediaDir: string, deps: GenerateDeps): Promise<GenerateResult> {
  const choice = chooseProvider(settings, deps.env, opts.provider, opts.model);
  const { provider, credentials, model } = choice;
  const ctx: ProviderContext = { label: provider.label, envHint: provider.envSets.flat().join(" / "), billingUrl: provider.keysUrl, secrets: [credentials] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("generation deadline")), settings.timeoutSeconds * 1000);
  try {
    const out = await provider.generate({ ...opts, model }, credentials, { fetch: deps.fetch, signal: controller.signal, sleep: deps.sleep, random: deps.random, lookup: deps.lookup });
    const notes = [...out.notes];
    if (choice.chosenBy === "first_configured") notes.push(`Several providers are set up; used ${provider.label}. Set LINKEDIN_MCP_IMAGE_PROVIDER to choose one.`);
    const buffers = await Promise.all(out.images.slice(0, opts.count).map((img) => toBytes(img, ctx, provider.resultHosts, deps, controller.signal)));
    const now = deps.now();
    const slug = slugify(opts.prompt, 40);
    const images: GeneratedFile[] = [];
    for (const [i, data] of buffers.entries()) {
      const type = sniffImage(data);
      if (!type) throw new LinkedInMcpError("INTERNAL", `${provider.label} returned something that isn't an image.`, "Try again, or use another model.", { provider: provider.id });
      if (!POSTABLE.has(type)) {
        throw new LinkedInMcpError("INVALID_INPUT", `${provider.label} returned a ${type.toUpperCase()} image, which LinkedIn posts don't accept.`, "Choose a model that outputs PNG or JPEG.", { provider: provider.id, model });
      }
      if (data.length > LINKEDIN_IMAGE_MAX) notes.push(`Image ${i + 1} is ${(data.length / MB).toFixed(1)} MB, over LinkedIn's 10 MB limit, so it can't be attached as is.`);
      const name = `${slug}-${provider.id}${buffers.length > 1 ? `-${i + 1}` : ""}`;
      const path = await saveMedia(mediaDir, now, name, EXTENSION[type], data);
      const size = imageSize(data);
      images.push({ path, ...(size ?? {}), size_kb: Math.max(1, Math.round(data.length / 1024)) });
    }
    if (images.length < opts.count) notes.push(`Asked for ${opts.count} images; ${provider.label} returned ${images.length}.`);
    return {
      provider: provider.id,
      provider_name: provider.label,
      model,
      images,
      ...(out.cost ? { cost_usd: out.cost.usd, cost_kind: out.cost.kind } : {}),
      notes,
    };
  } catch (err) {
    if (controller.signal.aborted && !(err instanceof LinkedInMcpError)) {
      throw new LinkedInMcpError(
        "TIMEOUT",
        `${provider.label} didn't finish within ${settings.timeoutSeconds} seconds.`,
        "Try again with a simpler prompt or fewer images, or raise images.timeoutSeconds in config.json.",
        { provider: provider.id },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface Job {
  promise: Promise<GenerateResult>;
  settled: boolean;
  startedAt: number;
}

const JOB_TTL_MS = 60 * 60_000;

/**
 * Generations that outlive one tool call. A call waits as long as the MCP
 * client allows; if the provider is still working, the job keeps running
 * here and a later call picks up the result by job_id.
 */
export class ImageJobs {
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly now: () => number = Date.now) {}

  start(run: () => Promise<GenerateResult>): string {
    this.prune();
    const id = `img_${randomBytes(6).toString("hex")}`;
    const job: Job = { promise: run(), settled: false, startedAt: this.now() };
    // Waiters see the outcome; the stored promise never raises an unhandled rejection.
    job.promise.then(
      () => (job.settled = true),
      () => (job.settled = true),
    );
    this.jobs.set(id, job);
    return id;
  }

  /** The result, or null if it's still running after `waitMs`. Throws the generation's error. */
  async wait(id: string, waitMs: number): Promise<GenerateResult | null> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new LinkedInMcpError("INVALID_INPUT", `No image job ${id}. Jobs are kept for an hour while the server runs.`, "Call list_media to see what was saved, or generate again.");
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, waitMs));
    });
    try {
      return await Promise.race([job.promise, timeout]);
    } catch (err) {
      throw toMcpError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private prune(): void {
    const cutoff = this.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) if (job.settled && job.startedAt < cutoff) this.jobs.delete(id);
  }
}
