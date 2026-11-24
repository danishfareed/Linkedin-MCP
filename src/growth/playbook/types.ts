/** One topic of the growth playbook. The body is markdown that starts at "##" headings (the title is added when served). */
export interface PlaybookTopic {
  /** Stable kebab-case id, used in get_playbook and in the resource URI. */
  id: string;
  title: string;
  /** One or two sentences: what the topic covers and when to read it. */
  summary: string;
  /** Extra search terms that aren't obvious from the text. */
  keywords: readonly string[];
  body: string;
}
