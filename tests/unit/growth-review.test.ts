import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ReviewContext, type ReviewResult, detectCtas, reviewBases, reviewPost } from "../../src/growth/review/review.js";
import { charCount, foldView, readability, sentences, syllables } from "../../src/growth/review/text.js";
import { DEFAULT_FOLD, REVIEW_THRESHOLDS } from "../../src/growth/review/thresholds.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const drafts = JSON.parse(readFileSync(join(FIXTURES, "growth-drafts.json"), "utf8")) as Record<string, { text: string; context: ReviewContext }>;

function review(name: string, extra: ReviewContext = {}): ReviewResult {
  const d = drafts[name]!;
  return reviewPost(d.text, { ...d.context, ...extra });
}

const check = (r: ReviewResult, id: string) => r.checks.find((c) => c.id === id);
const status = (r: ReviewResult, id: string) => check(r, id)?.status;

describe("review_post on realistic drafts", () => {
  it.each(["good_story", "good_howto", "bof_offer"])("scores the good draft %s highly with nothing failing", (name) => {
    const r = review(name);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.verdict).toBe("strong");
    expect(r.ready_to_post).toBe(true);
    expect(r.summary.fail).toBe(0);
    expect(r.blockers).toEqual([]);
  });

  it("fails machine-sounding filler and caps its score", () => {
    const r = review("ai_slop");
    expect(status(r, "ai_tells")).toBe("fail");
    const tells = (check(r, "ai_tells")!.details!.tells as string[]).join(" | ");
    expect(tells).toMatch(/em dash/);
    expect(tells).toMatch(/delve/);
    expect(tells).toMatch(/let that sink in/);
    expect(tells).toMatch(/It's not X\. It's Y\./);
    expect(tells).toMatch(/emoji bullet/);
    expect(tells).toMatch(/three lines in a row starting with "be"/);
    expect(status(r, "first_line")).toBe("fail");
    expect(check(r, "first_line")!.reason).toMatch(/In today's world/);
    expect(status(r, "hashtags")).toBe("fail");
    expect(r.score).toBeLessThanOrEqual(49);
    expect(r.verdict).toBe("rewrite");
    expect(r.ready_to_post).toBe(false);
  });

  it("fails a throat-clearing wall of text on every readability measure", () => {
    const r = review("throat_clearing_wall");
    for (const id of ["first_line", "hook_length", "fold", "readability", "sentence_length", "paragraphs", "whitespace", "specificity"]) {
      expect(status(r, id), id).toBe("fail");
    }
    expect(check(r, "first_line")!.reason).toMatch(/I'm excited\/thrilled\/happy to/);
    expect(r.hook.see_more_mobile).toBe(true);
    expect(r.hook.above_fold_mobile.length).toBeLessThanOrEqual(DEFAULT_FOLD.mobile_chars);
    expect(r.score).toBeLessThan(50);
  });

  it("fails engagement bait LinkedIn says it demotes, and marks it as a blocker", () => {
    const r = review("bait");
    expect(status(r, "engagement_bait")).toBe("fail");
    expect(check(r, "engagement_bait")!.details!.phrases).toEqual(expect.arrayContaining(["like if you agree", "comment YES / type 'me'", "tag 3 friends"]));
    expect(r.blockers).toContain("engagement_bait");
    expect(r.ready_to_post).toBe(false);
    // "Comment YES" is bait, not a lead-magnet CTA.
    expect(detectCtas(drafts.bait!.text)).not.toContain("lead");
  });

  it("warns, and says the evidence is mixed, for a link in the body", () => {
    const r = review("link_in_body");
    expect(status(r, "external_links")).toBe("warn");
    expect(check(r, "external_links")!.reason).toMatch(/mixed/i);
    expect(check(r, "external_links")!.details!.links).toEqual(["https://example.com/salary-report-2026"]);
    expect(r.ready_to_post).toBe(true);
  });

  it("warns at 4-5 hashtags and still finds the question CTA above them", () => {
    const r = review("hashtag_heavy");
    expect(status(r, "hashtags")).toBe("warn");
    expect(status(r, "cta")).toBe("pass");
    expect(check(r, "cta")!.details!.cta_types).toContain("conversation");
  });

  it("is deterministic", () => {
    expect(review("good_story")).toEqual(review("good_story"));
  });
});

describe("character limit and length", () => {
  const filler = (n: number) => `Shipping beats planning.\n\n${"word ".repeat(Math.ceil(n / 5))}`.slice(0, n - 1) + ".";

  it("fails over 3,000 characters as a blocker and warns near the limit", () => {
    const over = reviewPost(filler(3001));
    expect(status(over, "length_limit")).toBe("fail");
    expect(over.blockers).toContain("length_limit");
    expect(status(reviewPost(filler(2900)), "length_limit")).toBe("warn");
    expect(status(reviewPost(filler(1000)), "length_limit")).toBe("pass");
  });

  it("counts an emoji as one character, like LinkedIn", () => {
    expect(charCount("🚀🚀")).toBe(2);
    expect(reviewPost("Launch day 🚀").characters).toBe(12);
  });

  it("treats a short post as fine when it carries media or asks a question", () => {
    expect(status(reviewPost("We shipped dark mode today."), "length_band")).toBe("warn");
    expect(status(reviewPost("We shipped dark mode today.", { has_media: true }), "length_band")).toBe("pass");
    expect(status(reviewPost("Which feature should we cut first?"), "length_band")).toBe("pass");
  });
});

describe("hook and the see-more fold", () => {
  it("shows what sits above the fold on desktop and mobile", () => {
    const r = review("good_story");
    expect(r.hook.first_line).toBe("We lost our biggest client in March 2025. It was 38% of revenue.");
    expect(r.hook.above_fold_mobile).toBe(r.hook.first_line);
    expect(r.hook.above_fold_desktop.startsWith(r.hook.first_line)).toBe(true);
    expect(r.hook.above_fold_desktop.length).toBeGreaterThan(r.hook.above_fold_mobile.length);
    expect(r.hook.see_more_mobile).toBe(true);
    expect(r.hook.fold_note).toMatch(/Not documented by LinkedIn/);
  });

  it("counts blank lines as lines and cuts at a word boundary", () => {
    const v = foldView("One.\n\nTwo.\n\nThree is a much longer line that keeps going", 140, 3, 47);
    expect(v.visible).toBe("One.\n\nTwo.");
    expect(v.truncated).toBe(true);
    const w = foldView("alpha beta gamma delta epsilon", 14, 5, 70);
    expect(w.visible).toBe("alpha beta");
  });

  it("doesn't truncate a post that fits", () => {
    const r = reviewPost("Short and sweet.\n\nWhat would you add?");
    expect(r.hook.see_more_mobile).toBe(false);
    expect(status(r, "fold")).toBe("pass");
  });

  it("shows fewer lines on desktop when media is attached", () => {
    const text = "Line one is here.\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.";
    expect(reviewPost(text).hook.above_fold_desktop.split("\n")).toHaveLength(5);
    expect(reviewPost(text, { has_media: true }).hook.above_fold_desktop.split("\n")).toHaveLength(3);
  });

  it("warns when the hook only fits on desktop, and fails when it doesn't fit at all", () => {
    const mid = "Our onboarding emails were costing us customers, and it took our small team almost a full year to notice why that kept happening to all of us.\n\nMore below.";
    const rMid = reviewPost(mid);
    expect(rMid.hook.first_line.length).toBeGreaterThan(140);
    expect(rMid.hook.first_line.length).toBeLessThanOrEqual(150);
    expect(status(rMid, "fold")).toBe("warn");
    expect(status(rMid, "hook_length")).toBe("warn");
    expect(check(rMid, "hook_length")!.fix).toMatch(/End the first line after "Our onboarding emails were costing us customers,"/);
    const long = reviewPost(`${"word ".repeat(60)}end.\n\nMore.`);
    expect(status(long, "fold")).toBe("fail");
    expect(status(long, "hook_length")).toBe("fail");
  });

  it("accepts a fold override", () => {
    const r = reviewPost(drafts.good_story!.text, { fold: { mobile_chars: 30 } });
    expect(r.hook.above_fold_mobile).toBe("We lost our biggest client in");
    expect(r.hook.fold_settings.mobile_chars).toBe(30);
    expect(status(r, "fold")).toBe("warn"); // cut on mobile, whole on desktop
  });
});

describe("first line", () => {
  it.each([
    "I'm thrilled to share that we raised a round.",
    "Hey everyone, quick question about hiring.",
    "So, here's what happened at work today.",
    "I wanted to share some thoughts on pricing.",
    "In this post I'll explain our roadmap.",
    "As many of you know, I changed jobs.",
  ])("fails the throat-clearing opener %j", (line) => {
    expect(status(reviewPost(`${line}\n\nMore detail here.`), "first_line")).toBe("fail");
  });

  it("passes an opener with a number, tension or direct address, and warns on a flat one", () => {
    expect(status(reviewPost("We cut churn 31% by deleting a feature.\n\nHere's how."), "first_line")).toBe("pass");
    expect(status(reviewPost("Stop sending follow-up emails on Fridays.\n\nHere's why."), "first_line")).toBe("pass");
    expect(status(reviewPost("Your onboarding is too long.\n\nHere's why."), "first_line")).toBe("pass");
    expect(status(reviewPost("Some thoughts on leadership.\n\nMore below."), "first_line")).toBe("warn");
  });

  it("flags cliché rhetorical-question openers as a machine tell", () => {
    const r = reviewPost("Have you ever wondered why projects slip?\n\nWe tracked 40 of them for a year.");
    expect((check(r, "ai_tells")!.details!.tells as string[]).join()).toMatch(/Have you ever/);
  });
});

describe("readability, sentences and paragraphs", () => {
  it("computes Flesch reading ease with the standard formula", () => {
    const r = readability("The cat sat on the mat.");
    expect(r).toMatchObject({ words: 6, sentences: 1, syllables: 6 });
    expect(r.flesch).toBeCloseTo(206.835 - 1.015 * 6 - 84.6 * 1, 0);
    expect(syllables("cat")).toBe(1);
    expect(syllables("water")).toBe(2);
    expect(syllables("shipped")).toBe(1);
  });

  it("splits sentences on punctuation and on line breaks, ignoring list markers", () => {
    expect(sentences("One idea. Another idea!\n1. A list item\n- bullet point")).toEqual(["One idea.", "Another idea!", "A list item", "bullet point"]);
  });

  it("skips readability for very short drafts", () => {
    expect(reviewPost("Shipped it.").skipped.map((s) => s.id)).toContain("readability");
  });

  it("flags one long sentence even when the average is fine", () => {
    const long = `We ${"really ".repeat(0)}spent ${"many long and tiring ".repeat(9)}weeks on it.`;
    const r = reviewPost(`Short opener here.\n\n${long}\n\nShort close. Short close. Short close. Short close.`);
    expect(status(r, "sentence_length")).not.toBe("pass");
    expect(check(r, "sentence_length")!.fix).toMatch(/^Split "/);
  });

  it("fails a paragraph with five or more sentences", () => {
    const para = "We tried. It failed. We tried again. It failed again. Then it worked. Finally.";
    expect(status(reviewPost(`Here is the story.\n\n${para}`), "paragraphs")).toBe("fail");
  });

  it("warns about long posts with no blank lines between ideas", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `Line ${i + 1} explains one part of the launch plan in some detail for the whole team.`).join("\n");
    expect(lines.length).toBeGreaterThan(600);
    expect(status(reviewPost(lines), "whitespace")).toBe("warn");
  });
});

