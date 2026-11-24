import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

const LOCK_RETRY_MS = 40;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

/** In-process queue per file so callers in the same process never race. */
const localQueues = new Map<string, Promise<unknown>>();

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
}

/**
 * Cross-process advisory lock using an exclusive lock file. Stale locks
 * (left by a crashed process) are broken after LOCK_STALE_MS.
 */
async function acquireFileLock(path: string): Promise<() => Promise<void>> {
  const lockPath = `${path}.lock`;
  await ensureDir(lockPath);
  const started = Date.now();
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await fs.rm(lockPath, { force: true });
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
      } catch {
        continue; // lock vanished between open and stat; retry immediately
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for lock on ${path}`);
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
  }
}

export async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = localQueues.get(path) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const release = await acquireFileLock(path);
    try {
      return await fn();
    } finally {
      await release();
    }
  });
  localQueues.set(path, run);
  try {
    return await run;
  } finally {
    if (localQueues.get(path) === run) localQueues.delete(path);
  }
}

/**
 * Read a JSON file. Missing file returns the fallback. A corrupt file is moved
 * aside (never silently overwritten) and the fallback is returned.
 */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(fallback);
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    const aside = `${path}.corrupt-${Date.now()}`;
    await fs.rename(path, aside).catch(() => undefined);
    console.error(`[linkedin-mcp] ${path} was not valid JSON; moved it to ${aside}`);
    return structuredClone(fallback);
  }
}

/** Write JSON atomically: temp file in the same directory, then rename. */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await ensureDir(path);
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    await fs.rename(tmp, path);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/** Locked read-modify-write. Returns the value that was written. */
export async function updateJson<T>(path: string, fallback: T, mutate: (current: T) => T | Promise<T>): Promise<T> {
  return withFileLock(path, async () => {
    const current = await readJson(path, fallback);
    const next = await mutate(current);
    await writeJsonAtomic(path, next);
    return next;
  });
}

/** Append one line to a JSONL file under the lock. */
export async function appendJsonLine(path: string, record: unknown): Promise<void> {
  await withFileLock(path, async () => {
    await ensureDir(path);
    await fs.appendFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  });
}
