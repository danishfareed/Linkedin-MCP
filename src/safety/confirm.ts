import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { LinkedInMcpError } from "../errors.js";
import { type Clock, systemClock } from "../util/time.js";

export const TOKEN_TTL_MS = 10 * 60_000;

export interface PendingAction<P = unknown> {
  /** Executor key, e.g. "create_post". */
  kind: string;
  /** Exact parameters the executor will receive. Frozen at preview time. */
  params: P;
  /** What the user is shown. Must describe exactly what will be sent. */
  preview: Record<string, unknown>;
}

interface StoredAction extends PendingAction {
  id: string;
  hash: string;
  expiresAt: number;
}

export interface ConfirmationTicket {
  status: "awaiting_confirmation";
  preview: Record<string, unknown>;
  confirmation_token: string;
  expires_at: string;
  instructions: string;
}

export const CONFIRM_INSTRUCTIONS =
  "Nothing has been sent. Show this preview to the user exactly as written and ask whether to go ahead. " +
  "Only call confirm_action with this token after the user clearly says yes. If they want changes, call this tool again with the new content.";

/** Stable JSON with sorted keys, so the same parameters always hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function hashParams(kind: string, params: unknown): string {
  return createHash("sha256").update(kind).update("\0").update(canonicalJson(params)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

function invalid(message: string, nextStep = "Call the original tool again to get a fresh preview and token."): LinkedInMcpError {
  return new LinkedInMcpError("CONFIRMATION_INVALID", message, nextStep);
}

/**
 * Preview → token → execute. Tokens are single-use, expire after 10 minutes,
 * and carry an HMAC over the hash of the exact parameters, so a token can only
 * ever run the action that was previewed.
 */
export class ConfirmationManager {
  private readonly secret = randomBytes(32);
  private readonly pending = new Map<string, StoredAction>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly ttlMs: number = TOKEN_TTL_MS,
  ) {}

  private sign(id: string, hash: string, expiresAt: number): string {
    return createHmac("sha256", this.secret).update(`${id}.${hash}.${expiresAt}`).digest("base64url");
  }

  create<P>(action: PendingAction<P>): ConfirmationTicket {
    this.sweep();
    const params = deepFreeze(structuredClone(action.params));
    const id = randomBytes(12).toString("base64url");
    const hash = hashParams(action.kind, params);
    const expiresAt = this.clock().getTime() + this.ttlMs;
    this.pending.set(id, { kind: action.kind, params, preview: action.preview, id, hash, expiresAt });
    return {
      status: "awaiting_confirmation",
      preview: action.preview,
      confirmation_token: `${id}.${this.sign(id, hash, expiresAt)}`,
      expires_at: new Date(expiresAt).toISOString(),
      instructions: CONFIRM_INSTRUCTIONS,
    };
  }

  /**
   * Validates and consumes a token. The token is burned before the caller
   * executes, so a failed or repeated call can never send twice.
   */
  redeem(token: string): PendingAction {
    const [id, mac] = token.trim().split(".");
    if (!id || !mac) throw invalid("That confirmation token is not valid.");
    const stored = this.pending.get(id);
    if (!stored) throw invalid("That confirmation token is unknown or was already used.");
    this.pending.delete(id);

    if (this.clock().getTime() > stored.expiresAt) {
      throw invalid("That confirmation token has expired (tokens last 10 minutes).");
    }
    const expected = Buffer.from(this.sign(id, hashParams(stored.kind, stored.params), stored.expiresAt));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw invalid("That confirmation token does not match the previewed action.");
    }
    if (hashParams(stored.kind, stored.params) !== stored.hash) {
      throw invalid("The previewed action changed after the token was issued.");
    }
    return { kind: stored.kind, params: stored.params, preview: stored.preview };
  }

  /** Drop a pending token without executing (user said no). Returns whether it existed. */
  cancel(token: string): boolean {
    const [id] = token.trim().split(".");
    return id ? this.pending.delete(id) : false;
  }

  size(): number {
    this.sweep();
    return this.pending.size;
  }

  private sweep(): void {
    const now = this.clock().getTime();
    for (const [id, action] of this.pending) {
      if (now > action.expiresAt) this.pending.delete(id);
    }
  }
}
