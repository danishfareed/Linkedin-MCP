import { describe, expect, it } from "vitest";
import { ArgError, parseArgs } from "../../src/args.js";

describe("parseArgs", () => {
  it("defaults to serve over stdio", () => {
    expect(parseArgs([])).toMatchObject({ command: "serve", http: false, port: undefined });
  });

  it("parses commands and flags", () => {
    expect(parseArgs(["login", "--keep-open"])).toMatchObject({ command: "login", keepOpen: true });
    expect(parseArgs(["logout", "-y"])).toMatchObject({ command: "logout", yes: true });
    expect(parseArgs(["status", "--verify"])).toMatchObject({ command: "status", verify: true });
    expect(parseArgs(["doctor", "--offline"])).toMatchObject({ command: "doctor", offline: true });
    expect(parseArgs(["--http", "--port", "4000"])).toMatchObject({ command: "serve", http: true, port: 4000 });
    expect(parseArgs(["serve", "--http", "--port=4001", "--headed", "--dry-run"])).toMatchObject({ http: true, port: 4001, headed: true, dryRun: true });
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-v"]).command).toBe("version");
  });

  it("rejects bad input with a helpful message", () => {
    expect(() => parseArgs(["launch"])).toThrow(ArgError);
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--http", "--port", "99999"])).toThrow(/--port/);
    expect(() => parseArgs(["--port", "4000"])).toThrow(/only applies with --http/);
    expect(() => parseArgs(["login", "--http"])).toThrow(/only applies to the serve/);
    expect(() => parseArgs(["login", "status"])).toThrow(/Unexpected argument/);
  });
});