describe("specificity and reader focus", () => {
  it("counts numbers, names and dates per 100 words", () => {
    const r = review("bof_offer");
    expect(status(r, "specificity")).toBe("pass");
    expect(check(r, "specificity")!.details!.examples).toEqual(expect.arrayContaining(["14", "Priya"]));
  });

  it("fails vague writing with no specifics", () => {
    const vague = "Leadership is about many things. It is really about people and the stuff they care about. Good leaders do a lot of things well and they basically try to be very helpful to everyone around them every day, which is kind of the whole point of the job if you think about it for a while.";
    expect(status(reviewPost(vague), "specificity")).toBe("fail");
  });

  it("warns when the post is all 'I' and no 'you', with a looser ratio for stories", () => {
    const meHeavy = "I started a company. I hired my team. I made my mistakes. I learned my lessons. I changed my mind. I grew.\n\nThat's my year.";
    expect(status(reviewPost(meHeavy), "reader_focus")).toBe("warn");
    const someYou = `${meHeavy}\n\nYou will make your own mistakes.`;
    expect(status(reviewPost(someYou), "reader_focus")).toBe("warn");
    expect(status(reviewPost(someYou, { method: "story" }), "reader_focus")).toBe("pass");
  });
});

describe("machine-writing tells", () => {
  it("passes one-off em dashes when the user's own samples use them", () => {
    const text = "We shipped on Friday — two weeks early.\n\nThe team chose scope over polish.";
    expect(status(reviewPost(text), "ai_tells")).toBe("warn");
    const r = reviewPost(text, { voice_samples: ["I write like this — always have — and I like it."] });
    expect(status(r, "ai_tells")).toBe("pass");
    expect(check(r, "ai_tells")!.reason).toMatch(/your own samples use them/);
  });

  it("catches the 'it's not X, it's Y' reversal", () => {
    const r = reviewPost("Pricing isn't a spreadsheet problem. It's a positioning problem.\n\nWe learned that the hard way in 2024.");
    expect((check(r, "ai_tells")!.details!.tells as string[]).join()).toMatch(/isn't A\. It's B\./);
  });

  it("catches 'No X. No Y. No Z.' triads", () => {
    const r = reviewPost("No meetings. No slides. No excuses. Just shipping.\n\nThat was our rule for Q3.");
    expect((check(r, "ai_tells")!.details!.tells as string[]).join()).toMatch(/No X\. No Y\. No Z\./);
  });
});

