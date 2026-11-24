import type { PlaybookTopic } from "./types.js";

export const algorithm: PlaybookTopic = {
  id: "algorithm",
  title: "How LinkedIn distributes posts",
  summary:
    "What LinkedIn has officially said about feed ranking, what large data studies found, and what practitioners believe, each labelled by evidence level: dwell time, comments, saves and sends, links, hashtags, frequency, editing, tagging, formats and the first hours.",
  keywords: ["algorithm", "feed", "ranking", "reach", "distribution", "golden hour", "dwell time", "link penalty", "hashtags", "360brew", "impressions"],
  body: `## How to read this topic

Most "LinkedIn algorithm" advice mixes three very different kinds of evidence. Every claim below carries a label:

- **[Official]**: LinkedIn said it, in its engineering blog, a research paper by LinkedIn authors, a Help Center page, its newsroom, or a named LinkedIn employee speaking on the record.
- **[Data]**: a third-party study of many posts. These come from users of paid analytics tools (self-selected), they are correlational, and they define "engagement rate" differently, so their numbers can't be compared directly with each other.
- **[Practitioner]**: widely repeated creator advice with no published dataset behind it. Treat it as a hypothesis to test on your own account.

Two cautions apply throughout. First, the feed is a set of machine-learned models that LinkedIn retrains and replaces; anything true in 2021 may not be true now. Second, a correlation in a study ("document posts get more reach") does not tell you that switching *your* post to a document will raise *your* reach. Use the studies to choose experiments, then let your own numbers decide (see the measurement topic).

## What the system optimises for

**[Official]** LinkedIn's feed ranks each candidate post for each viewer by predicting how likely that viewer is to take a range of actions, then combining those predictions into one score.

- In 2019 LinkedIn's engineers described optimising for "contribution": the probability that a member will "share, comment, or react", plus a term for "timely feedback to content creators", because "content creators do care about receiving prompt responses" ([LinkedIn Engineering, 2019](https://www.linkedin.com/blog/engineering/feed/community-focused-feed-optimization)).
- In 2020 they added dwell time. Clicks and "viral actions" (reactions, comments, re-shares) are rare for passive readers and "clicks are noisy indicators of engagement", so they added a P(skip) objective that lowers a post's score in proportion to the predicted chance that the viewer scrolls past it quickly. The stated principle: "time well spent is better than more time spent" ([LinkedIn Engineering, 2020](https://www.linkedin.com/blog/engineering/feed/understanding-feed-dwell-time)).
- A 2021 post describes one multi-task model predicting passive objectives (clicks, dwell time) and active ones (comments, reshares) and combining them in a utility function ([LinkedIn Engineering, 2021](https://www.linkedin.com/blog/engineering/feed/homepage-feed-multi-task-learning-using-tensorflow)).
- The LiRank paper (KDD 2024) says the feed model estimates the probabilities of "like, comment, share, vote, and long dwell and click", "linearly combined to generate the final post score". Inputs include embeddings for authors the viewer often engages with, the post's creator, and the viewer's history of interactions ([Borisyuk et al., 2024](https://arxiv.org/abs/2402.06859)).
- In 2025–2026 LinkedIn replaced several separate candidate sources with one LLM-based retrieval system and moved ranking to a transformer "Generative Recommender" that reads more than a thousand of a member's past interactions and models "passive tasks (click, skip, long-dwell) and active tasks (like, comment, share)". The post names as signals the profile information members choose to share (industry, experience, skills, geography), engagement-based popularity ("item popularity is such a strong relevance signal"), and "professional signals and engagement patterns, never demographic attributes" ([LinkedIn Engineering, March 2026](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed); see also [Ramanujam et al., 2025](https://arxiv.org/abs/2510.14223) and [Hertel et al., 2026](https://arxiv.org/abs/2602.12354)).

**[Official]** LinkedIn's Help Center lists what it considers when ranking: "What the post is about and whether it provides knowledge or advice", "How recent the content is", "Whether the content comes from someone you follow or are connected to", "How constructive or professional the conversation is", tagged people, companies or topics, the content you spend most time viewing, and "Engagement others have with your posts and how recent it is" ([LinkedIn Help: LinkedIn relevance](https://www.linkedin.com/help/linkedin/answer/a1339724)).

**[Uncertain] 360Brew.** Many blogs say "360Brew" is the LinkedIn algorithm. The 360Brew paper describes a 150-billion-parameter research model for ranking across 30+ tasks, but every arXiv version is now marked withdrawn, and LinkedIn's 2026 engineering post on the production feed does not mention it ([arXiv 2501.16450](https://arxiv.org/abs/2501.16450)). Don't build strategy on claims about 360Brew specifically. The broader direction (models that read text and member history rather than hand-built features) is confirmed by the 2025–2026 papers above.

**What this means in practice (inference from the official material):**

1. Your post competes for a *predicted* reaction from *each* viewer. A post that a specific audience lingers on and talks about beats a post that is mildly liked by everyone.
2. Text understanding now matters directly. The models read the post, so being clearly *about* something your audience cares about helps the post find them, including people who don't follow you.
3. Who you are is an input. Profile information and your professional identity are signals, so a profile and a posting history that say the same thing as your post make it easier for the system to place you (see the profile topic).

## Reach beyond your network

**[Official]** Posts can reach people who don't follow you. Tim Jurka, a LinkedIn engineering VP, wrote in 2025 that posts may reach "members who are interested in the type of content you post, even if they don't follow you", that ranking "factors in the author's professional identity, such as experience", and that it doesn't use "age, race, or gender" ([Jurka, 2025](https://www.linkedin.com/pulse/how-does-linkedin-feed-work-tim-jurka-oxraf/)). The Help Center says recommended posts from outside your network must be "valuable and relevant to those outside of the original poster's network" ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1499047)), and LinkedIn's guidance says content that may be shown beyond your network is held to a higher quality bar ([LinkedIn: What to avoid](https://www.linkedin.com/blog/content-recommendations-avoid)).

**[Official, 2023]** In a 2023 interview LinkedIn's director of product management Alice Xiong said members find content most valuable "when content is grounded in knowledge and advice" and when it comes "from people they know and care about" ([Entrepreneur, 2023](https://www.entrepreneur.com/science-technology/linkedin-changed-its-algorithms-heres-how-your-posts/454728)).

**[Data]** Richard van der Blom estimated in his 2024 report that a post's first distribution reaches "about 1.8% of followers", down from 2.4% in 2022, and said in a 2026 interview that about "9% of our feed nowadays is suggested posts" ([Algorithm Insights 2024 announcement](https://www.linkedin.com/pulse/algorithm-insights-2024-grab-your-copy-richard-van-der-blom-swf2e); [Creator Science interview, 2026](https://pod.wave.co/podcast/creator-science-dc8ffac2-9d4b-4034-a53c-bc78b533d35a/307-richard-van-der-blom-the-state-of-linkedin-in-2026-based-on-data-from-13-million-posts)). These are his estimates from tool data, not LinkedIn figures.

## Organic reach has fallen

**[Data]** Several datasets agree that typical reach per post fell sharply in 2024–2025:

- AuthoredUp (3 million posts, 30,000+ profiles) found the typical post reached 1,211 people in June 2024 and 636 by May 2025, a fall of more than 47%; video fell most (−72%) and text least (−34%) ([AuthoredUp, 2025](https://authoredup.com/newsletter/linkedin-vanishing-audience)).
- Van der Blom said in 2026: "On average we've lost 60% over the last two years", with engagement "down 20, 25%" ([interview, 2026](https://pod.wave.co/podcast/creator-science-dc8ffac2-9d4b-4034-a53c-bc78b533d35a/307-richard-van-der-blom-the-state-of-linkedin-in-2026-based-on-data-from-13-million-posts)).

**[Official]** At the same time LinkedIn reported platform-wide growth in activity, such as comments up 32% year over year in early 2025 ([LinkedIn, 2025](https://news.linkedin.com/2025/Q3FY25_Earnings_Highlights)). Both can be true: more people posting and commenting means more competition for each viewer's attention.

**Implication:** judge your posts against your own recent baseline, not against what posts got in 2022 or against someone else's account.

## Dwell time

- **[Official]** Dwell time is an explicit ranking input: P(skip) since 2020, "long dwell" in LiRank (2024), and skip and long-dwell tasks in the 2026 ranker (sources above).
- **[Data]** Van der Blom's 2021 report counted a click on "see more" as a dwell signal ([2021 report](https://www.slideshare.net/slideshow/linked-in-algorithm-report-3rd-edition-2021-v1/250359114)). His 2024 report rated "Click see more" at 5 times a like in an impact table labelled as estimates.
- **[Practitioner]** Write so that people expand the post and read to the end: a hook that earns the "see more" click, short paragraphs, a payoff that rewards finishing, and documents or images worth studying.

Don't pad posts to manufacture dwell time. Readers who feel their time was wasted skip the next post sooner, and LinkedIn's models learn from that too.

## Comments, reactions and conversation

- **[Official]** Comments and reshares are "contribution" actions that the feed values; the 2019 engineering post weighs prompt responses to creators, and Help lists "how constructive or professional the conversation is" as a signal. Rishi Jobanputra, who leads feed product, said in 2025: "Likes signify good direction, but authentic conversations and connection signify great engagement" ([PR Daily, 2025](https://www.prdaily.com/what-works-and-doesnt-on-linkedin-according-to-guardians-of-the-feed/)). LinkedIn's 2019 guidance was to "respond to commenters and encourage back and forth" ([LinkedIn, 2019](https://news.linkedin.com/2019/January/what-s-in-your-linkedin-feed--people-you-know--talking-about-thi)).
- **[Official, 2026]** Automated comments "aren't allowed on LinkedIn", detected ones may be left out of "Most Relevant" comments, and engagement pods can lead to restrictions and removal from programs like Top Voices ([LinkedIn, March 2026](https://news.linkedin.com/2026/authentic-content-and-conversations)).
- **[Data]** Van der Blom's 2024 impact table (labelled estimates, like = 1) rated a comment 15, an instant repost 10 and a save 8, with comments over 15 words counting double. His 2021 report had a comment at 4 times a like. The exact multipliers are not LinkedIn figures and vary by edition; the direction (a real comment is worth far more than a like) is consistent with what LinkedIn says.
- **[Practitioner]** Reply to good comments with substance, ask questions you genuinely want answered, and write posts that leave room for people to add their own experience.

## Saves and sends

- **[Official]** Since September 2025, post analytics show saves and sends. LinkedIn describes saves as "a signal that your content provided lasting value" and sends as the number of times members sent your post to others on LinkedIn ([LinkedIn Guide to Creating, 2025](https://www.linkedin.com/posts/linkedin-guide-to-creating_two-new-analytics-are-now-available-to-activity-7374079732486774784-QVIQ); [Social Media Today, 2025](https://www.socialmediatoday.com/news/linkedin-adds-save-and-send-data-to-content-insights/759828/)).
- **[Uncertain]** LinkedIn hasn't said how much saves or sends weigh in ranking. The 2026 ranker lists like, comment and share as its active tasks.
- **[Practitioner]** Reference material (checklists, frameworks, templates, teardowns) earns saves; posts that solve a problem a colleague has earn sends. Track both: they show value that reactions miss.

## External links

- **[Official]** LinkedIn has not said that links are penalised. Rishi Jobanputra answered the question in 2025 by advising: "make sure your post gives enough context that it could stand alone without the link" ([Jobanputra, 2025](https://www.linkedin.com/posts/rishij_back-to-answer-more-feed-questions-and-reminder-activity-7361548020384976897--dhX)). LinkedIn's creator FAQ says "Posts without links often spark more conversation by keeping people in-platform" and treats putting the link in a comment as one option ([LinkedIn Create FAQ](https://members.linkedin.com/create-insights)).
- **[Data]** The studies disagree:
  - Van der Blom 2024: −40% to −50% reach for personal profiles with an external link, compared with text plus image.
  - A 2026 figure attributed to van der Blom (−18.8% median reach for one link, on 1.3M posts) circulates only in secondary coverage, with disputed dating ([Agility PR, 2026](https://www.agilitypr.com/pr-news/social-media-influencer-marketing/the-linkedin-link-tax-why-sharing-your-blog-is-costing-you-60-percent-of-your-audience/)).
  - Metricool's 2025 study of company pages found link posts had *more* interactions ([Search Engine Journal, 2025](https://www.searchenginejournal.com/linkedin-study-finds-adding-links-boosts-engagement-by-13/544524/)).
  - Small tests by Hootsuite (2021, 7 linkless posts) and Sprout Social (2023, 8 posts) favoured links in comments, but they are far too small to generalise ([Hootsuite, 2021](https://blog.hootsuite.com/linkedin-engagement-experiment/); [Sprout Social, 2023](https://sproutsocial.com/insights/linkedin-link-in-comments/)).
- **What to do:** make the post valuable without the click. If the link is the point (a launch, a long article), include it and accept that it may cost some reach; if the link is supporting material, put it in the first comment or your Featured section. Test both on your own account before deciding. Note that a link added later by editing does not get a new preview image ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a522811)).

## Hashtags

- **[Official, changed over time]** In 2019 LinkedIn said followed hashtags got "an extra boost" and recommended "no more than three" ([LinkedIn, 2019](https://news.linkedin.com/2019/January/what-s-in-your-linkedin-feed--people-you-know--talking-about-thi)). In February 2024 profile hashtags ("talks about") were removed ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a5999182)). In 2025 Jobanputra wrote "Hashtags are a nice to have, not a need to have" ([Jobanputra, 2025](https://www.linkedin.com/posts/rishij_i-was-asked-recently-if-you-should-include-activity-7351729382903762944-4v4M/)), and LinkedIn's creator FAQ now says hashtags "don't directly influence distribution but can help members discover and understand your post" ([LinkedIn Create FAQ](https://members.linkedin.com/create-insights)). Irrelevant hashtags are listed as something to avoid ([LinkedIn: What to avoid](https://www.linkedin.com/blog/content-recommendations-avoid)).
- **[Data]** Van der Blom's 2024 report associated four hashtags with +9% median reach. That is a small, correlational effect from before LinkedIn's 2025 statements.
- **What to do:** zero to three specific, relevant hashtags, or none. Spend the effort on clear topic words in the text, which the models read anyway.

## Posting frequency

- **[Official]** LinkedIn's creator pages say "Aim to publish between 2-5 posts per week" and "Consistency helps you build community" ([LinkedIn Create](https://members.linkedin.com/create-start)). The FAQ adds that some audiences "tune out" with very frequent updates.
- **[Data]** Buffer (2M+ posts, 94,000+ accounts, 2025) compared each account's weeks with its own average and found that weeks with more posts had more impressions *per post*, not fewer ([Buffer, 2025](https://buffer.com/resources/how-often-to-post-on-linkedin/)). Van der Blom's 2024 report advised 3–4 posts a week and said a second post within 24 hours splits reach; in 2026 he said lower-frequency posters had gained reach and two to three posts a week is enough. These conflict.
- **What to do:** pick a cadence you can sustain with good ideas (two to four a week suits most people), keep at least a day between posts unless you have a reason, and change frequency as a deliberate experiment. The posting cap in this server (two posts a day by default) is a safety limit, not a target.

## Editing after publishing

- **[Official]** Edited posts show an "Edited" label, only the text can be edited, and media can't be replaced ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a522811)). No LinkedIn page we could verify says editing affects reach. An Inc. column quotes Jobanputra saying editing "has no impact on its reach", but we couldn't access the original to confirm it.
- **[Data, older]** Van der Blom's 2021 report claimed an extra −25% for editing within the first hour; his 2024 report said adding a link by editing carried no penalty if under 15% of the content changed.
- **What to do:** fix typos and factual errors without worrying. Avoid rewriting a post heavily after it has comments, because it changes what commenters replied to.

## Tagging people and companies

- **[Official]** LinkedIn's 2019 guidance: "only mention people that you think are likely to respond, max five is a good rule of thumb." "Tagging for attention" is on LinkedIn's list of engagement bait to avoid ([LinkedIn, 2019](https://news.linkedin.com/2019/January/what-s-in-your-linkedin-feed--people-you-know--talking-about-thi); [What to avoid](https://www.linkedin.com/blog/content-recommendations-avoid)).
- **[Data]** Van der Blom's 2024 report associated tags of people who respond with higher reach and tags of people who don't respond with lower growth. Treat the specific percentages in circulation as unverified.
- **What to do:** tag people who are genuinely part of the story (you quote them, you worked with them, you credit them), tell them in advance where it fits, and never tag strangers to borrow their audience. See "strategic tag" in the post-formats topic.

## Formats: documents, images, polls, video, articles and newsletters

The data on formats changes year to year and differs between personal profiles and company pages.

| Format | What LinkedIn says | What the data says |
|---|---|---|
| Document (PDF carousel) | No official ranking statement. | AuthoredUp 2026 (3M+ posts, personal profiles): 1.39x median reach, 1.30x engagement ([AuthoredUp](https://authoredup.com/blog/best-performing-content-on-linkedin)). Socialinsider (company pages, 2025 data): highest engagement rate of any format, 7.00% ([Socialinsider, 2026](https://cdn.socialinsider.io/documents/linkedin_benchmarks_2026.pdf)). Van der Blom 2024: 1.6x, down from 2.2x. |
| Image | No official ranking statement. | AuthoredUp 2026: 1.20x reach, 1.33x engagement. Shield Index (March 2026): highest typical reach rate of any format, 14% of followers ([Shield Index, 2026](https://theshieldindex.beehiiv.com/p/march-2026-linkedin-reach-by-content-format)). |
| Poll | 2022: "too many polls in the feed"; fewer polls shown from people you don't know ([LinkedIn, 2022](https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive)). Reaction-vote polls ("Like if you agree") are engagement bait. | AuthoredUp 2026: 1.78x reach but 0.37x engagement: polls get seen, rarely discussed. |
| Video | Pushed in 2024–2025: uploads up 36% ([TechCrunch, 2025](https://techcrunch.com/2025/02/04/linkedin-amps-up-vertical-video-tools-as-uploads-jump-36)); guidance is vertical, 90 seconds or shorter, captions, a hook at the start ([LinkedIn Create](https://members.linkedin.com/create-grow)). 2026: "videos that don't match the text" count as engagement bait ([LinkedIn, 2026](https://news.linkedin.com/2026/ImprovingTheFeed)). | Per-post video reach fell: AuthoredUp 0.86x (down 36% year on year); Shield puts video in the lowest reach band (7%). Socialinsider: video views on company pages down 36%. |
| Text only | Format variety encouraged. | AuthoredUp 2026: 1.07x reach, 0.78x engagement. Very short text posts (under 400 characters) do worst. |
| Article (standalone) | Articles can be up to 125,000 characters. | Van der Blom 2026: about 0.4x normal reach; AuthoredUp 2026: 0.69x. |
| Newsletter | Subscribers get push, in-app and email notifications for each edition; new followers are automatically invited to subscribe ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a517914)). | Van der Blom 2024: newsletter articles got "nearly 4x" the reach of standalone articles. |

**What to do:** use the format the idea needs. Documents suit step-by-step frameworks people want to keep; images suit one striking visual or a chart; text suits stories and arguments; video suits demonstrations and personality; polls suit genuine questions where the result will be useful (and you follow up with what you learned). A newsletter builds a subscriber list that is notified directly, which no post can do.

## The "golden hour" and post age

- **[Uncertain]** No LinkedIn source mentions a "golden hour". The nearest official statements are the 2019 engineering post's "timely feedback to content creators" and the Help signal "Engagement others have with your posts and how recent it is". A third-party summary of van der Blom's 2022 report says "90 minutes is the new deciding factor".
- **[Official]** Recency is a ranking signal, but older posts can still be shown. In July 2025 LinkedIn tested showing weeks-old posts, called it temporary, and said it "may sometimes share posts that are older and still relevant" ([Mediaweek, 2025](https://www.mediaweek.com.au/linkedin-rolls-back-feed-change-that-showed-weeks-old-posts/)). Jobanputra: "Just because a post is a week or two old doesn't mean it's no longer relevant" ([PR Daily, 2025](https://www.prdaily.com/what-works-and-doesnt-on-linkedin-according-to-guardians-of-the-feed/)).
- **What to do:** post when you can be around for the first hour or two to reply to comments, because replies keep a conversation going and LinkedIn values prompt creator responses. Don't ask friends or pods to engage on cue; that is the inauthentic engagement LinkedIn prohibits (see ethics).

## Best time to post

- **[Official]** "Weekday mornings and early afternoons often result in higher engagement", and LinkedIn tells creators to test for their own audience ([LinkedIn Create FAQ](https://members.linkedin.com/create-insights)).
- **[Data]** Buffer (4.8M posts, 2026): weekdays 3–8 p.m. local time ([Buffer, 2026](https://buffer.com/resources/best-time-to-post-on-linkedin/)). Sprout Social (2026): Tuesday to Thursday, late morning to afternoon ([Sprout Social, 2026](https://sproutsocial.com/insights/best-times-to-post-on-linkedin/)). They disagree because their users' audiences differ.
- **What to do:** start on a weekday when your audience is at work in their timezone, at a time you can be present, and change one thing at a time.

## Engagement bait and low-quality signals

**[Official]** LinkedIn has said it will not promote, or will limit, the following:

- Posts that "expressly ask or encourage the community to engage with content via likes or reactions" for reach ([LinkedIn, 2022](https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive)).
- Reaction-vote polls, tagging for attention, unrelated sharing requests, exaggerated claims and irrelevant hashtags ([LinkedIn: What to avoid](https://www.linkedin.com/blog/content-recommendations-avoid)). Asking for thoughts and feedback is fine.
- "Repetitive, low-substance posts and engagement bait", such as "comment to agree" prompts, plus "recycled and click-driven posts" ([LinkedIn, March 2026](https://news.linkedin.com/2026/ImprovingTheFeed)).
- Content "designed to artificially increase engagement", including emoji or reaction polls and chain-letter posts requesting likes and shares ([LinkedIn Help: Spam](https://www.linkedin.com/help/linkedin/answer/a1338787)).
- AI-assisted content isn't penalised for being AI-assisted: "LinkedIn's focus is not on how content is created, but whether it adds value". But "Content that feels generic, repetitive, or lacks a clear point of view is less likely to be widely distributed" ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1481496)).

## Summary: what to rely on

1. **Strong evidence:** the feed predicts each viewer's dwell, skips and active responses; knowledge and advice, relevance to the viewer's interests and genuine conversation are favoured; engagement bait, pods and automated comments are demoted or prohibited.
2. **Moderate evidence:** documents and images tend to beat plain text and video per post in 2025–2026 datasets; very short text posts underperform; reach per post fell sharply in 2024–2025.
3. **Weak or contested:** the size of any link penalty, the best posting time, the ideal frequency, exact weights for comments versus likes, and any "golden hour" rule.

When in doubt, the durable strategy is the same one LinkedIn describes: be specific about your expertise, write for one clear audience, give enough in the post itself that it stands alone, and respond to the people who engage.
`,
};
