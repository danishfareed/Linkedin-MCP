import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGrowthPrompts } from "../prompts.js";
import { algorithm } from "./algorithm.js";
import { engagement } from "./engagement.js";
import { ethics } from "./ethics.js";
import { formats } from "./formats.js";
import { hooks } from "./hooks.js";
import { measurement } from "./measurement.js";
import { personas } from "./personas.js";
import { profile } from "./profile.js";
import { psychology } from "./psychology.js";
import { type PlaybookHit, searchSections } from "./search.js";
import { strategy } from "./strategy.js";
import type { PlaybookTopic } from "./types.js";
import { writing } from "./writing.js";

export type { PlaybookTopic } from "./types.js";
export type { PlaybookHit, PlaybookSection } from "./search.js";
export { splitSections } from "./search.js";

/** Every playbook topic, in reading order. */
export const PLAYBOOK: readonly PlaybookTopic[] = [
  algorithm,
  psychology,
  hooks,
  formats,
  strategy,
  profile,
  engagement,
  writing,
  measurement,
  personas,
  ethics,
];

export const PLAYBOOK_URI_PREFIX = "linkedin-mcp://playbook/";
export const PLAYBOOK_INDEX_URI = `${PLAYBOOK_URI_PREFIX}index`;

export function topicUri(id: string): string {
  return `${PLAYBOOK_URI_PREFIX}${id}`;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export interface PlaybookIndexEntry {
  id: string;
  title: string;
  summary: string;
  uri: string;
  words: number;
}

export function playbookIndex(): PlaybookIndexEntry[] {
  return PLAYBOOK.map((t) => ({ id: t.id, title: t.title, summary: t.summary, uri: topicUri(t.id), words: wordCount(t.body) }));
}

const ALIASES: Record<string, string> = {
  feed: "algorithm",
  distribution: "algorithm",
  persuasion: "psychology",
  hook: "hooks",
  formats: "post-formats",
  format: "post-formats",
  methods: "post-formats",
  strategy: "content-strategy",
  funnel: "content-strategy",
  voice: "writing",
  metrics: "measurement",
  analytics: "measurement",
  persona: "personas",
  compliance: "ethics",
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Find a topic by id, title or a common alias, ignoring case, spaces and underscores. */
export function findTopic(input: string): PlaybookTopic | undefined {
  const key = normalise(input);
  if (!key) return undefined;
  const byId = PLAYBOOK.find((t) => t.id === key) ?? PLAYBOOK.find((t) => normalise(t.title) === key);
  if (byId) return byId;
  const alias = ALIASES[key];
  if (alias) return PLAYBOOK.find((t) => t.id === alias);
  const prefixed = PLAYBOOK.filter((t) => t.id.startsWith(key));
  return prefixed.length === 1 ? prefixed[0] : undefined;
}

/** A topic as a standalone markdown document. */
export function renderTopic(topic: PlaybookTopic): string {
  return `# ${topic.title}\n\n_${topic.summary}_\n\n${topic.body.trim()}\n`;
}

export function renderIndex(): string {
  const rows = playbookIndex().map((t) => `- **${t.title}** (\`${t.id}\`, ${t.uri}): ${t.summary}`);
  return [
    "# LinkedIn growth playbook",
    "",
    "Researched, sourced guidance for growing on LinkedIn. Read a topic in full with get_playbook and its id, or search across topics with a query.",
    "",
    ...rows,
    "",
  ].join("\n");
}

export function searchPlaybook(query: string, opts: { topic?: string; limit?: number } = {}): PlaybookHit[] {
  return searchSections(PLAYBOOK, query, opts);
}

/** Registers every topic (and an index) as a markdown resource at linkedin-mcp://playbook/<id>. */
export function registerPlaybookResources(server: McpServer): void {
  server.registerResource(
    "playbook-index",
    PLAYBOOK_INDEX_URI,
    { title: "LinkedIn growth playbook: index", description: "Every playbook topic with a one-line summary.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderIndex() }] }),
  );
  for (const topic of PLAYBOOK) {
    server.registerResource(
      `playbook-${topic.id}`,
      topicUri(topic.id),
      { title: `Playbook: ${topic.title}`, description: topic.summary, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderTopic(topic) }] }),
    );
  }
}

/** Registers the playbook resources and the growth prompts. Call once per McpServer. */
export function registerPlaybook(server: McpServer): void {
  registerPlaybookResources(server);
  registerGrowthPrompts(server);
}