describe("CTA", () => {
  it("detects CTA families", () => {
    expect(detectCtas("Post.\n\nBook a 20-minute call through my profile.")).toContain("sales");
    expect(detectCtas("Post.\n\nComment GUIDE and I'll send the checklist.")).toContain("lead");
    expect(detectCtas("Post.\n\nFollow me for more on pricing.")).toContain("follow");
    expect(detectCtas("Post.\n\nWhat would you add?")).toContain("conversation");
  });

  it("warns when the CTA doesn't fit the funnel stage, and when there is none", () => {
    const sales = "Most onboarding is too long.\n\nWe cut ours to 3 days.\n\nBook a call through my profile.";
    expect(status(reviewPost(sales, { funnel_stage: "TOF" }), "cta")).toBe("warn");
    expect(status(reviewPost(sales, { funnel_stage: "BOF" }), "cta")).toBe("pass");
    expect(status(reviewPost("We cut onboarding to 3 days.\n\nIt was worth it."), "cta")).toBe("warn");
  });
});

describe("profile rules and history", () => {
  it("fails banned words from the profile as a blocker, and warns on avoided topics", () => {
    const text = "Our new synergy framework cut handoffs by 40%.\n\nWhat would you add?";
    const r = reviewPost(text, { banned_words: ["synergy"] });
    expect(status(r, "banned_phrases")).toBe("fail");
    expect(r.blockers).toContain("banned_phrases");
    expect(status(reviewPost(text, { banned_words: ["syn"] }), "banned_phrases")).toBe("pass"); // whole words only
    expect(status(reviewPost(text, { topics_to_avoid: ["framework"] }), "banned_phrases")).toBe("warn");
    expect(reviewPost(text).skipped.map((s) => s.id)).toContain("banned_phrases");
  });

  it("matches banned phrases regardless of case and curly apostrophes", () => {
    expect(status(reviewPost("Let’s circle back on pricing.\n\nThoughts?", { banned_phrases: ["let's circle back"] }), "banned_phrases")).toBe("fail");
  });

  it("flags openings that repeat recent posts", () => {
    const text = "We lost our biggest client last year and it hurt.\n\nWhat would you do?";
    const same = reviewPost(text, { recent_openings: [{ text: "We lost our biggest client in 2023.", source: "your post of 2026-10-02" }] });
    expect(status(same, "repeated_opening")).toBe("fail");
    expect(check(same, "repeated_opening")!.reason).toMatch(/your post of 2026-10-02/);
    const close = reviewPost(text, { recent_openings: [{ text: "We lost our best engineer in May.", source: "calendar slot-2" }] });
    expect(status(close, "repeated_opening")).toBe("warn");
    const different = reviewPost(text, { recent_openings: [{ text: "Pricing pages lose buyers.", source: "x" }] });
    expect(status(different, "repeated_opening")).toBe("pass");
    expect(reviewPost(text).skipped.map((s) => s.id)).toContain("repeated_opening");
  });
});

