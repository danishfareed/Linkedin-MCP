/**
 * Generates the complete tool, prompt and resource reference in README.md
 * from the server's own definitions, between the `generated:` markers.
 *
 *   npm run docs        # rewrite README.md
 *   npm run docs:check  # fail if README.md is out of date (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLSET_GROUPS, TOOLSET_PRESETS, type ToolsetGroup } from "../src/config.js";
import { PLAYBOOK } from "../src/growth/playbook/index.js";
import { GROWTH_PROMPTS } from "../src/growth/prompts.js";
import { ALL_TOOLS, TOOLSET_OF, toolsFor } from "../src/server.js";
import { PREVIEW_NOTE, WRITE_PREVIEW, describeTools, isSendingTool } from "../src/tools/registry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = join(root, "README.md");

const GROUP_TITLES: Record<ToolsetGroup, string> = {
  core: "Session, safety and approval",
  posting: "Posting, scheduling and analytics",
  engagement: "Feed, comments and reactions",
  research: "Profiles, companies and people search",
  jobs: "Jobs",
  network: "Invitations and messages",
  growth: "Growth strategy, planning and playbook",
  visuals: "Images, quote cards and carousels",
};

type Schema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  anyOf?: Schema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
};

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
const code = (v: unknown) => `\`${typeof v === "string" ? v : JSON.stringify(v)}\``;

function typeOf(s: Schema): string {
  if (s.enum) return s.enum.map((v) => code(v)).join(" \\| ");
  if (s.anyOf) return s.anyOf.map(typeOf).join(" or ");
  if (s.type === "array") return s.items?.enum ? `array of ${typeOf(s.items)}` : `${s.items ? typeOf(s.items) : "any"}[]`;
  return s.type ?? "any";
}

function limits(s: Schema): string[] {
  const out: string[] = [];
  if (s.minimum !== undefined && s.maximum !== undefined) out.push(`${s.minimum}–${s.maximum}`);
  else if (s.minimum !== undefined) out.push(`min ${s.minimum}`);
  else if (s.maximum !== undefined) out.push(`max ${s.maximum}`);
  if (s.maxLength !== undefined) out.push(`up to ${s.maxLength} characters`);
  if (s.pattern) out.push(`pattern ${code(s.pattern).replace(/\|/g, "\\|")}`);
  if (s.minItems !== undefined || s.maxItems !== undefined) out.push(`${s.minItems ?? 0}–${s.maxItems ?? "∞"} items`);
  if (s.type === "object" && s.properties) out.push(`fields: ${Object.keys(s.properties).map((k) => `\`${k}\``).join(", ")}`);
  if (s.type === "array" && s.items?.type === "object" && s.items.properties) out.push(`each with: ${Object.keys(s.items.properties).map((k) => `\`${k}\``).join(", ")}`);
  return out;
}

function kind(tool: (typeof ALL_TOOLS)[number]): string {
  if (tool.annotations === WRITE_PREVIEW) return "Sends after your approval (returns a preview first)";
  if (isSendingTool(tool)) return "Sends approved previews";
  if (tool.annotations.readOnlyHint && tool.annotations.openWorldHint) return "Reads LinkedIn";
  if (tool.annotations.openWorldHint) return "Calls an outside service";
  return "Runs on your computer";
}

function toolSection(): string {
  const described = new Map(describeTools(ALL_TOOLS).map((t) => [t.name, t]));
  const parts: string[] = [];
  for (const group of TOOLSET_GROUPS) {
    const tools = ALL_TOOLS.filter((t) => TOOLSET_OF[t.name] === group);
    parts.push(`<details>\n<summary><b>${GROUP_TITLES[group]}</b> (${tools.length} tools, toolset <code>${group}</code>)</summary>\n`);
    for (const tool of tools) {
      const d = described.get(tool.name)!;
      const schema = d.inputSchema as Schema;
      const required = new Set(schema.required ?? []);
      parts.push(`#### \`${tool.name}\`\n\n**${tool.title}.** ${esc(tool.description.replace(PREVIEW_NOTE, ""))}\n\n*${kind(tool)}.*\n`);
      const props = Object.entries(schema.properties ?? {});
      if (!props.length) {
        parts.push("No parameters.\n");
        continue;
      }
      parts.push("| Parameter | Type | Required | Default | Details |\n|---|---|---|---|---|");
      for (const [name, p] of props) {
        const parts2 = [p.description ? esc(p.description).replace(/[.\s]+$/, "") : "", ...limits(p)].filter(Boolean);
        const details = parts2.length ? `${parts2.join(". ")}.` : "";
        parts.push(`| \`${name}\` | ${typeOf(p)} | ${required.has(name) ? "yes" : "no"} | ${p.default === undefined ? "" : code(p.default)} | ${details} |`);
      }
      parts.push("");
    }
    parts.push("</details>\n");
  }
  const presets = Object.entries(TOOLSET_PRESETS)
    .map(([name, groups]) => `| \`${name}\` | ${groups.map((g) => `\`${g}\``).join(", ")} | ${toolsFor(groups).length} |`)
    .join("\n");
  return `${parts.join("\n")}\n**Toolsets.** Load fewer tools with \`LINKEDIN_MCP_TOOLSETS\` (comma-separated presets and groups; \`core\` is always on):\n\n| Preset | Groups | Tools |\n|---|---|---|\n${presets}\n`;
}

function promptSection(): string {
  const rows = GROWTH_PROMPTS.map((p) => {
    const args = Object.entries(p.args)
      .map(([k, v]) => `\`${k}\`: ${esc(v)}`)
      .join("<br>");
    return `| \`${p.name}\` | ${esc(p.description)} | ${args || "none"} |`;
  });
  return `| Prompt | What it does | Arguments (all optional) |\n|---|---|---|\n${rows.join("\n")}\n`;
}

function resourceSection(): string {
  const rows = PLAYBOOK.map((t) => `| \`linkedin-mcp://playbook/${t.id}\` | ${esc(t.title)} | ${esc(t.summary)} |`);
  return `| Resource | Topic | What it covers |\n|---|---|---|\n| \`linkedin-mcp://playbook/index\` | Index | Every topic with a summary. |\n${rows.join("\n")}\n`;
}

function replaceBlock(text: string, name: string, body: string): string {
  const start = `<!-- generated:${name}:start (npm run docs) -->`;
  const end = `<!-- generated:${name}:end -->`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`README.md is missing the ${name} markers`);
  return `${text.slice(0, i + start.length)}\n${body}\n${text.slice(j)}`;
}

const current = readFileSync(readme, "utf8");
let next = replaceBlock(current, "tools", toolSection());
next = replaceBlock(next, "prompts", promptSection());
next = replaceBlock(next, "resources", resourceSection());

if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("README.md is out of date. Run `npm run docs` and commit the result.");
    process.exit(1);
  }
  console.log("README.md reference is up to date.");
} else {
  writeFileSync(readme, next);
  console.log(`README.md: ${ALL_TOOLS.length} tools, ${GROWTH_PROMPTS.length} prompts, ${PLAYBOOK.length + 1} resources.`);
}
