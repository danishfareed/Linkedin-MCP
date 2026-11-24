export const ERROR_CODES = [
  "NOT_LOGGED_IN",
  "LIMIT_REACHED",
  "OUTSIDE_WORKING_HOURS",
  "CIRCUIT_OPEN",
  "SELECTOR_BROKEN",
  "CONFIRMATION_INVALID",
  "CHECKPOINT",
  "TIMEOUT",
  "INVALID_INPUT",
  "BROWSER_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const REPORT_SELECTOR_URL =
  "https://github.com/danishfareed/Linkedin-MCP/issues/new?labels=broken-selector&title=Broken%20selector";

/**
 * The only error type tools should throw on purpose. Every instance carries a
 * stable `code`, a human message, and a `nextStep` the assistant can relay.
 */
export class LinkedInMcpError extends Error {
  readonly code: ErrorCode;
  readonly nextStep: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, nextStep: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "LinkedInMcpError";
    this.code = code;
    this.nextStep = nextStep;
    this.details = details;
  }

  toJSON(): ErrorPayload {
    return {
      error: {
        code: this.code,
        message: this.message,
        next_step: this.nextStep,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export interface ErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    next_step: string;
    details?: Record<string, unknown>;
  };
}

export function invalidInput(message: string, details?: Record<string, unknown>): LinkedInMcpError {
  return new LinkedInMcpError("INVALID_INPUT", message, "Fix the input and try again.", details);
}

export function selectorBroken(name: string, details?: Record<string, unknown>): LinkedInMcpError {
  return new LinkedInMcpError(
    "SELECTOR_BROKEN",
    `Could not find "${name}" on the LinkedIn page. LinkedIn may have changed its layout.`,
    `Run \`npx @danishfareed/linkedin-mcp doctor\` to see which parts are affected, and report it at ${REPORT_SELECTOR_URL}`,
    { selector: name, ...details },
  );
}

export function notLoggedIn(): LinkedInMcpError {
  return new LinkedInMcpError(
    "NOT_LOGGED_IN",
    "You are not signed in to LinkedIn in the automation browser.",
    "Run `npx @danishfareed/linkedin-mcp login` in a terminal, sign in in the window that opens, then try again.",
  );
}

/** Normalise anything thrown into a LinkedInMcpError. */
export function toMcpError(err: unknown): LinkedInMcpError {
  if (err instanceof LinkedInMcpError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && (err.name === "TimeoutError" || /Timeout \d+ms exceeded/i.test(message))) {
    return new LinkedInMcpError(
      "TIMEOUT",
      "LinkedIn took too long to respond.",
      "Try again in a minute. If it keeps happening, run `npx @danishfareed/linkedin-mcp doctor`.",
      { cause: message.split("\n")[0] },
    );
  }
  return new LinkedInMcpError(
    "INTERNAL",
    `Unexpected error: ${message.split("\n")[0]}`,
    "Try again. If it keeps happening, open an issue at https://github.com/danishfareed/Linkedin-MCP/issues",
  );
}
