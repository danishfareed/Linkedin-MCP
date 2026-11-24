import type { GrowthProfile, StrategyDraft } from "./schemas.js";
import { type StrategyFile, type StrategyVersion, approvedVersion, latestDraft } from "./strategy.js";

const DAY_NAMES: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** Escapes characters that would break a markdown table cell. */
function cell(s: string | number | undefined | null): string {
  if (s === undefined || s === null || s === "") return "-";
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function bullets(items: string[] | undefined): string {
  return items?.length ? items.map((i) => `- ${i.replace(/\r?\n/g, " ")}`).join("\n") : "- (none yet)";
}

function proofLabel(ref: string, profile?: GrowthProfile): string {
  const proof = profile?.proof_bank?.find((p) => p.id === ref);
  return proof ? `${ref} (${proof.title})` : ref;
}

function renderBody(s: StrategyDraft, profile?: GrowthProfile): string {
  const out: string[] = [];
  out.push("### Positioning", "", s.positioning ?? "(not set)", "");

  out.push("### Content pillars", "");
  if (s.pillars?.length) {
    out.push("| Pillar | Funnel | Share | Example angles | Proof |", "|---|---|---|---|---|");
    for (const p of s.pillars) {
      out.push(`| ${cell(p.name)} | ${p.funnel_stage} | ${p.share_pct}% | ${cell(p.example_angles.join("; "))} | ${cell(p.proof_refs.map((r) => proofLabel(r, profile)).join("; "))} |`);
    }
  } else out.push("(not set)");
  out.push("");

  const fm = s.funnel_mix;
  out.push("### Funnel mix", "");
  out.push(fm ? `TOF ${fm.tof_pct ?? "?"}% · MOF ${fm.mof_pct ?? "?"}% · BOF ${fm.bof_pct ?? "?"}%` : "(not set)");
  if (fm?.reasons) out.push("", fm.reasons);
  out.push("");

  const c = s.cadence;
  out.push("### Cadence", "");
  if (c) {
    out.push(`- Posts per week: ${c.posts_per_week ?? "?"}`);
    out.push(`- Days: ${c.days?.length ? c.days.map((d) => DAY_NAMES[d]).join(", ") : "?"}`);
    out.push(`- Time windows: ${c.time_windows?.length ? c.time_windows.map((w) => `${w.start}–${w.end}`).join(", ") : "?"} (local time)`);
    if (c.source) out.push(`- Based on: ${c.source}`);
    if (c.notes) out.push(`- Notes: ${c.notes}`);
  } else out.push("(not set)");
  out.push("");

  out.push("### Format mix", "");
  out.push(s.format_mix?.length ? s.format_mix.map((f) => `- ${f.format}: ${f.share_pct}%`).join("\n") : "(not set)", "");

  const e = s.engagement_plan;
  out.push("### Engagement plan", "");
  if (e) {
    out.push(`- Daily minutes: ${e.daily_minutes ?? "?"}`);
    if (e.target_accounts?.length) out.push(`- Target accounts: ${e.target_accounts.join(", ")}`);
    if (e.target_topics?.length) out.push(`- Target topics: ${e.target_topics.join(", ")}`);
    if (e.tactics?.length) out.push("- Tactics:", ...e.tactics.map((t) => `  - ${t}`));
    if (e.notes) out.push(`- Notes: ${e.notes}`);
  } else out.push("(not set)");
  out.push("");

  out.push("### CTA ladder", "");
  out.push(s.cta_ladder?.length ? s.cta_ladder.map((l) => `- ${l.funnel_stage}: ${l.cta}${l.example ? ` (e.g. "${l.example}")` : ""}`).join("\n") : "(not set)", "");

  out.push("### KPIs", "");
  if (s.kpis?.length) {
    out.push("| KPI | Metric | Baseline | Target | By |", "|---|---|---|---|---|");
    for (const k of s.kpis) out.push(`| ${cell(k.name)} | ${k.metric} | ${cell(k.baseline)} | ${k.target} | ${k.by} |`);
  } else out.push("(not set)");
  out.push("");

  out.push("### Review date", "", s.review_date ?? "(not set)", "");
  if (s.notes) out.push("### Notes", "", s.notes, "");
  return out.join("\n");
}

function versionLine(v: StrategyVersion): string {
  return `| v${v.version} | ${v.status} | ${v.created_at.slice(0, 10)} | ${v.approved_at?.slice(0, 10) ?? "-"} | ${cell(v.change_note)} |`;
}

/** A readable export of the strategy for the user. Never read back. */
export function renderStrategyMarkdown(f: StrategyFile, profile: GrowthProfile | undefined, now: Date): string {
  const approved = approvedVersion(f);
  const draft = latestDraft(f);
  const out: string[] = [
    "# LinkedIn growth strategy",
    "",
    `_Exported by linkedin-mcp on ${now.toISOString().slice(0, 10)} from strategy.json. Edits to this file are not read back; ask your assistant to change the strategy instead._`,
    "",
  ];
  if (profile?.audience?.who || profile?.offer?.description) {
    out.push("## Who it's for", "");
    if (profile.audience?.who) out.push(`- Audience: ${profile.audience.who}`);
    if (profile.offer?.description) out.push(`- Offer: ${profile.offer.description}`);
    if (profile.audience?.pains?.length) out.push("- Pains:", ...profile.audience.pains.map((p) => `  - ${p}`));
    out.push("");
  }
  if (approved) {
    out.push(`## Approved strategy (v${approved.version}, approved ${approved.approved_at?.slice(0, 10) ?? "?"})`, "", renderBody(approved.strategy, profile));
  } else {
    out.push("## Approved strategy", "", "None yet.", "");
  }
  if (draft) {
    out.push(`## Draft v${draft.version} (not approved)`, "", renderBody(draft.strategy, profile));
  }
  if (f.versions.length) {
    out.push("## Version history", "", "| Version | Status | Created | Approved | Note |", "|---|---|---|---|---|", ...[...f.versions].reverse().map(versionLine), "");
  }
  out.push("## Goals", "", bullets(profile?.goals?.map((g) => `${g.description}${g.target !== undefined ? ` (target ${g.target}${g.due ? ` by ${g.due}` : ""})` : ""}`)), "");
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
