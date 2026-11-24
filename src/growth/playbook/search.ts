import type { PlaybookTopic } from "./types.js";

/** A heading-delimited slice of a topic: the unit that search returns. */
export interface PlaybookSection {
  topic: string;
  /** "Section" or "Section › Subsection". */
  heading: string;
  text: string;
}

export interface PlaybookHit extends PlaybookSection {
  title: string;
  score: number;
}

/**
 * Split a topic body into sections at "##" and "###" headings. A "###"
 * section's heading carries its parent "##" heading for context. Text before
 * the first heading becomes an "Overview" section.
 */
export function splitSections(topic: PlaybookTopic): PlaybookSection[] {
  const sections: PlaybookSection[] = [];
  let h2 = "";
  let heading = "Overview";
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ topic: topic.id, heading, text });
    lines = [];
  };
  for (const line of topic.body.split("\n")) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      if (m[1] === "##") {
        h2 = m[2]!;
        heading = h2;
      } else {
        heading = h2 ? `${h2} › ${m[2]!}` : m[2]!;
      }
    }
    lines.push(line);
  }
  flush();
  return sections;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be but by can do does for from get got had has have how i if in into is it its me my of on or our " +
    "should so than that the their them then there these they this to up us was we what when where which who why will " +
    "with would you your about any some more most much very just also not no make use using need want best way ways"
  ).split(" "),
);

/** Very light stemming so "hooks", "hooking" and "hook" match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Query words that should also match their usual LinkedIn synonyms. */
const SYNONYMS: Record<string, string[]> = {
  carousel: ["document", "pdf", "slide"],
  document: ["carousel"],
  pdf: ["carousel", "document"],
  algorithm: ["distribution", "feed", "ranking", "reach"],
  reach: ["distribution", "impression"],
  viral: ["reach", "distribution"],
  hook: ["opening", "fold"],
  opening: ["hook"],
  cta: ["call", "action"],
  dm: ["message"],
  message: ["dm"],
  pod: ["inauthentic", "engagement"],
  follower: ["audience", "growth"],
  lead: ["pipeline", "bof"],
  pipeline: ["lead", "bof"],
  job: ["hiring", "recruiter", "seeker"],
  recruiter: ["job", "seeker"],
  headline: ["profile"],
  banner: ["cover", "profile"],
  metric: ["analytics", "measurement"],
  analytics: ["metric", "measurement"],
  persuasion: ["psychology", "cialdini"],
  psychology: ["persuasion"],
  ai: ["generic", "tell"],
  schedule: ["cadence", "frequency", "calendar"],
  frequency: ["cadence"],
  often: ["frequency", "cadence"],
  cadence: ["frequency"],
};

function expandQuery(terms: string[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const t of terms) weights.set(t, Math.max(weights.get(t) ?? 0, 1));
  for (const t of terms) {
    for (const s of SYNONYMS[t] ?? []) {
      const st = stem(s);
      if (!weights.has(st)) weights.set(st, 0.4);
    }
  }
  return weights;
}

interface IndexedSection {
  section: PlaybookSection;
  title: string;
  counts: Map<string, number>;
  length: number;
}

const HEADING_WEIGHT = 4;
const KEYWORD_WEIGHT = 2;

function indexSections(topics: readonly PlaybookTopic[]): IndexedSection[] {
  const out: IndexedSection[] = [];
  for (const topic of topics) {
    const topicTerms = tokenize(`${topic.title} ${topic.keywords.join(" ")}`);
    for (const section of splitSections(topic)) {
      const counts = new Map<string, number>();
      const add = (terms: string[], w: number) => {
        for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + w);
      };
      add(tokenize(section.text), 1);
      add(tokenize(section.heading), HEADING_WEIGHT);
      add(topicTerms, KEYWORD_WEIGHT);
      let length = 0;
      for (const n of counts.values()) length += n;
      out.push({ section, title: topic.title, counts, length });
    }
  }
  return out;
}

const cache = new WeakMap<readonly PlaybookTopic[], IndexedSection[]>();

/**
 * Rank playbook sections against a free-text query with BM25 (k1 1.2, b 0.75),
 * counting heading and topic-keyword matches extra. Returns the best matches.
 */
export function searchSections(topics: readonly PlaybookTopic[], query: string, opts: { topic?: string; limit?: number } = {}): PlaybookHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  let index = cache.get(topics);
  if (!index) {
    index = indexSections(topics);
    cache.set(topics, index);
  }
  const pool = opts.topic ? index.filter((s) => s.section.topic === opts.topic) : index;
  if (!pool.length) return [];
  const n = index.length;
  const avgLength = index.reduce((sum, s) => sum + s.length, 0) / n;
  const weights = expandQuery(terms);
  const df = new Map<string, number>();
  for (const term of weights.keys()) df.set(term, index.filter((s) => s.counts.has(term)).length);

  const k1 = 1.2;
  const b = 0.75;
  const phrase = query.toLowerCase().trim();
  const hits: PlaybookHit[] = [];
  for (const s of pool) {
    let score = 0;
    let matched = 0;
    for (const [term, w] of weights) {
      const tf = s.counts.get(term);
      if (!tf) continue;
      if (w === 1) matched++;
      const idf = Math.log(1 + (n - df.get(term)! + 0.5) / (df.get(term)! + 0.5));
      score += w * idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * s.length) / avgLength)));
    }
    if (!score) continue;
    // Reward sections that match more of the distinct query words, and exact phrases.
    score *= 1 + matched / terms.length;
    if (phrase.length > 3 && phrase.includes(" ") && s.section.text.toLowerCase().includes(phrase)) score *= 1.5;
    hits.push({ ...s.section, title: s.title, score: Math.round(score * 100) / 100 });
  }
  return hits.sort((a, b2) => b2.score - a.score).slice(0, opts.limit ?? 5);
}
