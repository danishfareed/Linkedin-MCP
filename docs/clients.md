# Client setup

How to connect `@danishfareed/linkedin-mcp` to each AI client that can run a local MCP server. Every client below starts the same command:

```
npx -y @danishfareed/linkedin-mcp
```

With no arguments it runs as a stdio MCP server, which is what almost every client expects. The snippets name the server `linkedin`; any name works, but a short name with no dots or spaces is safest.

Paths, formats and limits were checked against each client's own documentation in November 2026. Each section links the page it was checked against. Clients change often, so if a snippet stops working, check that page.

## Before you start

1. Install Node.js 20 or newer.
2. Sign in to LinkedIn once, in a terminal:

   ```
   npx @danishfareed/linkedin-mcp login
   ```

   A browser window opens. Sign in, and the session is saved under `~/.config/linkedin-mcp/`. You only need to do this again if LinkedIn signs you out.
3. Optional: run `npx @danishfareed/linkedin-mcp status` to confirm you're signed in, or `npx @danishfareed/linkedin-mcp doctor` for a full check.

### Optional settings

Add these to the `env` block of any snippet below. In JSON, write the values as strings. The snippets show `LINKEDIN_MCP_DRY_RUN`, which is a safe first setting; remove it when you're ready to post for real.

| Variable | Example | What it does |
|---|---|---|
| `LINKEDIN_MCP_DRY_RUN` | `"true"` | Simulates write actions (posts, comments, messages) without sending anything. Good for a first try. |
| `LINKEDIN_MCP_TOOLSETS` | `"lite"` | Loads only some tool groups. For clients with a tool limit or a small context window. See [Clients with tool limits](#clients-with-tool-limits). |
| `LINKEDIN_MCP_HEADLESS` | `"false"` | Shows the browser window while the server works. |
| `LINKEDIN_MCP_WORKING_HOURS` | `"08:00-21:00"` | Only allows write actions inside these hours. Use `"off"` to disable. |
| `LINKEDIN_MCP_READ_ONLY` | `"true"` | Hides every tool that can send something. Reading still works. |
| `LINKEDIN_MCP_CONFIRM_IN_CLIENT` | `"false"` | Turns off the approval dialog in clients that support MCP dialogs (the preview and token step stays). |
| `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` | `"90"` | Time budget for one tool call. The default, 55, fits clients that give up after 60 seconds. See [Tool-call timeouts](#tool-call-timeouts). |

## Summary

"Prompts" means the client can run the server's MCP prompts (usually as slash commands). "Dialogs" means it shows MCP elicitation forms, which linkedin-mcp uses as an approval step before anything is sent. Where a client doesn't show dialogs, the preview and confirmation token still protect every send. "Not documented" means the client's docs don't say either way.

| Client | Where the config goes | Tool limit | Prompts | Dialogs | Notes |
|---|---|---|---|---|---|
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | None documented | Yes | No | Restart after editing. |
| [Claude Code](#claude-code) | `claude mcp add`, `~/.claude.json` or `.mcp.json` | No fixed cap; tool search is on by default | Yes | Yes | Stdio tool calls have no per-request timeout. |
| [Cursor](#cursor) | `~/.cursor/mcp.json` or `.cursor/mcp.json` | None in current docs | Yes | Yes | The Cursor CLI reads the same file. |
| [VS Code (GitHub Copilot)](#vs-code-github-copilot) | `~/.copilot/mcp-config.json` or `.mcp.json` | 128 per request in the older editor format | No (older format: yes) | Yes, during a turn | Default timeout 30 s; set `"timeout": 60000`. |
| [Visual Studio](#visual-studio) | `%USERPROFILE%\.mcp.json` or `<solution>\.mcp.json` | None documented | Yes | Yes | New servers' tools start disabled. |
| [JetBrains AI Assistant](#jetbrains-ai-assistant) | Settings > Tools > AI Assistant > Model Context Protocol (MCP) | None documented | Not documented | Not documented | |
| [Junie](#junie) | `~/.junie/mcp/mcp.json` | **100 tools across all servers** | Not documented | Not documented | Default timeout 60 s. |
| [Devin Desktop (Windsurf)](#devin-desktop-formerly-windsurf) | `~/.config/devin/mcp_config.json` | None in current docs (old Cascade agent: 100) | Yes | Not documented | |
| [Cline](#cline) | `~/.cline/data/settings/cline_mcp_settings.json` | None documented | Not documented | Not documented | Default timeout 60 s. |
| [Roo Code](#roo-code) | Shut down on May 15, 2026 | | | | Use Cline or Kilo Code. |
| [Kilo Code](#kilo-code) | `~/.config/kilo/kilo.jsonc` | None; warns that many tools can fill the context | Yes | Not documented | Default timeout is short; set `"timeout": 60000`. |
| [Continue](#continue) | `~/.continue/config.yaml` or `.continue/mcpServers/` | None documented | Not documented | Not documented | Agent mode only. |
| [Zed](#zed) | `settings.json`, under `context_servers` | None documented | Yes | No | Default timeout 60 s. |
| [Goose](#goose) | `~/.config/goose/config.yaml` | None; suggests Code Mode for many extensions | Yes | Yes | Default timeout 300 s. |
| [Gemini CLI](#gemini-cli) | `~/.gemini/settings.json` | None documented | Yes | Not documented | Default timeout 10 minutes. |
| [ChatGPT desktop app and Codex](#chatgpt-desktop-app-and-codex) | Settings > MCP servers, or `~/.codex/config.toml` | None documented | Not documented | Yes | Startup timeout 10 s by default. |
| [ChatGPT web and claude.ai](#web-apps-chatgpt-and-claudeai) | Can't reach a local server | | | | Use a desktop app instead. |
| [LM Studio](#lm-studio) | `~/.lmstudio/mcp.json` | None; warns about token use on local models | Not documented | Not documented | Asks before each tool call. |
| [Msty Studio](#msty-studio) | Toolbox > Tools | None; suggests small toolsets | Not documented | Not documented | |
| [Jan](#jan) | Settings > MCP Servers | None; routes tools per turn | Not documented | Not documented | **Default timeout 30 s**; raise it to 60. |
| [5ire](#5ire) | Tools page | None documented | Yes | Not documented | |
| [Cherry Studio](#cherry-studio) | Settings > MCP > MCP Servers | None; bind only the servers you need | Yes | Not documented | |
| [BoltAI](#boltai) | `~/.boltai/mcp.json` | None documented | Not documented | Not documented | Imports from Claude Desktop. |
| [Kiro (formerly Amazon Q Developer CLI)](#kiro-formerly-amazon-q-developer-cli) | `~/.kiro/settings/mcp.json` | None; uses tool search | Yes | Yes | Tool names up to 64 characters. |
| [Warp](#warp) | Settings > Agents > MCP servers, or `~/.warp/.mcp.json` | None documented | Not documented | Not documented | |
| [n8n](#n8n) | MCP Client Tool node | None; you pick the tools to include | No | No | Needs the local HTTP mode. |
| [Developer SDKs](#for-developers) | In your code | | | | Claude Agent SDK, OpenAI Agents SDK, MCP SDKs. |

## Claude Desktop

Config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux (beta): `~/.config/Claude/claude_desktop_config.json`

To open it from the app, go to **Settings** > **Desktop app** and click **Manage** next to Extensions, then use the **Local MCP servers** section. In the older settings layout it's **Settings** > **Developer** > **Edit Config**.

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

- **Prompts and resources:** Claude's docs list prompts and resources as supported. They appear under the **+** menu in the chat box.
- **Dialogs:** not supported yet, so sends use the preview and confirmation token.
- **Many tools:** no hard limit is documented. In a chat, **+** > **Connectors** > **Tool access** can be set to **On demand**, which Claude's help center suggests for 30 or more tools. The article doesn't say whether this covers local servers.
- **Windows:** if you see `ENOENT` with `${APPDATA}` in the path, add `"APPDATA": "C:\\Users\\<you>\\AppData\\Roaming"` to `env`. If `npx` still fails, run `npm install -g npm`.
- **HTTP:** Claude Desktop's custom connectors are reached from Anthropic's cloud, not your computer, so they can't use the local HTTP mode. Use the stdio setup above.

Docs: [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [Local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [Manage Claude's tool access](https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access)

## Claude Code

CLI (`--scope user` makes it available in every project; leave it out to add it to the current project only):

```
claude mcp add linkedin --scope user -- npx -y @danishfareed/linkedin-mcp
```

With settings, put `--env` after the server name and before `--`:

```
claude mcp add linkedin --scope user --env LINKEDIN_MCP_DRY_RUN=true -- npx -y @danishfareed/linkedin-mcp
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

User and local scopes are stored in `~/.claude.json` (`%USERPROFILE%\.claude.json` on Windows); project scope in `.mcp.json`. Check the connection with `claude mcp get linkedin` or `/mcp` inside a session. Restart the session after editing `.mcp.json`.

- **Prompts:** listed as `/linkedin:<prompt> (MCP)`.
- **Resources:** type `@` to pick one.
- **Dialogs:** shown in the terminal, with no setup. In headless runs with `--permission-prompts none` they're cancelled; see [troubleshooting](#troubleshooting).
- **Many tools:** no fixed cap. Tool search is on by default, so tool definitions load only when needed.
- **Timeouts:** server startup waits 30 seconds (`MCP_TIMEOUT`, in milliseconds). Stdio tool calls have no per-request timeout, so you can raise `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` freely.
- **Windows:** plain `npx` works; current versions no longer ask for a `cmd /c` wrapper.

Docs: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Environment variables](https://code.claude.com/docs/en/env-vars)

## Cursor

Config file:

- All projects: `~/.cursor/mcp.json` in your home folder
- One project: `.cursor/mcp.json` in the project root

If the same server name is in both, the project file wins.

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

The global file is also read by the Cursor CLI (`agent mcp list` shows it). Hosted Cloud Agents don't read it, so use this server from the local editor or CLI.

- **Prompts, resources and dialogs:** all supported.
- **Many tools:** the current docs list no tool limit. Older Cursor versions capped the tools sent to the model; Cursor's release notes say agents with many MCP tools no longer fail by going over the model's tool limit. If you're on an old version, use `LINKEDIN_MCP_TOOLSETS`.
- **Turning tools off:** click a tool's name in the tools list at the top of the chat panel.
- **Timeout:** not documented for the editor.

Docs: [Cursor MCP](https://cursor.com/docs/mcp), [Release notes](https://cursor.com/docs/release-notes/ide)

## VS Code (GitHub Copilot)

VS Code has two config formats. Use the first one for new setups.

**Copilot format (current).** The file uses the `mcpServers` key:

- All workspaces: `~/.copilot/mcp-config.json` (or `$COPILOT_HOME/mcp-config.json` if you set `COPILOT_HOME`). The Copilot CLI reads this file too.
- One workspace: `.mcp.json` in the workspace root

To create the entry from the UI, run **MCP: Add Server** from the Command Palette, choose **Command (stdio)**, then **Global** > **Copilot Global**. Or edit the file:

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
      "tools": ["*"],
      "timeout": 60000
    }
  }
}
```

The Copilot runtime gives each tool call 30 seconds by default (`timeout`, in milliseconds), which is less than linkedin-mcp's 55-second budget. Keep `"timeout": 60000` or higher. `tools` lists the tools to expose; `["*"]` means all of them.

The same entry from the Copilot CLI:

```
copilot mcp add linkedin --env LINKEDIN_MCP_DRY_RUN=true --tools "*" --timeout 60000 -- npx -y @danishfareed/linkedin-mcp
```

**Editor format (older).** `.vscode/mcp.json` in a workspace, or your user profile's `mcp.json` (open it with **MCP: Open User Configuration**). It uses the `servers` key:

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

`code --add-mcp '{"name":"linkedin","type":"stdio","command":"npx","args":["-y","@danishfareed/linkedin-mcp"]}'` writes this older format to your user profile. The editor format belongs to the "Local harness", which VS Code has deprecated and plans to remove in February 2027. Existing entries still work until then.

- **Prompts:** not available in Copilot sessions. The older editor format runs them as `/mcp.linkedin.<prompt>`.
- **Resources:** not shown in Copilot sessions. The older format has **MCP: Browse Resources**.
- **Dialogs:** shown during an active turn. They're cancelled in Autopilot; see [troubleshooting](#troubleshooting).
- **Many tools:** the older format stops at **128 tools per request**, counting every enabled tool, not just this server's. The Copilot runtime can load tools through tool search instead (`deferTools` is `auto` by default).
- **Turning tools off:** list only the tools you want in `tools`, or use the **Tools** tab in the customizations view.
- **Variables:** the Copilot format expands `${NAME}` and `${NAME:-default}`, not `${env:NAME}`.

Docs: [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [Use tools in chat](https://code.visualstudio.com/docs/agents/run/tools), [Copilot CLI MCP fields](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [Migrate customizations](https://code.visualstudio.com/docs/agent-customization/migrate-customizations)

## Visual Studio

Visual Studio 2022 (17.14 and later) and Visual Studio 2026 read these files, in this order:

- `%USERPROFILE%\.mcp.json` (all solutions)
- `<solution folder>\.vs\mcp.json`
- `<solution folder>\.mcp.json`
- `<solution folder>\.vscode\mcp.json`
- `<solution folder>\.cursor\mcp.json`

The key is `servers`:

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

Or in Copilot Chat, switch to Agent mode, open **Tools**, click **+**, and choose **Add custom MCP server**. The dialog has an optional **Environment Variables** field and lets you save to the solution or to the global file.

- **Tools start disabled.** Enable linkedin-mcp's tools in the Tools list. You can search a server's tools and turn them on one by one.
- **Prompts:** **+ Add Reference** > **Prompts** > **MCP prompts**.
- **Resources:** reference them in chat with `#`.
- **Dialogs:** supported (Visual Studio 2026 18.1 and 2022 17.14 release notes).
- **Tool limit and timeout:** not documented. The new Copilot Chat (18.12) is built on the Copilot SDK, which the Copilot CLI also uses, but the docs don't say whether it keeps the CLI's 30-second default. If calls time out, see [Tool-call timeouts](#tool-call-timeouts).

Docs: [Use MCP servers in Visual Studio](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers)

## JetBrains AI Assistant

In any JetBrains IDE with AI Assistant, go to **Settings** > **Tools** > **AI Assistant** > **Model Context Protocol (MCP)**, click **Add**, choose global or project level, and paste:

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

You can also import servers from your Claude Desktop config on the same page. JetBrains' docs show only `command` and `args`; the `env` block follows the same Claude Desktop format but isn't documented. Prompts, dialogs, tool limits and timeouts aren't documented either.

Agents such as Junie or Claude Agent running inside AI Chat only see these servers when **Pass custom MCP servers** is on, under **Tools** > **AI Assistant** > **Agents**.

Docs: [AI Assistant MCP](https://www.jetbrains.com/help/ai-assistant/mcp.html)

## Junie

Junie (the JetBrains coding agent, in the IDE plugin and the CLI) reads:

- All projects: `~/.junie/mcp/mcp.json`
- One project: `.junie/mcp/mcp.json` in the project root

In the IDE: **Settings** > **Tools** > **Junie** > **MCP Settings**.

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true",
        "LINKEDIN_MCP_TOOLSETS": "creator"
      }
    }
  }
}
```

- **Tool limit:** Junie supports at most **100 tools from all configured MCP servers combined**. linkedin-mcp's 53 fit on their own. If you use other servers too, pick a smaller preset; see [Clients with tool limits](#clients-with-tool-limits).
- **Timeout:** 60 seconds per request by default. Set `"timeout"` on the server entry, in milliseconds (1000 to 3600000).
- **Prompts and dialogs:** not documented.

Docs: [Junie MCP configuration](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html), [Junie IDE plugin](https://junie.jetbrains.com/docs/junie-ide-plugin.html)

## Devin Desktop (formerly Windsurf)

Windsurf was renamed Devin Desktop on June 2, 2026. Its agent, Devin Local, uses the same MCP config as the Devin CLI:

- User: `~/.config/devin/mcp_config.json` on macOS and Linux, `%APPDATA%\devin\mcp_config.json` on Windows
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

Or add it from **Customize** > **MCPs** in the Agents window, or from a terminal:

```
devin mcp add -s user -e LINKEDIN_MCP_DRY_RUN=true linkedin -- npx -y @danishfareed/linkedin-mcp
```

- **Prompts:** each prompt becomes a `/mcp__linkedin__<prompt>` slash command.
- **Dialogs:** not documented.
- **Approvals:** the agent asks before every MCP tool call unless you pre-approve it with `permissions.allow` (for example `mcp__linkedin__get_my_profile`). Pre-approve only read tools.
- **Turning tools off:** add `"disabledTools": ["tool_name"]` to the entry.
- **Tool limit:** the current docs list none. The old Cascade agent had a limit of 100 tools in total, across all servers. Cascade no longer starts new conversations.
- **Older Windsurf builds** read `~/.codeium/windsurf/mcp_config.json`, with the same entry.

Docs: [Devin Local customizations](https://docs.devin.ai/desktop/devin-local/customizations), [MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration), [CLI commands](https://docs.devin.ai/cli/reference/commands)

## Cline

Cline keeps one MCP file for the VS Code extension, the CLI and the SDK: `~/.cline/data/settings/cline_mcp_settings.json`, where `~` is your home folder. To open the file the extension is actually using, click the **MCP Servers** icon in the Cline panel, open the **Configure** tab, and click **Configure MCP Servers**.

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

From the Cline CLI: `cline mcp add linkedin --yes -- npx -y @danishfareed/linkedin-mcp`. The CLI has no flag for environment variables, so add those in the file. Keep `autoApprove` empty unless you're sure, so you see each tool call before it runs.

- **Timeout:** each tool call gets 60 seconds by default, which matches linkedin-mcp's default budget. If you raise `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`, also add `"timeout": <seconds>` to the entry, a little above the value you chose.
- **Prompts, dialogs and tool limits:** not documented.

Docs: [Cline MCP](https://docs.cline.bot/mcp/mcp-overview), [Cline CLI reference](https://docs.cline.bot/cli/cli-reference)

## Roo Code

The Roo Code extension was shut down on May 15, 2026. Its docs point users to Cline and to ZooCode, a community fork. To keep using linkedin-mcp from VS Code, use [Cline](#cline), [Kilo Code](#kilo-code) or [VS Code with Copilot](#vs-code-github-copilot).

Docs: [Roo Code docs](https://roocodeinc.github.io/Roo-Code/)

## Kilo Code

Kilo Code (the extension and the CLI) keeps MCP servers in its main config file, under `mcp`:

- All projects: `~/.config/kilo/kilo.jsonc` (or `kilo.json`)
- One project: `kilo.jsonc` in the project root, or `.kilo/kilo.jsonc`

In the extension: the gear icon > **Agent Behaviour** > **MCP Servers**.

```json
{
  "mcp": {
    "linkedin": {
      "type": "local",
      "command": ["npx", "-y", "@danishfareed/linkedin-mcp"],
      "environment": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      },
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

The command is one array, and settings go in `environment`, not `env`.

- **Timeout:** Kilo's docs give defaults from 5 to 15 seconds, in milliseconds, which is too short for linkedin-mcp. Keep `"timeout": 60000` or higher.
- **Windows:** use `"command": ["cmd", "/c", "npx", "-y", "@danishfareed/linkedin-mcp"]`.
- **Prompts:** MCP prompts appear as slash commands.
- **Resources:** available to the agent through its resource tools.
- **Dialogs:** not documented.
- **Many tools:** Kilo warns that servers with many tools can exceed the context limit. Use `LINKEDIN_MCP_TOOLSETS` if that happens.
- **Turning tools off:** set a permission of `deny` (or `ask`) for `linkedin_<tool>`, or `linkedin_*`.
- **CLI:** `kilo mcp add` opens an interactive prompt; `kilo mcp list` shows what's connected.

Docs: [Using MCP in Kilo Code](https://kilo.ai/docs/automate/mcp/using-in-kilo-code), [Using MCP in the CLI](https://kilo.ai/docs/automate/mcp/using-in-cli)

## Continue

Add the server to your main config, `~/.continue/config.yaml` (`%USERPROFILE%\.continue\config.yaml` on Windows), or as a block file in your workspace, such as `.continue/mcpServers/linkedin.yaml`:

```yaml
name: LinkedIn
version: 0.0.1
schema: v1
mcpServers:
  - name: linkedin
    type: stdio
    command: npx
    args: ["-y", "@danishfareed/linkedin-mcp"]
    env:
      LINKEDIN_MCP_DRY_RUN: "true"
```

In `config.yaml`, add only the `mcpServers` list. Continue also accepts a Claude-style JSON file copied into `.continue/mcpServers/`.

- **Agent mode only:** MCP tools work in agent mode, with a model that supports tool use.
- **Resources:** type `@` and pick **MCP**.
- **Prompts and dialogs:** not documented.
- **Turning tools off:** set a tool's policy to **Excluded** in the tools list.
- **Timeout:** only `connectionTimeout`, for the first connection, is documented.

Docs: [Continue MCP](https://docs.continue.dev/customize/deep-dives/mcp), [config.yaml reference](https://docs.continue.dev/reference)

## Zed

Add the server under `context_servers` in Zed's `settings.json`:

- macOS and Linux: `~/.config/zed/settings.json`
- Windows: `%APPDATA%\Zed\settings.json`

Or go to **Settings** > **AI** > **MCP Servers** > **Add Server** > **Add Local Server**.

```json
{
  "context_servers": {
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

- **Prompts:** supported.
- **Resources and dialogs:** not supported. Zed lists tools and prompts as its MCP features.
- **Timeout:** `context_server_timeout` is 60 seconds by default. Add `"timeout": <seconds>` to the server entry to change it; the maximum is 600.
- **Turning tools off:** set `agent.tool_permissions.tools."mcp:linkedin:<tool>".default` to `"deny"`, or turn tools off in an agent profile.
- **Project files:** servers in a project's `.zed/settings.json` only run once you trust that folder.

Docs: [Zed MCP](https://zed.dev/docs/ai/mcp), [All settings](https://zed.dev/docs/reference/all-settings)

## Goose

Goose's docs moved to goose-docs.ai. Run `goose configure` > **Add Extension** > **Command-line Extension**, or in Goose Desktop go to **Extensions** > **Add custom extension**. Or edit the config file:

- macOS and Linux: `~/.config/goose/config.yaml`
- Windows: `%APPDATA%\Block\goose\config\config.yaml`

```yaml
extensions:
  linkedin:
    name: linkedin
    type: stdio
    enabled: true
    cmd: npx
    args: ["-y", "@danishfareed/linkedin-mcp"]
    envs:
      LINKEDIN_MCP_DRY_RUN: "true"
    env_keys: []
    timeout: 300
```

Note the field names: `cmd`, not `command`, and `envs`, not `env`.

To try it for one session only:

```
goose session --with-extension "linkedin:LINKEDIN_MCP_DRY_RUN=true npx -y @danishfareed/linkedin-mcp"
```

The `linkedin:` prefix names the extension; without it, Goose names it after the command (`npx`).

- **Prompts:** `/prompts --extension linkedin` lists them, and `/prompt <name>` runs one.
- **Dialogs:** supported in form mode, with no setup. They time out after 5 minutes.
- **Timeout:** `timeout` is in seconds; 300 is the default.
- **Many tools:** every enabled extension's tools go into each request. Goose suggests Code Mode when you run five or more extensions. To load fewer tools, list the ones you want in `available_tools`.
- **Approvals:** Goose runs tools without asking by default (`GOOSE_MODE` is `auto`). Change that in the tool permissions settings if you want to approve each call.

Docs: [Using extensions](https://goose-docs.ai/docs/getting-started/using-extensions), [Config files](https://goose-docs.ai/docs/guides/config-files), [MCP elicitation](https://goose-docs.ai/docs/guides/mcp-elicitation)

## Gemini CLI

Google replaced Gemini CLI with Antigravity CLI for unpaid and Google One users on June 18, 2026. Gemini CLI still works with paid Gemini API keys. The setup below is for Gemini CLI.

Config file: `~/.gemini/settings.json` (all projects) or `.gemini/settings.json` (one project).

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true"
      },
      "trust": false
    }
  }
}
```

Or from a terminal (the `--` keeps `-y` from being read as a Gemini flag):

```
gemini mcp add -s user -e LINKEDIN_MCP_DRY_RUN=true linkedin npx -- -y @danishfareed/linkedin-mcp
```

- **Server name:** don't use underscores in the server name. `linkedin` is fine.
- **Trust:** stdio servers only connect in folders you trust (`gemini trust`). Leave `"trust": false` so Gemini asks before each tool call.
- **Prompts:** run as slash commands.
- **Resources:** reference them with `@`.
- **Dialogs:** not documented.
- **Timeout:** 600,000 ms (10 minutes) by default, in the `timeout` field.
- **Choosing tools:** `includeTools` and `excludeTools` take lists of tool names (or use `--include-tools` and `--exclude-tools`).

Docs: [Gemini CLI MCP servers](https://geminicli.com/docs/tools/mcp-server/)

## ChatGPT desktop app and Codex

The ChatGPT desktop app, the Codex CLI and the Codex IDE extension share one MCP config, in `~/.codex/config.toml` (`%USERPROFILE%\.codex\config.toml` on Windows). A trusted project can also have its own `.codex/config.toml`.

**ChatGPT desktop app.** Open **Settings** > **MCP servers** > **Add server**, enter a name, choose **STDIO**, enter `npx` as the command with the arguments `-y @danishfareed/linkedin-mcp`, add any env vars, save, and click **Restart**. Type `/mcp` in the composer to check it's connected.

**Codex CLI:**

```
codex mcp add linkedin --env LINKEDIN_MCP_DRY_RUN=true -- npx -y @danishfareed/linkedin-mcp
```

**Codex IDE extension:** gear icon > **MCP servers** > **Add server**, or open `config.toml` from the Codex settings.

Or edit the file directly:

```toml
[mcp_servers.linkedin]
command = "npx"
args = ["-y", "@danishfareed/linkedin-mcp"]
startup_timeout_sec = 30

[mcp_servers.linkedin.env]
LINKEDIN_MCP_DRY_RUN = "true"
```

- **Timeouts:** `startup_timeout_sec` defaults to 10 seconds. The first `npx` download can take longer, hence 30 above. `tool_timeout_sec` defaults to 60 seconds, which fits linkedin-mcp's budget.
- **Choosing tools:** `enabled_tools` and `disabled_tools` take lists of tool names.
- **Dialogs:** supported. If you use a granular approval policy, set `approval_policy.granular.mcp_elicitations` to `true` so they aren't rejected automatically.
- **Prompts and tool limits:** not documented.
- **Windows:** the desktop app uses `%USERPROFILE%\.codex`. A Codex CLI inside WSL uses the Linux home folder, so it has its own config unless you set `CODEX_HOME`.

Docs: [MCP in ChatGPT and Codex](https://learn.chatgpt.com/docs/extend/mcp), [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)

## Web apps: ChatGPT and claude.ai

ChatGPT on the web (chatgpt.com) and claude.ai can't use linkedin-mcp running on your computer. Both connect to MCP servers from their own cloud, over a public HTTPS URL, so they can't reach `127.0.0.1`. Neither can send the fixed bearer token that the local HTTP mode needs: ChatGPT offers OAuth or no authentication, and claude.ai's header authentication is a limited beta.

Use a desktop app instead: the [ChatGPT desktop app](#chatgpt-desktop-app-and-codex) or [Claude Desktop](#claude-desktop).

**Don't expose the server through a public tunnel** (ngrok, Cloudflare Tunnel or similar). Anyone who can reach that URL can act as your LinkedIn account, and you would have to turn off the token for the web apps to connect at all. The local HTTP mode is for clients on the same machine only.

Business and Enterprise ChatGPT workspaces can use OpenAI's Secure MCP Tunnel, which isn't a public URL. If you try it, keep the connection private: if it's shared with the workspace, everyone in it acts as your LinkedIn account.

Docs: [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt), [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## LM Studio

LM Studio 0.3.17 or later. Open the **Program** tab in the right-hand sidebar, click **Install** > **Edit mcp.json**, and add:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"],
      "env": {
        "LINKEDIN_MCP_DRY_RUN": "true",
        "LINKEDIN_MCP_TOOLSETS": "lite"
      },
      "timeout": 60000
    }
  }
}
```

The file is `~/.lmstudio/mcp.json` (`%USERPROFILE%\.lmstudio\mcp.json` on Windows), but LM Studio recommends editing it in the app.

- **Approvals:** LM Studio shows a confirmation before each tool call, and lets you edit the arguments.
- **Timeout:** `timeout` is the maximum time per tool call, in milliseconds. The default isn't documented, so set it.
- **Many tools:** LM Studio warns that servers built for large cloud models can use many tokens and overflow a local model's context. Start with `LINKEDIN_MCP_TOOLSETS=lite`.
- **Requirements:** `npx` must be on your system `PATH`.
- **Prompts and dialogs:** not documented.

Docs: [LM Studio MCP](https://lmstudio.ai/docs/app/mcp), [Add to LM Studio links](https://lmstudio.ai/docs/app/mcp/deeplink)

## Msty Studio

In Msty Studio 3.x, open **Toolbox** > **Tools** > **Add New Tool**, choose **STDIO / JSON**, and paste the server object on its own (not wrapped in `mcpServers`):

```json
{
  "command": "npx",
  "args": ["-y", "@danishfareed/linkedin-mcp"],
  "env": {
    "LINKEDIN_MCP_DRY_RUN": "true",
    "LINKEDIN_MCP_TOOLSETS": "lite"
  }
}
```

Click **Test tool**, then **Save**. Add the tool to a toolset and select that toolset in the conversation. Use a model that supports tool calling.

- **Many tools:** Msty suggests a small toolset for each task rather than every server at once.
- **Prompts, dialogs, timeout:** not documented.
- **Web app:** the browser app at msty.studio is still on 2.x and needs a link to the desktop app to run local tools.

Docs: [Msty Toolbox tools](https://docs.msty.ai/studio/v3/toolbox/tools), [Toolsets](https://docs.msty.ai/studio/v3/toolbox/toolsets)

## Jan

Go to **Settings** > **MCP Servers**, click **+**, and fill in:

- Server Name: `linkedin`
- Command: `npx`
- Arguments: `-y` and `@danishfareed/linkedin-mcp`
- Environment Variables: for example `LINKEDIN_MCP_DRY_RUN` = `true` and `LINKEDIN_MCP_TOOLSETS` = `lite`

Save it and turn the server on. Or use the Jan CLI, which writes the same config:

```
jan cli mcp add linkedin --command npx --arg -y --arg @danishfareed/linkedin-mcp --env LINKEDIN_MCP_DRY_RUN=true --active
```

- **Timeout:** Jan's **Tool call timeout** (in **Settings** > **MCP Servers**) is **30 seconds by default**, shorter than linkedin-mcp's 55. Set it to 60 or more.
- **Approvals:** Jan asks you to approve each tool call unless you turn on **Allow All MCP Tool Permissions**.
- **Local models:** turn on tool calling in the model's settings (the edit button in Model Capabilities).
- **Many tools:** Jan's smart tool routing narrows which servers are used on each turn when you have several.
- **Prompts and dialogs:** not documented.

Docs: [Jan MCP](https://docs.jan.ai/desktop/mcp), [MCP server settings](https://docs.jan.ai/desktop/integrations/mcp-servers)

## 5ire

5ire needs Node.js installed. Open **Tools**, add a new tool as a local server, and enter `npx -y @danishfareed/linkedin-mcp` as the command, with any environment variables.

5ire can also install from a link. Base64-encode this config and open `app.5ire://install-tool#<base64>`:

```json
{
  "name": "linkedin-mcp",
  "command": "npx",
  "args": ["-y", "@danishfareed/linkedin-mcp"],
  "env": {
    "LINKEDIN_MCP_DRY_RUN": "true"
  }
}
```

5ire lists tools and prompts as supported MCP features. Its docs are thin: the steps above come from its README and wiki, and dialogs, timeouts and tool limits aren't documented.

Docs: [5ire README](https://github.com/nanbingxyz/5ire), [One-click server installation](https://github.com/nanbingxyz/5ire/wiki)

## Cherry Studio

Go to **Settings** > **MCP** > **MCP Servers** > **Add** > **Import from JSON**, and paste:

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

Then bind it to an agent: **Work** > the agent's menu > **Edit** > **MCP**, and turn the server on.

- **Prompts:** choose **MCP Prompts** to insert one; its parameters appear as fields.
- **Resources:** choose **MCP Resources** to attach one.
- **Approvals:** follow the agent's permission mode.
- **Missing commands:** if the logs say a command isn't found, install it from **Settings** > **Dependencies**.
- **Many tools:** Cherry Studio suggests binding only the servers each agent needs.
- **Dialogs, timeout:** not documented.

Docs: [Cherry Studio MCP](https://cherryai.com/docs/en/advanced-basic/extensions/mcp/)

## BoltAI

BoltAI (macOS and Windows) keeps local servers in `~/.boltai/mcp.json` (on Windows, `mcp.json` in the `.boltai` folder of your user folder). Open **Settings** > **MCP Servers** > **Edit Configuration**, add the entry, and save:

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

If you already set linkedin-mcp up in Claude Desktop or Cursor, use **Import from Claude Desktop** or **Import from Cursor** on the same page instead. Then turn the server on in a chat with the **Tools** button > **MCP Servers**. Use a model that supports tools.

- **macOS:** if `npx` isn't found, add its folder under **PATH Entries** (the **⋯** menu > **Configure Runtime ENV…**), or use the full path to `npx`.
- **Prompts, dialogs, timeout, tool limits:** not documented.

Docs: [BoltAI MCP servers and connectors](https://help.boltai.com/en/articles/3595143-mcp-servers-and-connectors)

## Kiro (formerly Amazon Q Developer CLI)

The Amazon Q Developer CLI is now the Kiro CLI. When it updated, it copied servers from `~/.aws/amazonq/mcp.json` to Kiro's file. Kiro IDE and Kiro CLI share these files:

- User: `~/.kiro/settings/mcp.json`
- Workspace: `.kiro/settings/mcp.json` (wins over the user file)

In Kiro IDE, run **Kiro: Open user MCP config (JSON)** from the Command Palette.

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
      "autoApprove": [],
      "disabledTools": []
    }
  }
}
```

From the Kiro CLI:

```
kiro-cli mcp add --name linkedin --scope global --command npx --args '["-y","@danishfareed/linkedin-mcp"]' --env "LINKEDIN_MCP_DRY_RUN=true"
```

- **Prompts:** in the CLI, use `/prompts list` and `/prompts get`. In the IDE, prompts and resource templates appear in the `#` menu.
- **Dialogs:** Kiro IDE shows them inline. Kiro CLI shows them in interactive sessions from version 2.34; headless runs (`--no-interactive`) don't.
- **Many tools:** Kiro IDE 1.3 and later, and Kiro CLI 2.31 and later, use tool search. Tool names longer than 64 characters, counting the server prefix, are dropped; linkedin-mcp's names are well under that.
- **Timeouts:** each call waits up to 120 seconds by default (`requestTimeout`); the handshake waits 60 seconds (`timeout`). Both are in milliseconds.
- **Approvals:** in an untrusted workspace, every tool call asks for approval.
- **Windows:** Kiro CLI needs Windows 11. Commands found on your `PATH` as `.cmd` files, such as `npx`, run with their arguments unchanged, so no `cmd /c` wrapper is needed.

Docs: [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration), [Kiro CLI commands](https://kiro.dev/docs/reference/cli-commands), [Migrating from Amazon Q](https://kiro.dev/docs/upgrade-guides/migrating-from-q)

## Warp

Go to **Settings** > **Agents** > **MCP servers** (or run **Open MCP Servers** from the Command Palette), click **+ Add**, and paste:

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

Warp also reads `~/.warp/.mcp.json` (global, started automatically) and `.warp/.mcp.json` in a project (started after you approve it).

- **Approvals:** Agent Profiles have an MCP allowlist and denylist, per server.
- **Sharing:** if you share the server with a team, Warp removes sensitive `env` values.
- **Resources:** each running server lists its tools and resources.
- **Prompts, dialogs, timeout and tool limits:** not documented.

Docs: [Warp MCP](https://docs.warp.dev/agents/capabilities/mcp)

## n8n

n8n's built-in MCP nodes only connect over HTTP, so run linkedin-mcp in [local HTTP mode](#local-http-mode-optional) first. Then add an **MCP Client Tool** node to an AI Agent (or use the **MCP Client** node as a normal workflow step):

- Endpoint: `http://127.0.0.1:3333/mcp`
- Server Transport: **HTTP Streamable**
- Authentication: **Bearer Auth**, with the token the server printed
- Tools to Include: **All**, **Selected** or **All Except**

**n8n must run on the same machine, outside a container.** linkedin-mcp's HTTP mode listens on `127.0.0.1` only and accepts only `127.0.0.1` and `localhost` as the host. Inside a Docker container, `127.0.0.1` is the container itself, and `host.docker.internal` is refused. Run n8n directly (for example `npx n8n`), or start its container with Docker's host networking (Linux, or Docker Desktop 4.34 and later with host networking turned on). n8n Cloud can't reach your computer.

- **Prompts, resources and dialogs:** the nodes use tools only, so sends go through the preview and confirmation token.
- **Timeout:** the MCP Client node has a **Timeout** option, in milliseconds.

Docs: [MCP Client Tool node](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/), [MCP Client node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient/)

## For developers

Short snippets for attaching linkedin-mcp to your own agent. Two things apply to all of them:

- The official MCP SDKs, and agent SDKs built on them, start the server with a minimal environment (`HOME`, `PATH` and a few others), not your shell's. Pass every `LINKEDIN_MCP_*` setting in `env`.
- If your code doesn't answer MCP dialogs, set `LINKEDIN_MCP_CONFIRM_IN_CLIENT=false`. Otherwise an unanswered approval dialog stops every send.

### Claude Agent SDK

TypeScript:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Show my LinkedIn sign-in status",
  options: {
    mcpServers: {
      linkedin: {
        command: "npx",
        args: ["-y", "@danishfareed/linkedin-mcp"],
        env: { LINKEDIN_MCP_DRY_RUN: "true" },
      },
    },
    allowedTools: ["mcp__linkedin__*"],
  },
})) {
  console.log(message);
}
```

Python:

```python
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    mcp_servers={
        "linkedin": {
            "command": "npx",
            "args": ["-y", "@danishfareed/linkedin-mcp"],
            "env": {"LINKEDIN_MCP_DRY_RUN": "true"},
        }
    },
    allowed_tools=["mcp__linkedin__*"],
)

async for message in query(prompt="Show my LinkedIn sign-in status", options=options):
    print(message)
```

Tools are named `mcp__linkedin__<tool>` and need permission through `allowedTools`. Server startup times out after 30 seconds (`MCP_TIMEOUT`). In TypeScript, handle dialogs with the `onElicitation` option; without it, they're declined. The Python SDK has no dialog handler, so set `LINKEDIN_MCP_CONFIRM_IN_CLIENT=false` there.

Docs: [Agent SDK MCP](https://code.claude.com/docs/en/agent-sdk/mcp)

### OpenAI Agents SDK

Python:

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="linkedin",
    params={
        "command": "npx",
        "args": ["-y", "@danishfareed/linkedin-mcp"],
        "env": {"LINKEDIN_MCP_DRY_RUN": "true", "LINKEDIN_MCP_CONFIRM_IN_CLIENT": "false"},
    },
    client_session_timeout_seconds=70,
    cache_tools_list=True,
) as server:
    agent = Agent(name="Assistant", mcp_servers=[server])
    result = await Runner.run(agent, "Show my LinkedIn sign-in status")
    print(result.final_output)
```

TypeScript:

```ts
import { Agent, run, MCPServerStdio } from "@openai/agents";

const server = new MCPServerStdio({
  name: "linkedin",
  command: "npx",
  args: ["-y", "@danishfareed/linkedin-mcp"],
  env: { LINKEDIN_MCP_DRY_RUN: "true", LINKEDIN_MCP_CONFIRM_IN_CLIENT: "false" },
  clientSessionTimeoutSeconds: 70,
  timeout: 70_000,
});
await server.connect();
try {
  const result = await run(new Agent({ name: "Assistant", mcpServers: [server] }), "Show my LinkedIn sign-in status");
  console.log(result.finalOutput);
} finally {
  await server.close();
}
```

The Python SDK's session timeout is 5 seconds by default, which cuts off most LinkedIn calls, so raise it as above. To expose fewer tools, use `tool_filter` (Python) or `toolFilter` (TypeScript), or `LINKEDIN_MCP_TOOLSETS`.

Docs: [Agents SDK MCP (Python)](https://openai.github.io/openai-agents-python/mcp/), [Agents SDK MCP (TypeScript)](https://openai.github.io/openai-agents-js/guides/mcp/)

### MCP SDK clients

These use version 2 of the official SDKs.

TypeScript (`@modelcontextprotocol/client`):

```ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "my-client", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@danishfareed/linkedin-mcp"],
  env: { LINKEDIN_MCP_DRY_RUN: "true" },
});
await client.connect(transport);
const { tools } = await client.listTools();
console.log(tools.map((t) => t.name));
await client.close();
```

Python (`mcp`):

```python
from mcp import Client, StdioServerParameters

server = StdioServerParameters(
    command="npx",
    args=["-y", "@danishfareed/linkedin-mcp"],
    env={"LINKEDIN_MCP_DRY_RUN": "true"},
)

async def main() -> None:
    async with Client(server) as client:
        result = await client.list_tools()
        print([tool.name for tool in result.tools])
```

Both handle Windows for you: the TypeScript SDK uses `cross-spawn`, and the Python SDK runs `npx.cmd`. On SDK version 1, use `@modelcontextprotocol/sdk` (TypeScript) or `ClientSession` with `stdio_client` (Python).

Docs: [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Python SDK](https://github.com/modelcontextprotocol/python-sdk), [Build an MCP client](https://modelcontextprotocol.io/docs/develop/build-client)

## Any other MCP client

If the client supports stdio servers, give it:

- command: `npx`
- arguments: `-y`, `@danishfareed/linkedin-mcp`
- environment: any of the [optional settings](#optional-settings)

Most clients accept the `mcpServers` JSON shown under Claude Desktop. If the client only supports HTTP, use the local HTTP mode below. If its tool-call timeout is under 60 seconds, see [Tool-call timeouts](#tool-call-timeouts).

## Clients with tool limits

linkedin-mcp has 53 tools. Most clients handle that, and several load tools only when needed (Claude Code, Cursor, Kiro, Copilot's tool search). Some clients cap the number of tools, and small local models slow down or lose track when given many tool definitions. For those, load fewer tools with `LINKEDIN_MCP_TOOLSETS`.

The value is a comma-separated list of groups, presets or both:

- **Groups:** `core`, `posting`, `engagement`, `research`, `jobs`, `network`, `growth`, `visuals`
- **Presets:**

| Preset | Groups | Tools |
|---|---|---|
| `all` (default) | every group | 53 |
| `creator` | core, posting, engagement, growth, visuals | 38 |
| `outreach` | core, research, jobs, network | 27 |
| `lite` | core, posting, engagement | 26 |

`core` (approval, safety, status and your own profile: 12 tools) is always included. You can mix them. For example, `LINKEDIN_MCP_TOOLSETS=lite,growth` loads the `lite` preset plus the growth tools.

```json
"env": {
  "LINKEDIN_MCP_TOOLSETS": "creator"
}
```

Which preset fits:

| Client | Limit | Suggested setting |
|---|---|---|
| Junie | 100 tools across all MCP servers | `all` if linkedin-mcp is your only server. With others, keep the total under 100: `creator`, `outreach` or `lite`. |
| VS Code, older editor format | 128 tools per request, including built-in and other servers' tools | `creator` or `lite`, or move to the Copilot format, which uses tool search. |
| Windsurf builds with the old Cascade agent | 100 tools across all servers | `creator`, or `lite` if you have other servers. |
| Older Cursor versions | Capped the tools sent to the model | `lite`, or update Cursor. |
| Local-model apps (LM Studio, Jan, Msty Studio, Cherry Studio, 5ire, BoltAI with a local model) | No hard cap, but every tool definition uses context | `lite`, or a single task: `lite,growth` for writing, `outreach` for research and networking. |
| Kilo Code, Goose | No hard cap; both warn that many tools can fill the context | `creator` or `lite` if responses slow down or get cut off. |

Several clients can also hide individual tools: `tools` in the Copilot format, `enabled_tools`/`disabled_tools` in Codex, `includeTools`/`excludeTools` in Gemini CLI, `disabledTools` in Devin Desktop and Kiro, `available_tools` in Goose, and **Tools to Include** in n8n. `LINKEDIN_MCP_TOOLSETS` works the same way in every client.

## Tool-call timeouts

linkedin-mcp answers every tool call within 55 seconds by default (`LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`, from 20 to 600). That fits clients that wait 60 seconds or more. These clients wait less by default, so raise their timeout:

| Client | Default | How to raise it |
|---|---|---|
| VS Code Copilot format, Copilot CLI | 30 s | `"timeout": 60000` on the server entry, or `--timeout 60000` |
| Jan | 30 s | **Settings** > **MCP Servers** > **Tool call timeout**: 60 |
| Kilo Code | 5 to 15 s (the docs disagree) | `"timeout": 60000` on the server entry |
| OpenAI Agents SDK (Python) | 5 s | `client_session_timeout_seconds=70` |
| Codex and ChatGPT desktop (server startup) | 10 s | `startup_timeout_sec = 30` |

If a client can't be raised, lower `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` to a few seconds under the client's limit. Calls then stop with a `TIMEOUT` error instead of being cut off without one.

Clients that wait 60 seconds by default: Cline, Zed, Junie, Codex (`tool_timeout_sec`) and n8n. Longer: Kiro (120 s), Goose (300 s) and Gemini CLI (600 s). Claude Code has no per-request timeout for stdio servers. If you raise `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`, raise the client's timeout above it too.

## Local HTTP mode (optional)

Use this when a client can only talk HTTP, or when you want several clients to share one server. Start the server in a terminal and leave it running:

```
npx -y @danishfareed/linkedin-mcp --http --port 3333
```

It serves Streamable HTTP at `http://127.0.0.1:3333/mcp`, on your machine only. Every request needs the header `Authorization: Bearer <token>`. The token is printed when the server starts and saved in `~/.config/linkedin-mcp/http-token`; set `LINKEDIN_MCP_HTTP_TOKEN` before starting to choose your own. Settings such as `LINKEDIN_MCP_DRY_RUN` or `LINKEDIN_MCP_TOOLSETS` go in that terminal's environment, not in the client config.

The server only answers requests addressed to `127.0.0.1` or `localhost`, so clients must run on the same machine and outside containers. Don't put it behind a public tunnel; see [Web apps](#web-apps-chatgpt-and-claudeai).

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

Codex and the ChatGPT desktop app, reading the token from an environment variable:

```
codex mcp add linkedin --url http://127.0.0.1:3333/mcp --bearer-token-env-var LINKEDIN_MCP_HTTP_TOKEN
```

The other clients take the same URL and header, with different field names:

| Client | Entry |
|---|---|
| VS Code (Copilot format) | `"type": "http", "url": "...", "headers": { "Authorization": "Bearer ${LINKEDIN_MCP_HTTP_TOKEN}" }` |
| Visual Studio | `"type": "http", "url": "...", "headers": { ... }` under `servers` |
| Cline | `"type": "streamableHttp", "url": "...", "headers": { ... }` |
| Devin Desktop | `"url": "...", "transport": "http", "headers": { ... }` |
| Kilo Code | `"type": "remote", "url": "...", "headers": { ... }` |
| Zed, Junie, Kiro, Warp, LM Studio | `"url": "...", "headers": { ... }` |
| Goose | `type: streamable_http`, `uri: "..."`, `headers: { Authorization: "Bearer ..." }` |
| Gemini CLI | `gemini mcp add --transport http --header "Authorization: Bearer YOUR_TOKEN" linkedin http://127.0.0.1:3333/mcp` |
| Continue | `type: streamable-http`, `url: ...`, `requestOptions: { headers: { Authorization: "Bearer ..." } }` |
| Cherry Studio | `"type": "streamableHttp", "url": "...", "headers": { ... }` |
| Jan | `jan cli mcp add linkedin --type http --url http://127.0.0.1:3333/mcp --header Authorization="Bearer YOUR_TOKEN"` |
| n8n | see [n8n](#n8n) |

For Claude Desktop, use the stdio setup: its connectors run from Anthropic's cloud and can't reach `127.0.0.1`.

## Troubleshooting

- **"Not signed in" errors:** run `npx @danishfareed/linkedin-mcp login` again in a terminal. Sign in with your email and password or a passkey; Google and Apple sign-in usually refuse to work inside an automated browser.
- **Tool calls time out:** see [Tool-call timeouts](#tool-call-timeouts). Most often the client gives up before linkedin-mcp's 55 seconds are up.
- **The first start times out:** the first `npx -y` run downloads the package, which can take longer than a client's startup timeout. Run `npx -y @danishfareed/linkedin-mcp status` once in a terminal, then restart the client.
- **No approval dialog appears:** only clients that support MCP dialogs show one (see the [summary](#summary)). Others rely on the preview and confirmation token, which is still required for every send.
- **Every send fails with `USER_DECLINED`, and no dialog appeared:** the client says it supports dialogs but declines them automatically. This happens in Claude Code headless runs with `--permission-prompts none`, in Copilot Autopilot, and in SDK code without a dialog handler. Set `LINKEDIN_MCP_CONFIRM_IN_CLIENT=false` for that setup; sends then go through the preview and confirmation token.
- **Too many tools, or the model ignores tools:** see [Clients with tool limits](#clients-with-tool-limits).
- **"Browser profile is already open in another process":** two things are using the saved LinkedIn session at once, such as two clients or a login window. Close one, or run the HTTP mode once and point all your clients at it.
- **The client can't find `npx`:** desktop apps don't always get the same `PATH` as your terminal, which is common with nvm. Put the full path to `npx` in `command` (find it with `which npx` on macOS and Linux, or `where npx` on Windows).
- **Windows: `spawn npx ENOENT` or the server won't start:** some clients can't start `npx` directly on Windows. Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@danishfareed/linkedin-mcp"]`. Kilo Code's docs show this form.
- **Changes don't show up:** restart the client after editing its config file.
- **Anything else:** `npx @danishfareed/linkedin-mcp doctor` checks the browser, the sign-in and LinkedIn's page layout without changing anything.
