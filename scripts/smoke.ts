/**
 * Manual smoke test against a real, signed-in LinkedIn account.
 * Runs read-only tools only. Never run this in CI.
 *
 *   npm run smoke            # core read tools (about 10 page loads)
 *   npm run smoke -- --all   # also searches, a company page and its posts, your own posts as others see them, and jobs
 */
import { loadConfig } from "../src/config.js";
import { createContext } from "../src/context.js";
import { ALL_TOOLS } from "../src/server.js";
import { invoke } from "../src/tools/registry.js";

const all = process.argv.includes("--all");

const plan: [string, Record<string, unknown>][] = [
  ["session_status", { verify: true }],
  ["get_limits", {}],
  ["get_my_profile", { sections: ["about", "experience"] }],
  ["get_feed", { limit: 3 }],
  ["get_my_posts", { limit: 3 }],
  ["get_notifications", { limit: 5 }],
  ["get_inbox", { limit: 3 }],
  ["list_invitations", { direction: "received", limit: 3 }],
  ["get_profile_analytics", {}],
  ["list_scheduled_posts", {}],
];
if (all) {
  plan.push(["search_posts", { keywords: "model context protocol", date_posted: "past-week", limit: 3 }]);
  plan.push(["search_people", { keywords: "product manager", limit: 3 }]);
  plan.push(["get_company_profile", { company: "linkedin" }]);
  plan.push(["get_company_posts", { company: "linkedin", limit: 3 }]);
  plan.push(["search_jobs", { keywords: "product designer", workplace: ["remote"], date_posted: "past-week", limit: 3 }]);
  plan.push(["get_saved_jobs", { limit: 3 }]);
}

const ctx = createContext(loadConfig());
const me = (await ctx.account.get()).public_id;
if (all && me) plan.push(["get_person_posts", { profile: me, limit: 3 }]);
let failures = 0;
try {
  for (const [name, args] of plan) {
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    const started = Date.now();
    const result = await invoke(tool, args, ctx);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n${result.isError ? "✗" : "✓"} ${name} (${seconds}s)`);
    console.log(text.length > 1500 ? `${text.slice(0, 1500)}\n…` : text);
    if (result.isError) {
      failures++;
      if (/CHECKPOINT|CIRCUIT_OPEN|NOT_LOGGED_IN/.test(text)) {
        console.log("\nStopping: fix the issue above first.");
        break;
      }
    }
  }
} finally {
  await ctx.session.close();
}
console.log(failures ? `\n${failures} tool(s) failed.` : "\nAll smoke checks passed.");
process.exitCode = failures ? 1 : 0;
