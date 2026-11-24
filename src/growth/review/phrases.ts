/**
 * Phrase lists for review_post. Each pattern has a label (what the user sees)
 * and, where useful, a fix. Basis for each group is in thresholds.ts.
 * English only, like LinkedIn's own send checks in this project.
 */

export interface PhrasePattern {
  label: string;
  re: RegExp;
  fix?: string;
}

/** Openers that warm up instead of saying something. Matched against the first line. */
export const THROAT_CLEARING: PhrasePattern[] = [
  { label: "I'm excited/thrilled/happy to…", re: /^(i('| a)?m|we('| a)?re)\s+(so\s+|really\s+|very\s+|super\s+)?(excited|thrilled|happy|pleased|proud|delighted|honou?red|humbled|glad)\s+to\b/i },
  { label: "Hey everyone / Hi LinkedIn", re: /^(hey|hi|hello|good morning)\s+(everyone|all|folks|linkedin|connections|network|friends|fam)\b/i },
  { label: "I wanted to share…", re: /^(i\s+)?(just\s+)?wanted\s+to\s+(share|say|talk|take a (moment|minute))/i },
  { label: "Today I want to talk about…", re: /^(today,?\s+)?i\s+want\s+to\s+(talk|share|discuss|write)/i },
  { label: "In this post…", re: /^in\s+this\s+(post|article|thread)\b/i },
  { label: "So, / Well, / Okay,", re: /^(so|well|okay|ok|alright)[,.…]\s/i },
  { label: "As many of you know…", re: /^as\s+(many|most|some)\s+of\s+you\s+(may\s+|might\s+)?(already\s+)?know/i },
  { label: "Let me tell you…", re: /^(let me|allow me to)\s+(tell|share|introduce)/i },
  { label: "Quick update / Quick thought", re: /^(a\s+)?(quick|little|short|small)\s+(update|post|note|thought|announcement)\b/i },
  { label: "It's been a while…", re: /^it'?s\s+been\s+a\s+(while|minute)\b/i },
  { label: "I've been thinking…", re: /^i('ve| have)\s+been\s+(thinking|meaning|wanting|reflecting)\b/i },
  { label: "Dear network / Greetings", re: /^(dear|greetings)\b/i },
  { label: "In today's world…", re: /^in\s+today'?s\s+(\w+[- ])*(world|age|landscape|era|market|economy)\b/i },
  { label: "In a world where…", re: /^in\s+(a|the)\s+world\s+(where|of|that)\b/i },
];

/** Words and phrases that read as machine-written. */
export const AI_PHRASES: PhrasePattern[] = [
  { label: "delve", re: /\bdelv(e|es|ed|ing)\b/i, fix: "Say 'look at' or 'dig into', or cut it." },
  { label: "tapestry", re: /\btapestry\b/i },
  { label: "testament to", re: /\b(a\s+)?testament\s+to\b/i },
  { label: "in the realm of", re: /\bin\s+the\s+realm\s+of\b/i },
  { label: "ever-evolving / fast-paced world", re: /\b(ever[- ]evolving|ever[- ]changing|fast[- ]paced)\s+(world|landscape|industry|environment)\b/i },
  { label: "in today's … world", re: /\bin\s+today'?s\s+(\w+[- ])?(world|age|landscape|era|market)\b/i },
  { label: "navigate the complexities", re: /\bnavigat(e|ing)\s+the\s+(complexities|intricacies|nuances)\b/i },
  { label: "unlock your potential", re: /\bunlock(ing)?\s+(your|the|their|its)\s+(full\s+|true\s+)?potential\b/i },
  { label: "harness the power", re: /\bharness(ing)?\s+the\s+power\b/i },
  { label: "game-changer", re: /\bgame[- ]?changer\b/i },
  { label: "elevate your …", re: /\belevate\s+(your|our|the)\b/i },
  { label: "seamless(ly)", re: /\bseamless(ly)?\b/i },
  { label: "embark on a journey", re: /\bembark(ed|ing)?\s+on\s+(a|this|my|our)\s+(\w+\s+)?journey\b/i },
  { label: "it's important to note", re: /\bit('s| is)\s+(important|worth|crucial)\s+(to\s+note|noting)\b/i },
  { label: "plays a pivotal/crucial role", re: /\bplays?\s+an?\s+(pivotal|crucial|vital|key)\s+role\b/i },
  { label: "pivotal", re: /\bpivotal\b/i },
  { label: "foster", re: /\bfoster(s|ed|ing)?\b/i },
  { label: "underscore", re: /\bunderscor(e|es|ed|ing)\b/i },
  { label: "here's the thing", re: /\bhere'?s\s+the\s+thing\b/i },
  { label: "let that sink in", re: /\blet\s+that\s+sink\s+in\b/i },
  { label: "read that again", re: /\bread\s+that\s+again\b/i },
  { label: "the best part?", re: /\bthe\s+best\s+part\s*\?/i },
  { label: "and honestly?", re: /\band\s+honestly\s*\?/i },
  { label: "buckle up", re: /\bbuckle\s+up\b/i },
  { label: "let's dive in", re: /\blet'?s\s+dive\s+(in|deep|into)\b/i },
  { label: "a masterclass in", re: /\ba\s+masterclass\s+in\b/i },
];

/** "It's not X, it's Y" and its cousins. */
export const REVERSALS: PhrasePattern[] = [
  { label: "It's not X. It's Y.", re: /\b(it'?s|this\s+is|that'?s|it\s+was|this\s+was)\s+not\s+(just\s+|only\s+)?(about\s+)?[^.!?\n]{1,60}?[,;.:—–-]+\s*(it'?s|this\s+is|that'?s|it\s+was|it\s+is)\s+\w/i },
  { label: "X isn't A. It's B.", re: /\b(isn'?t|wasn'?t|aren'?t|is\s+not)\s+(just\s+|only\s+|really\s+)?(about\s+)?[^.!?\n]{1,60}?[.;:—–-]+\s*(it'?s|it\s+is|they'?re|it\s+was)\s+(about\s+)?\w/i },
  { label: "Not because X, but because Y", re: /\bnot\s+because\s+[^.!?\n]{1,60}?[.,;—–-]+\s*(but\s+)?because\b/i },
  { label: "Not just X, but Y", re: /\bnot\s+just\s+[^.!?\n]{1,40}?,?\s+but\s+(also\s+)?\w/i },
];

/** Cliché rhetorical-question openers. Matched against the first line. */
export const RHETORICAL_OPENERS: PhrasePattern[] = [
  { label: "Have you ever…?", re: /^have\s+you\s+ever\b/i },
  { label: "Ever wondered…?", re: /^ever\s+(wonder(ed)?|felt|noticed|thought|asked)\b/i },
  { label: "Did you know…?", re: /^did\s+you\s+know\b/i },
  { label: "What if I told you…?", re: /^what\s+if\s+i\s+told\s+you\b/i },
  { label: "Are you struggling/tired…?", re: /^are\s+you\s+(still\s+)?(struggling|tired|wondering|ready|looking)\b/i },
  { label: "Want to know…?", re: /^(want|wanna)\s+to?\s*(know|learn|find out)\b/i },
  { label: "Ready to…?", re: /^ready\s+to\b/i },
];

/** Demoted by LinkedIn: explicit asks for likes, reactions, "comment to agree", tagging. */
export const BAIT_STRONG: PhrasePattern[] = [
  { label: "like if you agree", re: /\b(like|react(\s+to)?|👍)\s+(this\s+)?(post\s+)?if\s+you\s+(agree|relate|feel)/i },
  { label: "hit/smash like", re: /\b(hit|smash|tap)\s+(that|the)\s+(like|❤️|👍)/i },
  { label: "like and share", re: /\blike\s*(,|and|&)\s*(share|comment|repost)\b/i },
  { label: "comment YES / type 'me'", re: /\b(comment|type|write|reply)\s+["'“‘]?(yes|agree|me|yep|1|👇|🙋|🔥|🙌)["'”’]?(?=[\s.!,]|$)/i },
  { label: "comment to agree", re: /\bcomment\s+(below\s+)?(to|if\s+you)\s+agree\b/i },
  { label: "drop a 🔥 below", re: /\bdrop\s+(a|an)\s+["'“]?\S{1,12}["'”]?\s+(below|in\s+the\s+comments|if)\b/i },
  { label: "tag 3 friends", re: /\btag\s+(\d+|one|two|three|a|some|your)\s+(friends?|people|colleagues?|connections?|persons?)\b/i },
  { label: "tag someone who…", re: /\btag\s+(someone|anyone|a\s+friend)\s+(who|that)\b/i },
  { label: "share if you agree", re: /\b(share|repost)\s+(this\s+)?if\s+you\s+(agree|relate)\b/i },
];

/** Softer asks: not named by LinkedIn, but in the same family. */
export const BAIT_SOFT: PhrasePattern[] = [
  { label: "♻️ Repost to help others", re: /(♻️|♻)\s*repost|\brepost\s+(this\s+)?(to|so)\s+(help|share|your|others)\b/i },
  { label: "comment KEYWORD and I'll send it", re: /\b[Cc]omment\s+["'“‘]?(?!(?:YES|AGREE|ME|YEP)\b)[A-Z]{2,}["'”’]?\s+(and|to|for|below)\b/ },
];

/** CTA families, checked against the end of the post. */
export const CTA_PATTERNS: { type: CtaType; re: RegExp }[] = [
  { type: "sales", re: /\b(book|schedule|grab|hop\s+on)\s+(a|an|your)\s+(\d+[- ]?min(ute)?s?\s+)?(call|demo|chat|meeting|consult(ation)?)\b|\b(hire|work\s+with)\s+(me|us)\b|\bwe('re|\s+are)\s+hiring\b|\bapply\s+(now|here|today)\b|\b(buy|order|get\s+started)\s+(now|here|today)\b|\b(see|check)\s+(our|the|my)\s+pricing\b|\bfree\s+trial\b/i },
  // Case-sensitive: an upper-case keyword ("Comment GUIDE"), but not "comment YES" bait.
  { type: "lead", re: /\b[Cc]omment\s+["'“‘]?(?!(?:YES|AGREE|ME|YEP)\b)[A-Z]{2,}\b/ },
  { type: "lead", re: /\b(download|grab|get)\s+(the|my|our|your|a)\s+(free\s+)?(guide|template|checklist|playbook|pdf|e-?book|cheat\s?sheet|toolkit|swipe\s+file)\b|\bsubscribe\b|\bnewsletter\b|\bjoin\s+(my|the|our)\b|\bdm\s+me\b|\bsend\s+me\s+a\s+(message|dm)\b|\blink\s+in\s+(the\s+)?(first\s+)?comments?\b|\bsign\s+up\b|\bregister\b|\bwaitlist\b/i },
  { type: "follow", re: /\bfollow\s+(me|along|for\s+more)\b|\bhit\s+the\s+🔔|\bfollow\s+@?\w+\s+for\b/i },
  { type: "save_share", re: /\bsave\s+(this|it)\b|\b(share|send)\s+(this|it)\s+(with|to)\b|\brepost\b/i },
  { type: "conversation", re: /\b(what('s|\s+is|\s+was)\s+your|how\s+do\s+you|what\s+do\s+you\s+think|tell\s+me|let\s+me\s+know|i'?d\s+love\s+to\s+hear|curious\s+(to\s+hear|what|how)|agree\s+or\s+disagree|which\s+one)\b/i },
];

export type CtaType = "sales" | "lead" | "follow" | "save_share" | "conversation";

/** CTA types that fit each funnel stage. */
export const CTA_FIT: Record<"TOF" | "MOF" | "BOF", CtaType[]> = {
  TOF: ["conversation", "follow", "save_share"],
  MOF: ["lead", "conversation", "follow", "save_share"],
  BOF: ["sales", "lead", "conversation"],
};

/** Signals of a strong first line. */
export const TENSION_WORDS = /\b(but|stop|never|don'?t|wrong|mistakes?|myths?|lies?|nobody|no\s+one|most\s+people|instead|truth|hard|hardest|failed|failure|lost|quit|fired|unpopular|hate|secret|why|worst|cost|regret|rejected|broke)\b/i;

/** Filler that makes writing vague. */
export const VAGUE_WORDS = /\b(things?|stuff|a\s+lot|lots\s+of|various|very|really|basically|literally|super|kind\s+of|sort\s+of)\b/gi;

export const YOU_WORDS = /\b(you|your|you'?re|yours|yourself|you'?ve|you'?ll|you'?d)\b/gi;
export const I_WORDS = /\b(i|me|my|mine|myself|i'm|i've|i'll|i'd)\b/gi;
