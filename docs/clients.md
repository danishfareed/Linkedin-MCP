# Client setup

How to connect `@danishfareed/linkedin-mcp` to each MCP client. Every client below starts the same command:

```
npx -y @danishfareed/linkedin-mcp
```

With no arguments it runs as a stdio MCP server, which is what every client below expects. The snippets name the server `linkedin`; any name works.

Paths and formats were checked against each client's own documentation in November 2026. Clients change often, so if a snippet stops working, check the client's docs linked in each section.

## Before you start

1. Install Node.js 20 or newer.
2. Sign in to LinkedIn once, in a terminal:

   ```
   npx @danishfareed/linkedin-mcp login
   ```

   A browser window opens. Sign in, and the session is saved under `~/.config/linkedin-mcp/`. You only need to do this again if LinkedIn signs you out.
3. Optional: run `npx @danishfareed/linkedin-mcp status` to confirm you're signed in, or `npx @danishfareed/linkedin-mcp doctor` for a full check.

### Optional settings

Add these to the `env` block of any snippet below. In JSON, write the values as strings.

| Variable | Example | What it does |
|---|---|---|
| `LINKEDIN_MCP_DRY_RUN` | `"true"` | Simulates write actions (posts, comments, messages) without sending anything. Good for a first try. |
| `LINKEDIN_MCP_HEADLESS` | `"false"` | Shows the browser window while the server works. |
| `LINKEDIN_MCP_WORKING_HOURS` | `"08:00-21:00"` | Only allows write actions inside these hours. Use `"off"` to disable. |
| `LINKEDIN_MCP_READ_ONLY` | `"true"` | Hides every tool that can send something. Reading still works. |
| `LINKEDIN_MCP_CONFIRM_IN_CLIENT` | `"false"` | Turns off the approval dialog in clients that support MCP dialogs (the preview and token step stays). |
| `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` | `"90"` | Time budget for one tool call. The default, 55, fits clients that give up after 60 seconds. Only raise it if your client waits longer. |

## Claude Desktop

Config file (Settings > Developer > Edit Config opens it):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      }
    }
  }
}
```

Quit Claude Desktop completely and reopen it after saving. If the server doesn't appear, the logs are in `~/Library/Logs/Claude` (macOS), `%APPDATA%\Claude\logs` (Windows) or `~/.config/Claude/logs` (Linux); look for `mcp-server-linkedin.log`.

Docs: [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

## Claude Code

CLI (`--scope user` makes it available in every project; leave it out to add it to the current project only):

```
claude mcp add linkedin --scope user -- npx -y @danishfareed/linkedin-mcp
```

With settings, put `--env` after the server name and before `--`:

```
claude mcp add linkedin --scope user --env LINKEDIN_MCP_DRY_RUN=true --env LINKEDIN_MCP_HEADLESS=false -- npx -y @danishfareed/linkedin-mcp
```

JSON form, either with `claude mcp add-json`:

```
claude mcp add-json linkedin '{"type":"stdio","command":"npx","args":["-y","@danishfareed/linkedin-mcp"],"env":{"LINKEDIN_MCP_DRY_RUN":"true"}}' --scope user
```

or in a `.mcp.json` file at your project root (shared with anyone who clones the project):

```json
{
  "mcpServers": {
    "linkedin": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      }
    }
  }
}
```

User and local scopes are stored in `~/.claude.json`; project scope in `.mcp.json`. Check the connection with `claude mcp get linkedin` or `/mcp` inside a session.

Docs: [Claude Code MCP](https://code.claude.com/docs/en/mcp)

## Cursor

Config file:

- All projects: `~/.cursor/mcp.json` (on Windows, `%USERPROFILE%\.cursor\mcp.json`)
- One project: `.cursor/mcp.json` in the project root

```json
{
  "mcpServers": {
    "linkedin": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      }
    }
  }
}
```

The global file is also read by the Cursor CLI. Cursor's hosted Cloud Agents don't read it, so use this server from the local editor or CLI.

Docs: [Cursor MCP](https://cursor.com/docs/context/mcp)

## VS Code (GitHub Copilot)

VS Code now has two config formats. Use the first one for new setups.

**Copilot format (current).** The file uses the `mcpServers` key:

- All workspaces: `~/.copilot/mcp-config.json` (or `$COPILOT_HOME/mcp-config.json` if you set `COPILOT_HOME`). The Copilot CLI reads this file too.
- One workspace: `.mcp.json` in the workspace root

The easiest way to create the entry is Command Palette > **MCP: Add Server** > Command (stdio), then choose **Global** > **Copilot Global**. Or edit the file:

```json
{
  "mcpServers": {
    "linkedin": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      },
      "tools": ["*"]
    }
  }
}
```

**Editor format (older).** `.vscode/mcp.json` in a workspace, or your user profile's `mcp.json` (open it with **MCP: Open User Configuration**). It uses the `servers` key, and `type` is required:

```json
{
  "servers": {
    "linkedin": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      }
    }
  }
}
```

The same entry from a terminal, written to your user profile:

```
code --add-mcp '{"name":"linkedin","type":"stdio","command":"npx","args":["-y","@danishfareed/linkedin-mcp"]}'
```

VS Code's docs mark the editor format as part of the "Local harness", which is deprecated and due to be removed in February 2027. Existing entries still work until then.

Docs: [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

## Windsurf (now Devin Desktop)

Windsurf was renamed Devin Desktop on June 2, 2026. Its local agent, Devin Local, uses the same MCP config as the Devin CLI:

- User: `~/.config/devin/mcp_config.json` on macOS and Linux (`$XDG_CONFIG_HOME/devin/mcp_config.json` if that's set), `%APPDATA%\devin\mcp_config.json` on Windows
- Project: `.devin/mcp_config.json` (committed) or `.devin/mcp_config.local.json` (gitignored)

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      }
    }
  }
}
```

