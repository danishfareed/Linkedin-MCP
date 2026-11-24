import type { Locator } from "patchright";
import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError, selectorBroken } from "../../errors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { POST_METRICS, DEMOGRAPHIC_CATEGORIES, type Demographic, type Metric, readDemographics, readMetrics } from "../parse/analytics.js";
import { type Comment, parseComments } from "../parse/comments.js";
import { EXTRACT, SEL } from "../selectors.js";
import { activityUrn, postAnalyticsUrl, postUrl } from "../urls.js";

export const REACTIONS = ["like", "celebrate", "support", "love", "insightful", "funny"] as const;
export type Reaction = (typeof REACTIONS)[number];

async function openPost(nav: Nav, url: string): Promise<Locator> {
  await nav.goto(postUrl(url), { waitFor: EXTRACT.feedPost.container });
  const post = nav.page.locator(EXTRACT.feedPost.container.join(", ")).first();
  if (!(await post.count())) {
    throw new LinkedInMcpError("INVALID_INPUT", "That post could not be found. It may have been deleted, or you may not have access to it.", "Check the post URL and try again.", { url });
  }
  return post;
}

async function expandComments(nav: Nav, scope: Locator, wanted: number): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const count = await nav.page.locator(EXTRACT.comment.container.join(", ")).count();
    if (count >= wanted) return;
    const more = await findOptional(scope, SEL.post.loadMoreComments, { timeout: 1500 });
    if (!more) return;
    await more.click();
    await nav.pacer.beat(1200, 2500);
  }
}

export async function readComments(nav: Nav, url: string, limit: number): Promise<Comment[]> {
  const post = await openPost(nav, url);
  await waitForAny(nav.page, EXTRACT.comment.container, 6000);
  await expandComments(nav, post, limit);
  return parseComments(await extractSnapshots(nav.page, EXTRACT.comment), limit);
}

async function likeButton(post: Locator): Promise<Locator> {
  return find(post, SEL.post.likeButton, { timeout: 8000 });
}

/** Never toggles: if you've already reacted, it reports that and does nothing. */
export async function react(nav: Nav, url: string, reaction: Reaction): Promise<{ status: "reacted" | "already_reacted"; reaction: Reaction }> {
  const post = await openPost(nav, url);
  const button = await likeButton(post);
  const pressed = await button.getAttribute("aria-pressed");
  const label = (await button.getAttribute("aria-label")) ?? "";
  if (pressed === "true" || /^(unlike|remove)/i.test(label)) return { status: "already_reacted", reaction };

  if (reaction === "like") {
    await button.click();
  } else {
    await button.hover();
    await nav.pacer.beat(900, 1600);
    const name = new RegExp(`^(react )?${reaction}$`, "i");
    const option = await findOptional(nav.page, { name: `post.reaction.${reaction}`, candidates: [{ role: "button", name }, { css: `button[aria-label='${reaction[0]!.toUpperCase()}${reaction.slice(1)}']` }] }, { timeout: 5000 });
    if (!option) throw selectorBroken(`post.reaction.${reaction}`);
    await option.click();
  }
  await nav.pacer.beat();
  return { status: "reacted", reaction };
}

async function submitInto(nav: Nav, scope: Locator, editor: Locator, text: string): Promise<void> {
  await editor.click();
  await nav.pacer.beat(300, 800);
  await nav.pacer.typeText(nav.page, text);
  await nav.pacer.beat(600, 1400);
  const submit = await find(scope, SEL.post.commentSubmit, { timeout: 6000 });
  await submit.click();
  await nav.pacer.beat(1500, 3000);
}

async function textAppears(scope: Locator, text: string): Promise<boolean> {
  const probe = text.split("\n")[0]!.slice(0, 60).trim();
  if (!probe) return false;
  return scope
    .getByText(probe, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
}

export async function comment(nav: Nav, url: string, text: string): Promise<{ status: "commented"; verified: boolean }> {
  const post = await openPost(nav, url);
  let editor = await findOptional(post, SEL.post.commentEditor, { timeout: 2500 });
  if (!editor) {
    const button = await find(post, SEL.post.commentButton, { timeout: 6000 });
    await button.click();
    await nav.pacer.beat();
    editor = await find(post, SEL.post.commentEditor, { timeout: 6000 });
  }
  await submitInto(nav, post, editor, text);
  return { status: "commented", verified: await textAppears(post, text) };
}

export async function reply(nav: Nav, url: string, commentId: string, text: string): Promise<{ status: "replied"; verified: boolean }> {
  const post = await openPost(nav, url);
  const selector = `article[data-id="${commentId.replace(/"/g, '\\"')}"], div[data-id="${commentId.replace(/"/g, '\\"')}"]`;
  let target = nav.page.locator(selector).first();
  for (let i = 0; i < 6 && !(await target.count()); i++) {
    const more = await findOptional(post, SEL.post.loadMoreComments, { timeout: 1500 });
    if (!more) break;
    await more.click();
    await nav.pacer.beat(1200, 2500);
    target = nav.page.locator(selector).first();
  }
  if (!(await target.count())) {
    throw new LinkedInMcpError("INVALID_INPUT", "That comment was not found on the post.", "Call get_post_comments to get a current comment_id, then try again.", { comment_id: commentId });
  }
  const replyButton = await find(target, SEL.comment.replyButton, { timeout: 6000 });
  await replyButton.click();
  await nav.pacer.beat();
  const editor = await find(target, SEL.comment.replyEditor, { timeout: 6000 }).catch(async () => find(post, SEL.post.commentEditor, { timeout: 3000 }));
  // A reply box may pre-fill an @mention; type after it.
  await editor.click();
  await nav.page.keyboard.press("End");
  await submitInto(nav, target, editor, text);
  return { status: "replied", verified: await textAppears(target, text) };
}

export async function deletePost(nav: Nav, url: string): Promise<{ status: "deleted" }> {
  const post = await openPost(nav, url);
  const menu = await find(post, SEL.post.controlMenu, { timeout: 8000 });
  await menu.click();
  await nav.pacer.beat();
  const item = await find(nav.page, SEL.post.deleteItem, { timeout: 5000 }).catch(() => {
    throw new LinkedInMcpError("INVALID_INPUT", "This post has no Delete option. You can only delete your own posts.", "Check that the URL points to one of your posts.", { url });
  });
  await item.click();
  await nav.pacer.beat();
  const confirm = await find(nav.page, SEL.post.deleteConfirm, { timeout: 5000 });
  await confirm.click();
  await nav.pacer.beat(1500, 2500);
  return { status: "deleted" };
}

export interface PostAnalytics {
  post_urn: string;
  metrics: Record<string, Metric>;
  demographics: Demographic[];
}

export async function readPostAnalytics(nav: Nav, url: string): Promise<PostAnalytics> {
  await nav.goto(postAnalyticsUrl(url), { waitFor: ["main"] });
  await nav.pacer.scroll(nav.page, 2);
  const [snap] = await extractSnapshots(nav.page, EXTRACT.page);
  const text = snap?.text ?? "";
  if (!/impressions/i.test(text)) {
    throw new LinkedInMcpError("INVALID_INPUT", "LinkedIn did not show analytics for that post. Analytics are only available for your own posts.", "Check that the URL points to one of your posts.", { url });
  }
  return { post_urn: activityUrn(url), metrics: readMetrics(text, POST_METRICS), demographics: readDemographics(text, DEMOGRAPHIC_CATEGORIES) };
}
