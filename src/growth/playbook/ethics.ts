import type { PlaybookTopic } from "./types.js";

export const ethics: PlaybookTopic = {
  id: "ethics",
  title: "Ethics and compliance",
  summary:
    "What not to do, aligned with LinkedIn's Professional Community Policies and User Agreement: pods, automation, engagement bait, fake or misleading claims, undisclosed sponsorships, giveaways, copying, scraping, spam, harassment, privacy and confidentiality, honest use of AI, and how linkedin-mcp's safety model fits.",
  keywords: ["ethics", "compliance", "policy", "policies", "terms", "user agreement", "professional community policies", "spam", "pods", "automation", "bots", "disclosure", "sponsored", "giveaway", "privacy", "confidentiality", "misleading", "ai content", "copyright"],
  body: `## Principles

Sustainable growth on LinkedIn rests on four commitments:

1. **Truth:** every claim, number, story and credential is real and yours to share.
2. **Consent:** people, clients and conversations appear in your posts only with their permission.
3. **Transparency:** paid relationships, AI-generated media and changed details are disclosed.
4. **Authentic engagement:** every comment, reaction and message is a real person's real response, at a human pace.

These are also LinkedIn's rules. Breaking them risks reduced distribution, removed content, restricted accounts and lost trust.

## What LinkedIn's rules say

**Professional Community Policies** ([LinkedIn](https://www.linkedin.com/legal/professional-community-policies)):

- Spam and fake engagement: "Do not spam members or the platform." "Do not use our invitation feature to send promotional messages to people you don't know." "Don't do things to artificially increase engagement with your content. Respond authentically to others' content and don't agree with others ahead of time to like or re-share each other's content."
- Identity: "We don't allow fake profiles or entities. Do not post misleading or deceptive information about yourself, your business, your qualifications, work experience, affiliations, or achievements."
- Misleading content: "Do not share content that is false, misleading, or intended to deceive."
- Endorsements: "Do not share content or endorse someone or something in exchange for personal benefit… unless you have included a clear and conspicuous notice of the personal benefit you receive."
- Harassment: "We don't allow bullying or harassment," including "targeted personal attacks, intimidation, shaming, disparagement, and abusive language," and "trolling or other repetitive negative content."
- Contests: "You may not use LinkedIn to hold lotteries, contests, sweepstakes, or giveaways."

**User Agreement, section 8.2** ([LinkedIn, effective November 3, 2025](https://www.linkedin.com/legal/user-agreement)): members agree not to:

- "Use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement".
- Use software or scripts "to scrape or copy the Services, including profiles and other data".
- Interfere with the Services, including "manipulating algorithms".
- "copy or distribute (except through the available sharing functionality) the posts or other content of others without their permission".

**Spam policy and enforcement:** LinkedIn "may remove or limit the distribution of content designed to artificially increase engagement", with examples including reaction polls and chain posts asking for likes and shares ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1338787)). LinkedIn names engagement pods and automated comments as not allowed, with possible account restrictions and removal from programs such as Top Voices ([LinkedIn, 2026](https://news.linkedin.com/2026/authentic-content-and-conversations)). Its help page on prohibited software adds that it doesn't permit "fake engagement on LinkedIn's website, including any tools or services that try to manipulate LinkedIn's content algorithms" ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1341387)).

## Do not

| Don't | Why |
|---|---|
| Join or run engagement pods, or arrange likes and reposts in advance | Explicitly prohibited; detected and demoted |
| Use bots, extensions or scripts to like, comment, connect or message automatically | Prohibited by the User Agreement; automated comments are filtered and can lead to restrictions |
| Ask for likes, reactions or "comment YES" to boost reach | Engagement bait; LinkedIn doesn't promote it |
| Invent statistics, studies, quotes, testimonials, case studies or stories | Misleading content; and once found out, it destroys trust |
| Inflate titles, credentials, clients or results | Prohibited misleading information about yourself |
| Post sponsored or affiliate content without a clear disclosure | Required "clear and conspicuous notice" |
| Run giveaways, contests or sweepstakes | Not allowed on LinkedIn |
| Copy other people's posts or carousels, or repost them as your own | Prohibited without permission; credit and use sharing features instead |
| Scrape profiles or export people's data in bulk | Prohibited; also a privacy problem |
| Send promotional connection requests or mass messages to strangers | Spam |
| Pile on, mock or target individuals, including in "bad example" teardowns | Harassment; critique the work, not the person |
| Tag people for attention who aren't part of the content | Listed by LinkedIn as engagement bait |
| Post videos or images that don't match the text, to farm attention | Named by LinkedIn in 2026 as engagement bait |

## Privacy and confidentiality

- Don't share private messages, emails or screenshots of conversations without the other person's consent.
- Blur or remove names, faces, email addresses and customer data from screenshots unless you have permission.
- Get written permission before naming clients or sharing their results; if you anonymise, say so ("details changed to protect the client").
- Respect your employer's confidentiality and social media policies, especially about unreleased products, financials and customers.
- Ask colleagues before featuring them in photos or stories.

## Regulated and sensitive topics

- **Financial services, healthcare, pharmaceuticals, legal and other regulated fields:** follow your industry's rules on claims, advice and testimonials, and your employer's compliance process.
- **Fundraising:** talk to a lawyer before posting about an active private fundraise; public promotion of securities offerings is restricted in some jurisdictions.
- **Health, money and career claims:** don't promise outcomes. Share what happened to you and why, and say it may not generalise.
- **News and tragedies:** don't use disasters, deaths or layoffs as hooks for your content.

## Using AI honestly

- LinkedIn's position: "LinkedIn's focus is not on how content is created, but whether it adds value", and members should "review, edit, and approve" AI-assisted content ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1481496)).
- LinkedIn shows a Content Credentials (C2PA) icon on media that carries provenance data, so people can trace the origin of AI-created images ([LinkedIn, 2024](https://news.linkedin.com/2024/May/linkedin-rolls-out-c2pa-ai-generated-content-standard)).
- Every fact, story and opinion in an AI-assisted draft must come from the author. AI can help structure, tighten and suggest; it must not invent experiences, results or quotes.
- Don't generate images that depict real people doing things they didn't do, or that could be mistaken for real photos of events.
- Don't let AI write comments or messages on autopilot. LinkedIn filters automated comments, and readers notice.

## How linkedin-mcp's safety model fits

linkedin-mcp is designed so that you stay the author of everything sent from your account:

- Every post, schedule, comment, reply, reaction, connection request, invitation response, message and deletion is shown as a preview first, and sent only after you approve that specific action (confirm_action). One approval sends one action.
- Daily and weekly caps (halved during the first 14 days), working hours and one-action-at-a-time pacing keep activity at a human pace. When a cap is reached, the tools stop until it resets.
- The server pauses everything if LinkedIn shows a security check or starts rate-limiting.
- It deliberately doesn't do mass messaging, connection campaigns, bulk scraping, multiple accounts or job applications.

Be clear-eyed: LinkedIn's User Agreement restricts automated access in general, and the README's disclaimer explains the remaining risk. The safety model reduces risk and keeps every send a deliberate human decision; it doesn't make LinkedIn's rules optional. Never use it to do anything this topic lists under "Do not".

## Before you publish: five questions

1. Is every fact, number and story in this post true, and can I show where it came from?
2. Do I have permission for every person, client, screenshot and quote?
3. Have I disclosed any paid or personal-benefit relationship?
4. Am I asking for anything that looks like engagement bait?
5. Would I be comfortable if the people mentioned, my employer and my best customer read this?

If any answer is no, fix it before posting.
`,
};