You can also add it from **Customize** > **MCPs** in the Agents window, or with `devin mcp add -s user linkedin -- npx -y @danishfareed/linkedin-mcp`. If you're still on an older Windsurf build with Cascade, the file is `~/.codeium/windsurf/mcp_config.json` and the entry is the same.

Docs: [Devin Local MCP servers](https://docs.devin.ai/desktop/cascade/mcp), [MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration)

## Cline

Recent versions keep one MCP file for the VS Code extension, the CLI and the SDK:

- macOS and Linux: `~/.cline/data/settings/cline_mcp_settings.json`
- Windows: `%USERPROFILE%\.cline\data\settings\cline_mcp_settings.json`

To open the file the extension is actually using, click the **MCP Servers** icon in the Cline panel, open the **Configure** tab, and click **Configure MCP Servers**.

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

From the Cline CLI: `cline mcp add linkedin --yes -- npx -y @danishfareed/linkedin-mcp`. Keep `autoApprove` empty unless you're sure, so you see each tool call before it runs.

Cline gives each tool call 60 seconds by default, which matches linkedin-mcp's default budget. If you raise `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`, also add `"timeout": <seconds>` to the server's entry, a little above the value you chose.

Docs: [Cline MCP](https://docs.cline.bot/mcp/mcp-overview)

## ChatGPT

**ChatGPT desktop app: yes.** The desktop app (macOS, Windows, Linux) can run local stdio servers. Open **Settings** > **MCP servers** > **Add server**, choose **STDIO**, enter `npx` as the command with the arguments `-y @danishfareed/linkedin-mcp`, add any env vars, save, and click **Restart**. Type `/mcp` in the composer to check it's connected.

The app shares its MCP config with the Codex CLI and the Codex IDE extension, in `~/.codex/config.toml` (on Windows, `%USERPROFILE%\.codex\config.toml`). You can edit it directly:

```toml
[mcp_servers.linkedin]
command = "npx"
args = ["-y", "@danishfareed/linkedin-mcp"]

[mcp_servers.linkedin.env]
LINKEDIN_MCP_DRY_RUN = "true"
```

or add it with `codex mcp add linkedin --env LINKEDIN_MCP_DRY_RUN=true -- npx -y @danishfareed/linkedin-mcp`. On Windows, if you've switched the app's agent to WSL, the server runs inside WSL, so run the `login` command inside WSL too.

**ChatGPT on the web (chatgpt.com): not directly.** The web app doesn't read local config and only connects to remote MCP servers over a public HTTPS URL. It also can't send a fixed API key, so the local HTTP mode below (which needs a bearer token) won't work from it. Custom MCP servers on the web are limited to Business and Enterprise/Edu workspaces (Pro accounts get read and fetch only). If you're in such a workspace, OpenAI's [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) can run the stdio server for you with `tunnel-client ... --mcp-command "npx -y @danishfareed/linkedin-mcp"`. Keep that connection private: if it's published to the workspace, everyone in it acts as your LinkedIn account.

Docs: [MCP in ChatGPT and Codex](https://learn.chatgpt.com/docs/extend/mcp), [Connecting custom MCP servers](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)

## Any other MCP client

If the client supports stdio servers, give it:

- command: `npx`
- arguments: `-y`, `@danishfareed/linkedin-mcp`
- environment: any of the [optional settings](#optional-settings)

Most clients accept the `mcpServers` JSON shown under Claude Desktop. If the client only supports HTTP, use the local HTTP mode below.

## Local HTTP mode (optional)

Use this when a client can only talk HTTP, or when you want several clients to share one server. Start the server in a terminal and leave it running:

```
npx -y @danishfareed/linkedin-mcp --http --port 3333
```

It serves Streamable HTTP at `http://127.0.0.1:3333/mcp`, on your machine only. Every request needs the header `Authorization: Bearer <token>`. The token is printed when the server starts and saved in `~/.config/linkedin-mcp/http-token`; set `LINKEDIN_MCP_HTTP_TOKEN` before starting to choose your own. Settings such as `LINKEDIN_MCP_DRY_RUN` go in that terminal's environment, not in the client config.

Claude Code:

```
claude mcp add --transport http linkedin http://127.0.0.1:3333/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "linkedin": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

The other clients take the same URL and header with a different field name for the transport:

| Client | Entry |
|---|---|
| VS Code (Copilot format) | `"type": "http", "url": "...", "headers": { "Authorization": "Bearer YOUR_TOKEN" }` |
| Cline | `"type": "streamableHttp", "url": "...", "headers": { ... }` |
| Devin Desktop | `"url": "...", "transport": "http", "headers": { ... }` |
| ChatGPT desktop / Codex | `url = "..."` and `http_headers = { "Authorization" = "Bearer YOUR_TOKEN" }` |

For Claude Desktop, use the stdio setup above.

## Troubleshooting

- **"Not signed in" errors:** run `npx @danishfareed/linkedin-mcp login` again in a terminal. Sign in with your email and password or a passkey; Google and Apple sign-in usually refuse to work inside an automated browser.
- **Tool calls time out:** linkedin-mcp answers within 55 seconds by default so it fits clients that stop waiting at 60. If your client's limit is shorter, lower `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` to match (minimum 20); if it's longer, you can raise it.
- **No approval dialog appears:** only clients that support MCP elicitation show one. Others rely on the preview and confirmation token, which is still required for every send.
- **"Browser profile is already open in another process":** two things are using the saved LinkedIn session at once, such as two clients or a login window. Close one, or run the HTTP mode once and point all your clients at it.
- **The client can't find `npx`:** desktop apps don't always get the same `PATH` as your terminal, which is common with nvm. Put the full path to `npx` in `command` (find it with `which npx` on macOS and Linux).
- **Changes don't show up:** restart the client after editing its config file.
- **Anything else:** `npx @danishfareed/linkedin-mcp doctor` checks the browser, the sign-in and LinkedIn's page layout without changing anything.
