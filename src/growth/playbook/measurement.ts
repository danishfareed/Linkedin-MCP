import type { PlaybookTopic } from "./types.js";

export const measurement: PlaybookTopic = {
  id: "measurement",
  title: "Measurement and experiments",
  summary:
    "LinkedIn's own metric definitions (impressions, members reached, saves, sends, profile views, followers gained), derived rates, which metrics fit which goal, benchmark ranges with sources and years, how to read small samples, and how to run one-variable experiments.",
  keywords: ["metrics", "analytics", "impressions", "members reached", "engagement rate", "comment rate", "saves", "sends", "profile views", "follower growth", "benchmark", "baseline", "experiment", "a/b test", "statistics", "report", "review"],
  body: `## Metric definitions

LinkedIn's Help Center defines the post analytics members see ([LinkedIn Help: post analytics](https://www.linkedin.com/help/linkedin/answer/a516971)):

| Metric | LinkedIn's definition | What it tells you |
|---|---|---|
| Impressions | "Number of times your post was shown on LinkedIn." | Raw distribution, including repeat views |
| Members reached | "Number of distinct members and Pages that saw your post. This number is an estimate and does not include repeat views." | How many people you reached; the better denominator for rates |
| Reactions | "The number of times members or Pages reacted (i.e. liked) your post." | Light approval |
| Comments | "The number of times members and Pages commented on your post." | Conversation; the strongest public signal |
| Reposts | "The number of times members and Pages shared your post to their feed." | Endorsement and second-hand reach |
| Saves | "The number of times members saved your post." | Lasting, reference value (LinkedIn calls it "a signal that your content provided lasting value") |
| Sends on LinkedIn | "The number of times members sent your post to others on LinkedIn." | Private word of mouth: the post helped someone help a colleague |
| Profile viewers from this post | "The total number of distinct members and Page admins who viewed your profile from your post." | Curiosity about you |
| Followers gained from this post | "The total number of members who followed you from your post." | Audience growth caused by the post |

Further details from LinkedIn ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a516971); [combined analytics](https://www.linkedin.com/help/linkedin/answer/a701208)):

- The numbers "are estimates and may not be precise".
- Your own views, engagements, saves and sends count toward your analytics.
- Combined post analytics report **engagements** as reactions, comments, saves, sends and reposts together.
- A video view counts when the video is "watched for two or more continuous seconds, including replays".
- **Retention:** discovery and engagement counts are kept for 1,000 days, members reached for 400 days, and demographic breakdowns for 180 days. Record your numbers regularly (growth_report does this) if you want a long history.

**Engagement rate** is defined by LinkedIn only for company Pages, as interactions (clicks, reactions, comments, shares) divided by impressions ([LinkedIn Help](https://www.linkedin.com/help/lms/answer/a564051)). Third-party tools each use their own formula, which is why their benchmarks disagree.

## Derived rates to track

Compute these per post, from get_post_analytics:

| Rate | Formula | Use |
|---|---|---|
| Engagement rate | (reactions + comments + reposts + saves + sends) ÷ impressions | Overall response; compare only with your own history or a benchmark using the same formula |
| Comment rate | comments ÷ impressions × 1,000 | Conversation per thousand views |
| Save rate | saves ÷ members reached × 1,000 | Reference value; key for MOF content |
| Send rate | sends ÷ members reached × 1,000 | Shareability |
| Profile-view rate | profile viewers from the post ÷ members reached | Curiosity about you |
| Follow conversion | followers gained ÷ profile viewers from the post | How well your profile converts interest |
| Reach rate | impressions ÷ follower count | Distribution relative to audience size |

Weekly, from get_profile_analytics: net follower growth, total post impressions, profile viewers and search appearances.

## Match metrics to the goal

| Goal | Primary metrics | Secondary |
|---|---|---|
| Audience growth | Followers gained per post; net weekly follower growth from your ICP | Reach rate, sends |
| Leads and pipeline | Conversations started (DMs, calls) traced to posts; profile views from ICP | Save rate on MOF posts, comments from buyers |
| Hiring | Applications and referrals mentioning your posts | Profile views, sends |
| Job search | Recruiter and hiring-manager messages; interview requests | Profile views from your target companies (post demographics) |
| Thought leadership | Comments from peers and leaders; invitations (podcasts, talks, quotes) | Reposts with commentary, saves |

Impressions are an input, not a goal. A post with 3,000 impressions that starts two buyer conversations beat a post with 30,000 that started none.

## Benchmarks (use as sanity checks only)

Benchmarks vary by definition, sample, year and account type. Your own baseline is the benchmark that matters.

- **Personal profiles, engagement rate:** AuthoredUp found a median of 2.50% across 372,812 posts (September 2025 – February 2026), defined as likes, comments, shares and clicks over impressions. By follower count: 0–1K 2.56%, 1–5K 2.68%, 5–20K 2.53%, 20–50K 2.38%, 50–100K 1.78%, 100K+ 1.53% ([AuthoredUp, 2026](https://authoredup.com/blog/linkedin-metrics-to-track)). Rates usually fall as audiences grow.
- **Reach rate by format:** the Shield Index (about 50,000 posts a month) reported typical (median) impressions as a share of followers in March 2026: image 14%, text 12%, carousel 11%, poll 11%, article or link 8%, video 7%, repost 6% ([Shield Index, 2026](https://theshieldindex.beehiiv.com/p/march-2026-linkedin-reach-by-content-format)). The Shield Index has since stopped publishing.
- **Company pages:** Socialinsider's 2026 report (1.3M posts from 16,645 business pages, 2025 data) found an average engagement rate of 5.20% by impressions, highest for native documents (7.00%) and lowest for link posts (3.25%) ([Socialinsider, 2026](https://cdn.socialinsider.io/documents/linkedin_benchmarks_2026.pdf)).
- **People versus pages:** Metricool's 2026 study (673,658 posts) found personal profiles had a 63% higher average engagement rate than company pages ([Metricool, 2026](https://metricool.com/press-release-linkedin-study-2026/)).
- **Trend:** reach per post fell sharply in 2024–2025 across datasets (see the algorithm topic), so compare like with like in time.

## Reading small samples

Most people have a few posts a week, so their data is small and noisy. Read it carefully:

1. **Use medians, not averages.** Post performance is skewed: one post that takes off can double an average. The median of your last 10–20 posts is a steadier baseline.
2. **Compare each post to your baseline as a ratio.** 1.0 means typical; 2.0 means twice your typical result. This removes most of the effect of audience size and the general reach trend.
3. **One post proves nothing.** Two similar posts can differ several-fold for reasons you can't see (the day's news, who happened to comment early, competition in the feed).
4. **Count wins, not totals (the sign test).** If a change had no real effect, each new post would beat your baseline median about half the time. The chance of 8 or more wins out of 10 by luck alone is about 5.5%, so 8 of 10 is reasonably convincing. Six of 10 (about a 38% chance by luck) or 7 of 10 (about 17%) is consistent with noise. Five wins out of five happens by luck about 3% of the time.
5. **Beware rates on tiny counts.** Two comments versus four is not a doubling worth acting on.
6. **Read posts at the same age.** Compare every post at, say, seven days old. Older posts keep collecting impressions, and LinkedIn sometimes shows older posts that are still relevant.
7. **Look at who, not just how many.** Post analytics show top viewer demographics. A small post seen mostly by your ICP can beat a big one seen by nobody relevant.
8. **Keep notes on confounders:** holidays, news events, a large account resharing, a change in your posting time, changes LinkedIn announced.

## Experiment design: change one variable

1. **Write a hypothesis with a metric:** "Frameworks posted as documents will get more saves per 1,000 members reached than the same kind of frameworks posted as text."
2. **Change one variable only:** format, hook type, length band, posting time, link placement, CTA rung, or pillar. Hold the others steady.
3. **Choose one primary metric in advance,** so you can't pick whichever number looks best afterwards.
4. **Alternate variants** (A, B, A, B…) over the same weeks rather than running all A this month and all B next month, which mixes the change with the calendar.
5. **Run five to ten posts per variant** where you can. Fewer can show a large effect but can't rule out luck.
6. **Read results at a fixed age** (for example seven days) and use the sign test above.
7. **Decide and record:** keep, drop or retest. Log it with growth_report or in the strategy (growth_strategy), so the learning outlives your memory.
8. **One experiment at a time.** Two overlapping experiments can't be untangled.

**Experiments worth running:**

- Link in the post versus in the first comment versus no link.
- Story hook versus contrarian hook on the same pillar.
- Document versus text for frameworks.
- Medium versus long length for case studies.
- Morning versus afternoon posting on weekdays.
- No CTA versus a rung-2 question on TOF posts.
- Being available to reply in the first hour versus replying later in the day.

## Monthly growth review

Once a month (the monthly_growth_review prompt walks through this):

1. Pull recent posts (get_my_posts), analytics for the most and least successful (get_post_analytics) and the profile dashboard (get_profile_analytics).
2. Compute each post's ratio to your baseline for the goal's primary metric.
3. Group by pillar, format, funnel stage and hook type. Which groups beat baseline more than half the time?
4. Check the funnel mix against the strategy's target ratios.
5. Note qualitative wins: buyer DMs, invitations, recruiter messages, great comments.
6. Pick one experiment for next month and one thing to stop.
7. Save the snapshot and insights with growth_report, and propose strategy changes for approval (growth_strategy).
`,
};
