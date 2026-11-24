import type { LookupFunction } from "node:net";
import type { AspectRatio, ImageProviderId } from "./constants.js";

export type FetchFn = typeof fetch;

/** DNS lookup returning every address for a host (dns.promises.lookup with all: true). */
export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** A response from the download transport. Header names are matched case-insensitively. */
export interface DownloadResponse {
  status: number;
  header(name: string): string | undefined;
  body: AsyncIterable<Uint8Array>;
  /** Stop reading and close the connection. */
  close(): void;
}

/**
 * Fetch one URL for a download, without following redirects. `lookup` is
 * the Node-style lookup the connection must use, so the address checked is
 * the address connected to. Injectable so tests never touch the network.
 */
export type DownloadTransport = (url: URL, init: { signal: AbortSignal; lookup: LookupFunction }) => Promise<DownloadResponse>;

/** What the assistant asks for, provider-agnostic. */
export interface GenerateRequest {
  prompt: string;
  aspectRatio: AspectRatio;
  /** 1 to 4. */
  count: number;
  style?: string;
  negativePrompt?: string;
  seed?: number;
}

/** A request as one adapter receives it, with the model already resolved. */
export interface ProviderRequest extends GenerateRequest {
  model: string;
}

export interface Cost {
  usd: number;
  /** quote: the provider priced this exact request; estimate: the provider's typical price. */
  kind: "quote" | "estimate";
}

/** One image as the provider returned it: a URL to download, or the bytes themselves. */
export type ProviderImage = { url: string } | { data: Buffer };

export interface ProviderOutput {
  images: ProviderImage[];
  cost?: Cost;
  /** Things the user should know, for example an option this provider ignores. */
  notes: string[];
}

/** Everything an adapter needs from outside, injectable for tests. */
export interface ProviderDeps {
  fetch: FetchFn;
  /** Aborts when the overall generation time is up. */
  signal: AbortSignal;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** For polling jitter and idempotency keys. */
  random: () => number;
  /** DNS for download checks; the system resolver when absent. */
  lookup?: LookupFn;
  /** How downloads connect; node:https with the pinned lookup when absent. */
  transport?: DownloadTransport;
}

export interface ProviderInfo {
  id: ImageProviderId;
  label: string;
  defaultModel: string;
  /** Env vars that configure it, as alternatives: any one complete set works. */
  envSets: string[][];
  keysUrl: string;
  docsUrl: string;
  /**
   * Hosts (and their subdomains) that result images may be downloaded from.
   * [] means this provider returns image bytes and nothing is ever
   * downloaded; null means any public https host, for providers whose file
   * host isn't documented.
   */
  resultHosts: readonly string[] | null;
  /** One line on what it is good at and how it bills. */
  summary: string;
}

export interface ImageProvider extends ProviderInfo {
  /** Credentials from the environment, or null when not set up. Never logged or returned. */
  credentials(env: NodeJS.ProcessEnv): string | null;
  /** Rejects model names that could not be a valid path segment for this provider. */
  validModel(model: string): boolean;
  generate(req: ProviderRequest, credentials: string, deps: ProviderDeps): Promise<ProviderOutput>;
}
