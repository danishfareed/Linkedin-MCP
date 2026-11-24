import type { PlaybookTopic } from "./types.js";

export const profile: PlaybookTopic = {
  id: "profile",
  title: "Profile optimisation",
  summary:
    "How to turn a LinkedIn profile into a landing page: headline formulas, the About structure, Featured, cover image, photo, CTA, skills, custom URL, Open to Work and Service Pages, with LinkedIn's own specifications and a scored audit checklist.",
  keywords: ["profile", "headline", "about", "summary", "featured", "banner", "cover image", "photo", "custom url", "skills", "open to work", "service page", "follow button", "audit", "creator mode"],
  body: `## Why the profile matters for growth

Every post that works sends people to your profile. LinkedIn's post analytics count "profile viewers from this post" and "followers gained from this post" separately ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a516971)), and those are often the numbers that matter for your goal. A post that earns 50 profile views with a weak profile wastes most of them.

The profile also feeds distribution. LinkedIn's 2026 engineering description of the feed lists the profile information members choose to share ("industry, experience, skills, geography") among its signals, and a LinkedIn engineering VP said ranking "factors in the author's professional identity, such as experience" ([LinkedIn Engineering, 2026](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed); [Jurka, 2025](https://www.linkedin.com/pulse/how-does-linkedin-feed-work-tim-jurka-oxraf/)). A profile and posts that tell the same story make it easier for the system, and for people, to understand what you're for. (The mechanics are LinkedIn's; the strategic implication is our inference.)

Treat the profile as a landing page for one reader (your ICP) with one next step.

Note: linkedin-mcp can read your profile (get_my_profile) and suggest changes, but it can't edit your profile. You make the edits in LinkedIn yourself.

## Headline

The headline appears next to your name almost everywhere: on posts, comments, search results, invitations. Often only its beginning is visible, so front-load what matters. LinkedIn's help pages don't state a character limit; third-party guides commonly cite about 220 characters, and LinkedIn's editor will stop you at the limit.

**Formulas:**

1. **Role, reader, outcome:** "Fractional CFO for bootstrapped SaaS | Month-end close in 5 days, not 15"
2. **Outcome plus proof:** "I help B2B teams halve customer onboarding time | 40+ rollouts since 2019"
3. **Founder:** "Co-founder at Tidewater: payroll for seasonal businesses | Writing about hiring hourly teams"
4. **Job seeker:** "Senior Product Designer, B2B SaaS and design systems | Open to lead roles in Berlin or remote"
5. **Creator:** "I write about pricing for early-stage founders | Weekly newsletter: Price Notes"
6. **Seller who serves:** "Helping hospital operations leaders reduce no-shows | Account Executive at Clinicly"

**Rules:**

- Lead with the reader or the outcome, not a list of titles ("CEO | Speaker | Investor | Mentor" says nothing about who you help).
- Use the words your ICP would search for and recognise (see the ICP worksheet's vocabulary).
- Include one credibility marker only if it's strong and true.
- Avoid buzzwords ("passionate", "results-driven", "ninja") and emoji clutter.

## About section

The opening lines show before "see more", so they must carry the core message. LinkedIn's help pages don't state the length limit; third-party guides cite about 2,600 characters.

**Structure:**

1. **Opening (two lines):** who you help and the problem you solve, in the reader's words.
2. **What you do and how:** your approach or method, and what makes it different.
3. **Proof:** specific results, clients (with permission), numbers, notable work.
4. **What you believe:** the point of view that shapes your work, including who you're *not* a fit for.
5. **A human line:** something true that makes you memorable, connected to your work.
6. **Next step:** exactly what to do (read the newsletter, download the audit, message you about X, book a call), and how.

Write in the first person, in short paragraphs, the way you'd explain your work to a smart friend. Since 2024 the About section appears near the top of the profile ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a5999182)), so it's read more than it used to be.

## Featured section

Featured shows a row of items near the top of your profile: posts you created or reshared, LinkedIn articles, external links, and uploaded images, documents, presentations and videos ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a550399)).

Pick three to five items in the order of your funnel:

1. The resource a new visitor should start with (lead magnet or best guide).
2. Your strongest proof (a case study post or results).
3. Your signature idea (your most saved post or carousel).
4. The next step: newsletter, Service Page, booking link or job openings.

Review Featured monthly; replace items that no longer represent your best work.

## Cover image (banner)

LinkedIn recommends a JPG or PNG under 8MB at 1584 × 396 pixels ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a568217)).

- Use it to restate your positioning in a few words, show proof (logos with permission, a result, a book cover), or point to the next step (newsletter name, URL).
- Your photo covers part of the image and the crop differs between desktop and mobile, so keep text away from the edges and check both views.
- Keep it simple: one message, high contrast, readable on a phone.

## Profile photo

LinkedIn's specifications: PNG or JPG, between 400 × 400 and 7680 × 4320 pixels, up to 8MB, no GIFs ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a549049)). LinkedIn's Talent Blog advises that your face take up at least 60% of the frame ([LinkedIn, 2024](https://www.linkedin.com/business/talent/blog/product-tips/tips-for-taking-professional-linkedin-profile-pictures)).

LinkedIn has published how much a photo matters, though the figures have changed: "up to 21x more profile views and 9x more connection requests" ([LinkedIn Blog, 2017](https://web.archive.org/web/20180508203217/https://blog.linkedin.com/2017/march/14/linkedin-profile-photo-tips-introducing-photo-filters-and-editing)), and in 2024, a profile with a picture is "14 times more likely to be viewed" ([LinkedIn Talent Blog, 2024](https://www.linkedin.com/business/talent/blog/product-tips/tips-for-taking-professional-linkedin-profile-pictures)). These are LinkedIn's own correlational figures, but the direction is clear.

- A recent photo that looks like you on a video call: face clearly visible, good light, plain background, a natural expression.
- LinkedIn's policies require that your photo be your likeness ([Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies)); don't use logos, group photos or heavily altered images.

## The primary button and CTAs

When LinkedIn retired creator mode in 2024, it kept its tools for everyone and let members choose **Follow** or **Connect** as the primary button on their profile ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a5999182)).

- **Follow** suits creators, founders and consultants building an audience: people can subscribe to your posts without a two-way connection.
- **Connect** suits job seekers, sellers and people building a smaller, closer network.

Make the next step visible in several places: the last line of the About section, a Featured item, the cover image, and the contact information (website, email if you want it public).

## Experience, skills and recommendations

**Experience:** write each recent role as outcomes, not duties ("rebuilt the onboarding flow; activation rose from 31% to 48%"), using the words your ICP searches for. Add media (decks, case studies, demos) to roles where it helps.

**Skills:** list the skills you want to be found for and pin the most important ones. LinkedIn's figures here have also changed: in 2018 it said at least five skills brought "up to 17x more profile views" ([LinkedIn Blog, 2018](https://web.archive.org/web/20190719013136/https://blog.linkedin.com/2018/april/12/linkedin-tips-to-keep-your-profile-fresh)); in 2024, that listing at least one skill brings "up to 2x more profile views and connection requests and up to 4x more messages" ([LinkedIn Talent Blog, 2024](https://www.linkedin.com/business/talent/blog/talent-acquisition/skills-on-linkedin-profile)). Skills also tell LinkedIn's systems what you're about.

**Location:** set it accurately. The same 2018 LinkedIn post said members with a location could be "discovered up to 23x more in searches".

**Recommendations:** ask specific people for a specific story ("could you mention the migration project and what changed for your team?"). Three recent, specific recommendations beat twenty generic ones.

## Custom URL

LinkedIn's rules: 3–100 characters, no spaces, symbols, special characters or the word "LinkedIn"; case-insensitive; you can change it up to five times within six months, and the old URL stays linked to you for six months unless you unlink it ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a542685)).

Use your name, or your name plus a short, stable qualifier if it's taken. Avoid job titles or employer names that may change.

## Open to Work and Service Pages

**Open to Work** has visibility options: all LinkedIn members (which adds the #OpenToWork photo frame), recruiters only (LinkedIn takes steps to hide it from recruiters at your current company "but we can't guarantee complete privacy"), or only you ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a507508)). Job seekers who are currently employed should usually choose recruiters only. See the personas topic for when the public frame helps or hurts.

**Service Pages** are free landing pages for freelancers and small business owners who offer services; any member can message you about them ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a569534)). Some features need Premium ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a569554)). Consultants and agency owners should set one up and list services in their ICP's words.

**Newsletter:** any member can create one ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a517914)), and new followers are automatically invited to subscribe. Start it when you can sustain a cadence; an abandoned newsletter is a visible broken promise.

## Profile audit checklist

Score each item 0 (missing or weak), 1 (present but generic) or 2 (specific and strong). Fix the lowest scores first.

| # | Item | What "2" looks like | Why it matters |
|---|---|---|---|
| 1 | Photo | Recent, face fills most of the frame, good light | LinkedIn's own data links photos to many more profile views |
| 2 | Headline | Names the reader and the outcome; keywords at the start | Shown next to every post and comment; often truncated |
| 3 | Cover image | One clear message or proof point, readable on mobile | Second thing visitors see; free positioning space |
| 4 | About opening | First two lines state who you help and with what | Only the opening shows before "see more" |
| 5 | About body | Method, proof, point of view, next step | Converts curious visitors into followers or leads |
| 6 | Featured | 3–5 items ordered: start here, proof, signature idea, next step | The most clickable part of the profile |
| 7 | Primary button | Follow or Connect chosen to fit the goal | Decides how visitors can stay in touch |
| 8 | Experience | Outcomes with numbers, keywords, media | Proof of the claims in the headline; feeds search and ranking |
| 9 | Skills | Relevant skills pinned, aligned with pillars | Discovery by recruiters and search; LinkedIn reads them as signals |
| 10 | Custom URL and contact | Clean URL, website or booking link | Makes you easy to find and reach |
| 11 | Activity | Recent posts and comments on your pillar topics | Visitors check whether you're active and consistent |
| 12 | Goal-specific | Open to Work set correctly, Service Page, or newsletter | Matches the profile to the goal |

A total of 20 or more out of 24 is strong. Anything under 14 means the profile is leaking the attention your posts earn: fix it before increasing posting volume.
`,
};
