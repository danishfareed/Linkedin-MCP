import { createRequire } from "node:module";
import { Pacer } from "./browser/human.js";
import { BrowserSession, type Nav } from "./browser/session.js";
import type { Config } from "./config.js";
import { AuditLog } from "./safety/audit.js";
import { ConfirmationManager } from "./safety/confirm.js";
import { CircuitBreaker } from "./safety/guard.js";
import { Limits } from "./safety/limits.js";
import { AccountStore } from "./state/account.js";
import { type Clock, systemClock } from "./util/time.js";

const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;

/** Everything a tool needs, created once per process and shared by all MCP sessions. */
export interface AppContext {
  config: Config;
  clock: Clock;
  limits: Limits;
  breaker: CircuitBreaker;
  audit: AuditLog;
  confirm: ConfirmationManager;
  account: AccountStore;
  pacer: Pacer;
  session: BrowserSession;
}

export function createContext(config: Config, clock: Clock = systemClock): AppContext {
  const limits = new Limits(config.paths.limitsFile, () => config.limits, clock);
  const breaker = new CircuitBreaker(config.paths.breakerFile, clock);
  const audit = new AuditLog(config.paths.auditFile, clock);
  const pacer = new Pacer();
  const session = new BrowserSession({ config, breaker, limits, audit, pacer });
  return {
    config,
    clock,
    limits,
    breaker,
    audit,
    confirm: new ConfirmationManager(clock),
    account: new AccountStore(config.paths.accountFile),
    pacer,
    session,
  };
}

/** Run browser work for a signed-in account. Fails fast (no page load) when the session cookie is missing. */
export function withBrowser<T>(ctx: AppContext, fn: (nav: Nav) => Promise<T>): Promise<T> {
  return ctx.session.run(async (nav) => {
    await nav.requireSessionCookie();
    return fn(nav);
  });
}
