import { readFile } from "node:fs/promises";
import { LinkedInMcpError } from "../../errors.js";
import { type WriteAttempt, type WriteResult, notSent, sent, unconfirmed } from "../outcome.js";
import type { ApiToken } from "./token.js";

/**
 * LinkedIn's official Posts API, used with the member's own developer app
 * (scope w_member_social). Publishing only: scheduling, analytics, comments
 * and messages stay on the browser path.
 */

export const API = "https://api.linkedin.com";

/**
 * LinkedIn-Version header (YYYYMM). LinkedIn supports each monthly version for
 * about a year, so two months back is always live. Override in config.
 */
export function apiVersion(now: Date, override?: string): string {
  if (override) return override;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Characters LinkedIn's "little text" commentary format treats as markup.
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
// A hashtag starts a word: "#mcp", "(#mcp", not "a#b" or "&#123".
const HASHTAG = /(^|[^\p{L}\p{N}_&\\/])#([\p{L}\p{N}_]+)/gu;

function escapeLittle(s: string): string {
  return s.replace(RESERVED, "\\$&");
}

/**
 * Text as written, in LinkedIn's commentary format: reserved characters are
 * escaped so nothing is swallowed as markup, and #hashtags become hashtag
 * templates so they stay clickable.
 */
export function escapeCommentary(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const start = m.index! + m[1]!.length;
    out += escapeLittle(text.slice(last, start)) + `{hashtag|\\#|${escapeLittle(m[2]!)}}`;
    last = start + 1 + m[2]!.length;
  }
  return out + escapeLittle(text.slice(last));
}

export interface ApiPost {
  text: string;
  images: string[];
  visibility: "anyone" | "connections";
}

export function buildPostBody(author: string, text: string, visibility: ApiPost["visibility"], imageUrns: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    author,
    commentary: escapeCommentary(text),
    visibility: visibility === "connections" ? "CONNECTIONS" : "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (imageUrns.length === 1) body.content = { media: { id: imageUrns[0], altText: "" } };
  else if (imageUrns.length > 1) body.content = { multiImage: { images: imageUrns.map((id) => ({ id, altText: "" })) } };
  return body;
}

export function postUrlFromUrn(urn: string | null): string | null {
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
}

interface ClientOpts {
  version?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function headers(token: ApiToken, opts: ClientOpts): Record<string, string> {
  return {
    Authorization: `Bearer ${token.access_token}`,
    "LinkedIn-Version": apiVersion(opts.now?.() ?? new Date(), opts.version),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

async function bodyText(r: Response): Promise<string> {
  try {
    return (await r.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/** A non-2xx response before anything was published: an error, and nothing was sent. */
async function apiError(r: Response, step: string): Promise<LinkedInMcpError> {
  const text = await bodyText(r);
  if (r.status === 401) {
    return new LinkedInMcpError("NOT_LOGGED_IN", `LinkedIn's API rejected the connection while ${step} (401). It expired or was revoked.`, "Run `npx @danishfareed/linkedin-mcp connect-api` to reconnect, or set LINKEDIN_MCP_POST_VIA=browser.", { status: 401 });
  }
  if (r.status === 403) {
    return new LinkedInMcpError("NOT_LOGGED_IN", `Your LinkedIn app isn't allowed to do this (403 while ${step}).`, 'Check the app has the "Share on LinkedIn" product, then run connect-api again.', { status: 403, body: text });
  }
  if (r.status === 429) {
    return new LinkedInMcpError("RATE_LIMITED", "LinkedIn's API limit for your app was reached.", "Try again tomorrow, or set LINKEDIN_MCP_POST_VIA=browser to post through the browser.", { status: 429 });
  }
  return new LinkedInMcpError("INTERNAL", `LinkedIn's API returned ${r.status} while ${step}: ${text}`, "Try again in a minute. If it keeps happening, set LINKEDIN_MCP_POST_VIA=browser.", { status: r.status });
}

/** Uploads one image and returns its urn:li:image. Nothing is published yet. */
export async function uploadImage(token: ApiToken, path: string, opts: ClientOpts = {}): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const init = await fetchImpl(`${API}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: headers(token, opts),
    body: JSON.stringify({ initializeUploadRequest: { owner: token.author_urn } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!init.ok) throw await apiError(init, "preparing an image upload");
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  const put = await fetchImpl(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token.access_token}` },
    body: new Uint8Array(await readFile(path)),
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw await apiError(put, "uploading an image");
  return value.image;
}

/**
 * Publishes a post. Image uploads come first (nothing is public yet); the
 * create request is the commit point. After it, a 2xx is `sent`, a 4xx means
 * LinkedIn refused (`not_sent`), and a 5xx or a lost connection is
 * `unconfirmed`, because the post may exist.
 */
export async function publishViaApi(token: ApiToken, post: ApiPost, attempt: WriteAttempt, opts: ClientOpts = {}): Promise<WriteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const imageUrns: string[] = [];
  for (const path of post.images) imageUrns.push(await uploadImage(token, path, opts));
  const body = JSON.stringify(buildPostBody(token.author_urn, post.text, post.visibility, imageUrns));

  attempt.commit("api_create_post");
  const r = await fetchImpl(`${API}/rest/posts`, { method: "POST", headers: headers(token, opts), body, signal: AbortSignal.timeout(30_000) });

  if (r.ok) {
    const urn = r.headers.get("x-restli-id") ?? r.headers.get("x-linkedin-id");
    return sent({ via: "api", post_urn: urn, post_url: postUrlFromUrn(urn) });
  }
  const text = await bodyText(r);
  if (r.status >= 500) return unconfirmed("api_server_error", `LinkedIn's API answered ${r.status} after the post was submitted, so it may or may not be live.`, { via: "api" });
  if (r.status === 401) return notSent("api_unauthorized", "LinkedIn rejected the API connection (expired or revoked).", { next_step: "Run `npx @danishfareed/linkedin-mcp connect-api` to reconnect, then try again." });
  if (r.status === 403) return notSent("api_forbidden", "Your LinkedIn app isn't allowed to post.", { next_step: 'Add the "Share on LinkedIn" product to your app, then run connect-api again.' });
  if (r.status === 429) return notSent("api_rate_limited", "LinkedIn's API limit for your app was reached.", { next_step: "Try again tomorrow, or set LINKEDIN_MCP_POST_VIA=browser." });
  if (/duplicate/i.test(text)) return notSent("duplicate", "LinkedIn rejected this as a duplicate of a recent post.", { next_step: "Change the text before posting again." });
  return notSent("api_rejected", `LinkedIn's API refused the post (${r.status}): ${text}`, { next_step: "Fix the problem LinkedIn reported, or set LINKEDIN_MCP_POST_VIA=browser." });
}
