/**
 * Every number review_post uses, with where it comes from. Change them here,
 * not in the checks. `confidence` says how much to trust the basis:
 *   platform  - LinkedIn's own product behaviour or statements
 *   research  - published research or a standard formula
 *   heuristic - widely used rule of thumb or observation; adjust from your own analytics
 */

export type BasisConfidence = "platform" | "research" | "heuristic";

export interface Basis {
  confidence: BasisConfidence;
  source: string;
}

/**
 * Where LinkedIn cuts a post with "…see more". LinkedIn doesn't document
 * this, and it changes with screen width, line breaks and media. Third-party
 * preview tools (checked Nov 2026) give about 210 characters (some say up to
 * 240) or about 5 lines on desktop for text-only posts, about 3 lines with
 * media, and about 140 characters (140-160) or about 3 lines on mobile.
 * A line break counts as a full line. Callers can override all of it.
 */
export interface FoldSettings {
  desktop_chars: number;
  desktop_lines_text_only: number;
  desktop_lines_with_media: number;
  desktop_chars_per_line: number;
  mobile_chars: number;
  mobile_lines: number;
  mobile_chars_per_line: number;
}

export const DEFAULT_FOLD: FoldSettings = {
  desktop_chars: 210,
  desktop_lines_text_only: 5,
  desktop_lines_with_media: 3,
  desktop_chars_per_line: 70,
  mobile_chars: 140,
  mobile_lines: 3,
  mobile_chars_per_line: 47,
};

export const FOLD_BASIS: Basis = {
  confidence: "heuristic",
  source:
    "Not documented by LinkedIn. Third-party preview tools agree on roughly 210 characters (some 210-240) or ~5 lines on desktop (~3 with media) and roughly 140 characters (140-160) or ~3 lines on mobile; line breaks count as full lines. Treat the fold as approximate and override it if you see different behaviour.",
};

