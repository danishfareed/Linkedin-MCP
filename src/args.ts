export const COMMANDS = ["serve", "login", "logout", "status", "doctor", "resume", "install-browser", "connect-api", "disconnect-api", "help", "version"] as const;
export type Command = (typeof COMMANDS)[number];

export interface CliArgs {
  command: Command;
  http: boolean;
  port: number | undefined;
  headed: boolean;
  dryRun: boolean;
  yes: boolean;
  verify: boolean;
  keepOpen: boolean;
  offline: boolean;
}

export class ArgError extends Error {}

const ALIASES: Record<string, Command> = {
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "serve",
    http: false,
    port: undefined,
    headed: false,
    dryRun: false,
    yes: false,
    verify: false,
    keepOpen: false,
    offline: false,
  };
  let commandSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a in ALIASES) {
      args.command = ALIASES[a]!;
      commandSet = true;
      continue;
    }
    if (!a.startsWith("-")) {
      if (commandSet) throw new ArgError(`Unexpected argument "${a}".`);
      if (!(COMMANDS as readonly string[]).includes(a)) throw new ArgError(`Unknown command "${a}". Run with --help to see commands.`);
      args.command = a as Command;
      commandSet = true;
      continue;
    }
    const [flag, inline] = a.split("=", 2) as [string, string | undefined];
    switch (flag) {
      case "--http":
        args.http = true;
        break;
      case "--port": {
        const value = inline ?? argv[++i];
        const port = Number(value);
        if (!value || !Number.isInteger(port) || port < 1 || port > 65535) throw new ArgError("--port needs a number between 1 and 65535.");
        args.port = port;
        break;
      }
      case "--headed":
        args.headed = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--verify":
        args.verify = true;
        break;
      case "--keep-open":
        args.keepOpen = true;
        break;
      case "--offline":
        args.offline = true;
        break;
      default:
        throw new ArgError(`Unknown option "${flag}". Run with --help to see options.`);
    }
  }
  if (args.port !== undefined && !args.http) throw new ArgError("--port only applies with --http.");
  if (args.http && args.command !== "serve") throw new ArgError("--http only applies to the serve command.");
  return args;
}

export const HELP = `linkedin-mcp: LinkedIn MCP server for Claude, Cursor and other AI assistants

Usage
  npx @danishfareed/linkedin-mcp [command] [options]

Commands
  serve            Start the MCP server over stdio (default)
  login            Open a browser window to sign in to LinkedIn (saved locally)
  status           Show sign-in, pause and limit status
  doctor           Check the browser, sign-in, LinkedIn page selectors and updates (read-only)
  resume           Clear a pause after you've resolved a LinkedIn check
  logout           Delete the saved browser profile
  install-browser  Download the Chromium build this version of linkedin-mcp uses
                   (only needed without Google Chrome, or after an update asks for it)
  connect-api      Optional: connect your own LinkedIn developer app so posts publish
                   through LinkedIn's official API (walks you through the setup)
  disconnect-api   Remove the saved API connection (posts go through the browser)
  help             Show this help
  version          Print the version

Options
  --http             Serve over local HTTP (127.0.0.1) instead of stdio
  --port <n>         HTTP port (default 3333)
  --headed           Show the browser window while serving
  --dry-run          Simulate write actions without sending anything
  --verify           status: load your profile to confirm sign-in
  --keep-open        login: keep the window open until you close it
  --offline          doctor: skip the live LinkedIn checks and the update check
  --yes, -y          logout: skip the confirmation prompt

Environment (overrides config.json in ~/.config/linkedin-mcp)
  LINKEDIN_MCP_HOME, LINKEDIN_MCP_HEADLESS, LINKEDIN_MCP_DRY_RUN, LINKEDIN_MCP_READ_ONLY,
  LINKEDIN_MCP_WORKING_HOURS (e.g. 08:00-21:00 or off), LINKEDIN_MCP_IDLE_TIMEOUT_MINUTES,
  LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS (default 55), LINKEDIN_MCP_CONFIRM_REACTIONS,
  LINKEDIN_MCP_CONFIRM_IN_CLIENT, LINKEDIN_MCP_BROWSER_CHANNEL, LINKEDIN_MCP_CHROME_PATH,
  LINKEDIN_MCP_TOOLSETS (all, creator, outreach, lite, or groups: core, posting, engagement,
  research, jobs, network, growth, visuals), LINKEDIN_MCP_PORT, LINKEDIN_MCP_HTTP_TOKEN,
  LINKEDIN_MCP_POST_VIA (auto, api or browser),
  LINKEDIN_MCP_CLIENT_ID, LINKEDIN_MCP_CLIENT_SECRET, LINKEDIN_MCP_API_REDIRECT_PORT, LINKEDIN_MCP_API_VERSION

Docs: https://github.com/danishfareed/Linkedin-MCP#readme`;
