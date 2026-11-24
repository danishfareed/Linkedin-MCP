import { promises as fs } from "node:fs";
import type { Paths } from "../../config.js";
import { readJson, writeJsonAtomic } from "../../state/store.js";

/**
 * The member access token from LinkedIn's OAuth flow, stored in the data
 * folder with owner-only permissions. LinkedIn issues 60-day tokens and only
 * gives refresh tokens to approved partners, so the user reconnects when it
 * expires.
 */
export interface ApiToken {
  access_token: string;
  /** Epoch milliseconds. */
  expires_at: number;
  /** urn:li:person:<id>, the author of posts. */
  author_urn: string;
  name: string | null;
  scope: string | null;
  connected_at: string;
}

/** Treat a token as expired a few minutes early so a post never starts on one that's about to lapse. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
const SOON_MS = 7 * 86_400_000;

export async function readApiToken(paths: Paths): Promise<ApiToken | null> {
  const tok = await readJson<ApiToken | null>(paths.apiTokenFile, null);
  return tok && typeof tok.access_token === "string" && typeof tok.author_urn === "string" ? tok : null;
}

export async function saveApiToken(paths: Paths, token: ApiToken): Promise<void> {
  await writeJsonAtomic(paths.apiTokenFile, token);
}

export async function deleteApiToken(paths: Paths): Promise<boolean> {
  try {
    await fs.rm(paths.apiTokenFile);
    return true;
  } catch {
    return false;
  }
}

export function tokenUsable(token: ApiToken | null, now: Date): token is ApiToken {
  return Boolean(token && token.expires_at - EXPIRY_MARGIN_MS > now.getTime());
}

export interface ApiStatus {
  configured: boolean;
  connected: boolean;
  name?: string | null;
  expires_at?: string;
  expires_in_days?: number;
  note?: string;
}

/** For session_status, status and doctor. Reads files only; never calls LinkedIn. */
export async function apiStatus(paths: Paths, credentials: { clientId?: string; clientSecret?: string }, now: Date): Promise<ApiStatus> {
  const configured = Boolean(credentials.clientId && credentials.clientSecret);
  const token = await readApiToken(paths);
  if (!token) {
    return {
      configured,
      connected: false,
      note: configured
        ? "Your LinkedIn developer app is set up but not connected. Run `npx @danishfareed/linkedin-mcp connect-api`."
        : "Optional: connect your own LinkedIn developer app to publish posts through LinkedIn's official API. See the README.",
    };
  }
  const left = token.expires_at - now.getTime();
  const usable = tokenUsable(token, now);
  return {
    configured,
    connected: usable,
    name: token.name,
    expires_at: new Date(token.expires_at).toISOString(),
    expires_in_days: Math.max(0, Math.round((left / 86_400_000) * 10) / 10),
    ...(usable
      ? left < SOON_MS
        ? { note: "The API connection expires within a week. Run `npx @danishfareed/linkedin-mcp connect-api` to renew it." }
        : {}
      : { note: "The API connection has expired, so posts go through the browser. Run `npx @danishfareed/linkedin-mcp connect-api` to renew it." }),
  };
}