export const REVIEW_THRESHOLDS = {
  length_limit: {
    max: 3000,
    warn_above: 2800,
    weight: 3,
    basis: { confidence: "platform", source: "LinkedIn's post composer accepts up to 3,000 characters (the same limit create_post and schedule_post enforce)." },
  },
  hook_length: {
    pass_max: 100,
    warn_max: 150,
    weight: 2,
    basis: { confidence: "heuristic", source: "Derived from the ~140-character mobile fold: a first line under ~100 characters leaves room for a second line above the fold on a phone." },
  },
  fold: {
    weight: 3,
    basis: FOLD_BASIS,
  },
  first_line: {
    weight: 3,
    min_signals: 1,
    max_words_for_short_signal: 12,
    basis: { confidence: "heuristic", source: "Copywriting practice: openers that announce or warm up ('I'm excited to share', 'Hey everyone') delay the point; specific numbers, tension words and direct address are common traits of strong hooks." },
  },
  readability: {
    pass_min: 60,
    warn_min: 50,
    min_words: 30,
    weight: 2,
    basis: { confidence: "research", source: "Flesch Reading Ease (Flesch 1948; 206.835 − 1.015·words/sentence − 84.6·syllables/word). 60-70 is 'plain English'; below 50 reads like academic text. Syllables are estimated, so scores are approximate." },
  },
  sentence_length: {
    pass_avg_max: 18,
    warn_avg_max: 25,
    long_sentence_words: 35,
    weight: 2,
    basis: { confidence: "research", source: "Plain-language guidance (e.g. plainlanguage.gov) recommends an average of 15-20 words per sentence; sentences past ~35 words are hard to follow on a phone." },
  },
  paragraphs: {
    pass_max_sentences: 3,
    warn_max_sentences: 4,
    pass_max_chars: 280,
    warn_max_chars: 400,
    weight: 2,
    basis: { confidence: "heuristic", source: "Mobile reading: a 400-character paragraph is roughly 9 lines on a phone. Short paragraphs are standard practice for feed writing." },
  },
  whitespace: {
    wall_of_text_chars: 300,
    blank_line_needed_chars: 600,
    blank_line_needed_lines: 6,
    weight: 2,
    basis: { confidence: "heuristic", source: "Posts over ~300 characters with no line breaks render as a single block. Blank lines between ideas make long posts scannable." },
  },
  length_band: {
    short_below: 300,
    long_above: 1900,
    very_long_above: 2600,
    weight: 1,
    basis: {
      confidence: "heuristic",
      source:
        "No LinkedIn guidance. Creator-tool analyses commonly report text posts of roughly 900-2,000 characters performing well, and very short posts working mainly as questions or with an image. Your own history (growth_report) beats this.",
    },
  },
  specificity: {
    pass_per_100_words: 3,
    warn_per_100_words: 1,
    min_words: 40,
    vague_per_100_words: 3,
    weight: 2,
    basis: { confidence: "heuristic", source: "Concrete details (numbers, names, dates) make claims believable and memorable; counted per 100 words so length doesn't distort it." },
  },
  reader_focus: {
    max_i_to_you_ratio: 4,
    max_i_to_you_ratio_story: 8,
    min_i_words: 6,
    weight: 1,
    basis: { confidence: "heuristic", source: "Copywriting practice: readers engage when the post says what's in it for them. Story posts are naturally 'I'-heavy, so they get a looser ratio." },
  },
  ai_tells: {
    warn_at: 1,
    fail_at: 3,
    em_dash_double_count_at: 3,
    emoji_bullets_tell_at: 4,
    emoji_bullets_double_at: 7,
    triad_lists_tell_at: 2,
    weight: 3,
    basis: {
      confidence: "heuristic",
      source:
        "Word-level markers follow research on excess vocabulary in LLM-assisted writing (e.g. 'delve'; Kobak et al. 2024, arXiv:2406.07016). Structural markers (em dashes, 'it's not X, it's Y', emoji bullets, triads) are widely reported by editors and readers; none is proof on its own, so several are needed to fail.",
    },
  },
  hashtags: {
    pass_max: 3,
    warn_max: 5,
    weight: 1,
    basis: { confidence: "heuristic", source: "Common creator guidance is 0-3 hashtags; more adds clutter without clear reach benefit. No current LinkedIn figure found." },
  },
  external_links: {
    weight: 1,
    basis: {
      confidence: "heuristic",
      source:
        "Evidence is mixed. Many creators and tool vendors report lower reach for posts with a link in the body, but LinkedIn hasn't confirmed a link penalty, and 'link in the first comment' is reported to underperform too. Test it against your own analytics.",
    },
  },
  engagement_bait: {
    weight: 3,
    basis: {
      confidence: "platform",
      source:
        "LinkedIn said in May 2022 it would stop promoting posts that expressly ask for likes or reactions, and in March 2026 (news.linkedin.com, 'Improving the Feed') that it is reducing engagement bait such as 'comment to agree' prompts.",
    },
  },
  cta: {
    weight: 2,
    basis: { confidence: "heuristic", source: "Every post should give the reader one next step that fits its funnel stage: conversation for reach, lead magnets for consideration, a direct offer for conversion." },
  },
  banned_phrases: {
    weight: 3,
    basis: { confidence: "platform", source: "The user's own banned words and phrases from the growth profile (voice.banned_words, voice.banned_phrases) and topics to avoid." },
  },
  repeated_opening: {
    same_first_words_warn: 3,
    same_first_words_fail: 5,
    similarity_fail: 0.8,
    recent_posts: 30,
    weight: 1,
    basis: { confidence: "heuristic", source: "Followers see your posts in a row; reusing an opening makes posts feel templated. Compared against your last 30 posts in the analytics history and other calendar drafts." },
  },
} as const satisfies Record<string, { weight: number; basis: Basis; [setting: string]: unknown }>;

export type CheckId = keyof typeof REVIEW_THRESHOLDS;

/** Score bands for the overall verdict. */
export const VERDICTS = [
  { min: 85, label: "strong" },
  { min: 70, label: "good" },
  { min: 50, label: "needs work" },
  { min: 0, label: "rewrite" },
] as const;

/** How a status counts towards the score. */
export const STATUS_CREDIT = { pass: 1, warn: 0.5, fail: 0 } as const;

/**
 * Design choice, not research: most checks pass easily, so a weighted average
 * alone would let a draft with serious problems score "good". A failing check
 * is something to fix before posting, so it caps the score.
 */
export const SCORE_CAPS = [
  { fails: 3, max: 49 },
  { fails: 1, max: 69 },
] as const;