describe("scoring and thresholds", () => {
  it("lists fixes with failures first", () => {
    const r = review("ai_slop");
    expect(r.top_fixes.length).toBeGreaterThan(0);
    const firstWarn = r.top_fixes.findIndex((f) => f.startsWith("Call to action"));
    const firstFail = r.top_fixes.findIndex((f) => f.startsWith("Machine-writing tells"));
    expect(firstFail).toBeGreaterThanOrEqual(0);
    expect(firstWarn === -1 || firstFail < firstWarn).toBe(true);
  });

  it("documents a basis for every threshold", () => {
    for (const [id, rule] of Object.entries(REVIEW_THRESHOLDS)) {
      expect(rule.weight, id).toBeGreaterThan(0);
      expect(rule.basis.source.length, id).toBeGreaterThan(20);
      expect(["platform", "research", "heuristic"]).toContain(rule.basis.confidence);
    }
    expect(Object.keys(reviewBases())).toEqual(Object.keys(REVIEW_THRESHOLDS));
  });

  it("reports every check it ran with a reason, and a fix for each warning or failure", () => {
    for (const name of Object.keys(drafts)) {
      const r = review(name);
      expect(r.checks.length + r.skipped.length).toBe(Object.keys(REVIEW_THRESHOLDS).length);
      for (const c of r.checks) {
        expect(c.reason.length, `${name}.${c.id}`).toBeGreaterThan(5);
        if (c.status !== "pass") expect(c.fix, `${name}.${c.id}`).toBeTruthy();
      }
    }
  });
});
