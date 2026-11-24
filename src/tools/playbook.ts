import { z } from "zod";
import { invalidInput } from "../errors.js";
import { PLAYBOOK, findTopic, playbookIndex, renderTopic, searchPlaybook, topicUri } from "../growth/playbook/index.js";
import type { PlaybookHit } from "../growth/playbook/index.js";
import { LOCAL, defineTool } from "./registry.js";

/** Long sections are cut to this many characters in search results; the full topic is one call away. */
const SECTION_MAX_CHARS = 6000;
const MAX_RESULTS = 5;

function hitResult(hit: PlaybookHit) {
  const cut = hit.text.length > SECTION_MAX_CHARS;
  return {
    topic: hit.topic,
    title: hit.title,
    section: hit.heading,
    uri: topicUri(hit.topic),
    text: cut ? `${hit.text.slice(0, SECTION_MAX_CHARS)}\n\n[…truncated; read the whole topic with get_playbook topic "${hit.topic}"]` : hit.text,
  };
}

/** The get_playbook logic: index, one topic, or the best-matching sections for a query. */
export function readPlaybook(args: { topic?: string; query?: string }): Record<string, unknown> {
  const topicArg = args.topic?.trim();
  const query = args.query?.trim();

  if (topicArg) {
    const topic = findTopic(topicArg);
    if (!topic) {
      throw invalidInput(`There is no playbook topic "${topicArg}". Use one of: ${PLAYBOOK.map((t) => t.id).join(", ")}.`, { topics: PLAYBOOK.map((t) => t.id) });
    }
    if (query) {
      const hits = searchPlaybook(query, { topic: topic.id, limit: MAX_RESULTS });
      return hits.length
        ? { topic: topic.id, query, results: hits.map(hitResult) }
        : { topic: topic.id, query, results: [], note: `Nothing in "${topic.id}" matched. Leave out topic to search the whole playbook, or read the topic in full.` };
    }
    return { id: topic.id, title: topic.title, uri: topicUri(topic.id), summary: topic.summary, markdown: renderTopic(topic) };
  }

  if (query) {
    const hits = searchPlaybook(query, { limit: MAX_RESULTS });
    if (!hits.length) return { query, results: [], note: "No section matched. Try different words, or pick a topic from the index.", topics: playbookIndex() };
    return { query, results: hits.map(hitResult) };
  }

  return {
    topics: playbookIndex(),
    how_to_use: "Call get_playbook with topic set to an id to read it in full, or with query to get the most relevant sections across topics. Claims are labelled and sourced; numbers come with their source and year.",
  };
}

export const playbookTools = [
  defineTool({
    name: "get_playbook",
    title: "Read the LinkedIn growth playbook",
    description:
      "A researched, sourced LinkedIn growth playbook: how the feed distributes posts (official statements vs data studies vs practitioner advice), the psychology of attention and persuasion, hooks, 28 post formats, content strategy and funnels, profile optimisation, engagement, writing and voice, measurement and experiments, persona playbooks (founders, sales, job seekers, consultants, creators) and ethics. " +
      "With no arguments it returns the index. With topic it returns that topic in full as markdown. With query it returns the most relevant sections (within topic, if both are given). " +
      "Read the relevant topic before planning strategy, writing or reviewing posts. Reads local text only; never contacts LinkedIn.",
    input: {
      topic: z
        .string()
        .max(100)
        .optional()
        .describe(`Topic id: ${PLAYBOOK.map((t) => t.id).join(", ")}.`),
      query: z.string().max(300).optional().describe('Free-text search, e.g. "link in first comment", "carousel slides", "headline formula".'),
    },
    annotations: LOCAL,
    handler: async (args) => readPlaybook(args),
  }),
];
