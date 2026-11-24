import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { appendJsonLine } from "../state/store.js";
import { type Clock, systemClock } from "../util/time.js";

/**
 * - success: the write was verified on the page.
 * - unconfirmed: the final click happened but the result couldn't be verified.
 * - not_sent: stopped before the final click (already pending, upsell…).
 * - failed: an error before the final click; nothing was sent.
 */
export type AuditResult = "success" | "unconfirmed" | "not_sent" | "failed" | "dry_run" | "guard_tripped" | "paused" | "resumed";

export interface AuditRecord {
  time: string;
  tool: string;
  target: string | null;
  /** sha256 of the text that was sent (first 16 hex chars). The text itself is never logged. */
  text_hash: string | null;
  result: AuditResult;
  error_code?: string;
  /** For unconfirmed and not_sent: the short reason. */
  reason?: string;
  detail?: string;
}

export function hashText(text: string | undefined | null): string | null {
  if (!text) return null;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Append-only JSONL log of every write action and every guard trip. */
export class AuditLog {
  constructor(
    private readonly file: string,
    private readonly clock: Clock = systemClock,
  ) {}

  async record(entry: Omit<AuditRecord, "time">): Promise<void> {
    await appendJsonLine(this.file, { time: this.clock().toISOString(), ...entry });
  }

  /** Most recent entries first. */
  async recent(limit = 50): Promise<AuditRecord[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const lines = raw.split("\n").filter(Boolean);
    const out: AuditRecord[] = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        out.push(JSON.parse(lines[i]!) as AuditRecord);
      } catch {
        // skip a torn line
      }
    }
    return out;
  }
}
