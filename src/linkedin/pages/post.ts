import type { Locator } from "patchright";
import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError, selectorBroken } from "../../errors.js";
import { FORM_FROM_EDITOR, WORDS } from "../anchors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { assertEnglish } from "../language.js";
import { type WriteResult, notSent, pollUntil, runWrite, sent, unconfirmed } from "../outcome.js";
import { POST_METRICS, DEMOGRAPHIC_CATEGORIES, type Demographic, type Metric, readDemographics, readMetrics } from "../parse/analytics.js";
import { type Comment, parseComments } from "../parse/comments.js";
import { type ReactionState, alreadyReacted, editorHolds, newMatchingItem, reactionApplied } from "../parse/verify.js";
import { readOwnTexts, readReactionState, waitForDialog, waitForNoDialog } from "../scope.js";
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

async function currentReaction(post: Locator): Promise<ReactionState | null> {
  const button = await findOptional(post, SEL.post.likeButton, { timeout: 1000 });
  return button ? readReactionState(button) : null;
}

/** Never toggles: if you've already reacted, it reports that and does nothing. */
export async function react(nav: Nav, url: string, reaction: Reaction): Promise<WriteResult> {
  const post = await openPost(nav, url);
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
    const button = await likeButton(post);
    const before = await readReactionState(button);
    if (alreadyReacted(before, WORDS.reacted)) {
      return notSent("already_reacted", "you've already reacted to this post, and linkedin-mcp never removes or changes a reaction", { next_step: "Nothing to do.", data: { reaction } });
    }

    if (reaction === "like") {
      attempt.commit("like");
      await button.click();
    } else {
      await button.hover();
      await nav.pacer.beat(900, 1600);
      const name = new RegExp(`^(react )?${reaction}$`, "i");
      const option = await findOptional(nav.page, { name: `post.reaction.${reaction}`, candidates: [{ role: "button", name }, { css: `button[aria-label='${reaction[0]!.toUpperCase()}${reaction.slice(1)}']` }] }, { timeout: 5000 });
      if (!option) throw selectorBroken(`post.reaction.${reaction}`);
      attempt.commit(reaction);
      await option.click();
    }

    const applied = await pollUntil(async () => {
      const after = await currentReaction(post);
      return after !== null && reactionApplied(before, after, reaction, WORDS.reacted, WORDS.notReacted);
    }, 5000);
    if (applied) return sent({ reaction });
    return unconfirmed("reaction_not_shown", "the reaction button didn't switch to a reacted state", { reaction });
  });
}

/** Types into an editor and checks the text landed there before anything is submitted. */
async function typeInto(nav: Nav, editor: Locator, text: string): Promise<void> {
  await editor.click();
  await nav.pacer.beat(300, 800);
  await nav.pacer.typeText(nav.page, text);
  await nav.pacer.beat(600, 1400);
  if (!editorHolds(await editor.innerText().catch(() => ""), text)) {
    throw new LinkedInMcpError("INTERNAL", "The text didn't land in LinkedIn's comment box as written, so nothing was sent.", "Try again. If it keeps happening, report it as a broken selector.");
  }
}

/** The submit button of the editor's own form, else the first one in `scope`. */
async function submitButton(editor: Locator, scope: Locator): Promise<Locator> {
  return (await findOptional(editor.locator(FORM_FROM_EDITOR), SEL.post.commentSubmit, { timeout: 2000 })) ?? (await find(scope, SEL.post.commentSubmit, { timeout: 6000 }));
}

/**
 * Comments on a post. `sent` once a new comment with this text appears
 * (counted before and after, so an earlier identical comment can't pass).
 */
export async function comment(nav: Nav, url: string, text: string): Promise<WriteResult> {
  const post = await openPost(nav, url);
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
    // Comments sit under the post in <main>; count their own texts (replies and editors excluded).
    const area = nav.page.locator("main");
    const before = await readOwnTexts(area, EXTRACT.comment.container).catch(() => [] as string[]);
    let editor = await findOptional(post, SEL.post.commentEditor, { timeout: 2500 });
    if (!editor) {
      const button = await find(post, SEL.post.commentButton, { timeout: 6000 });
      await button.click();
      await nav.pacer.beat();
      editor = await find(post, SEL.post.commentEditor, { timeout: 6000 });
    }
    await typeInto(nav, editor, text);
    const submit = await submitButton(editor, post);
    attempt.commit("post comment");
    await submit.click();

    const shown = await pollUntil(async () => newMatchingItem(before, await readOwnTexts(area, EXTRACT.comment.container), text), 10_000);
    return shown ? sent() : unconfirmed("comment_not_shown", "no new comment with this text appeared under the post");
  });
}

/** Replies to a comment. `sent` once a new reply with this text appears under that comment. */
export async function reply(nav: Nav, url: string, commentId: string, text: string): Promise<WriteResult> {
  const post = await openPost(nav, url);
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
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
    const before = await readOwnTexts(target, EXTRACT.comment.container).catch(() => [] as string[]);
    const replyButton = await find(target, SEL.comment.replyButton, { timeout: 6000 });
    await replyButton.click();
    await nav.pacer.beat();
    const editor = await find(target, SEL.comment.replyEditor, { timeout: 6000 }).catch(async () => find(post, SEL.post.commentEditor, { timeout: 3000 }));
    // A reply box may pre-fill an @mention; type after it.
    await editor.click();
    await nav.page.keyboard.press("End");
    await typeInto(nav, editor, text);
    const submit = await submitButton(editor, target);
    attempt.commit("post reply");
    await submit.click();

    const shown = await pollUntil(async () => newMatchingItem(before, await readOwnTexts(target, EXTRACT.comment.container), text), 10_000);
    return shown ? sent() : unconfirmed("reply_not_shown", "no new reply with this text appeared under the comment");
  });
}

function cssString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** After deleting: the post no longer loads at its URL. */
async function postGone(nav: Nav, url: string): Promise<boolean> {
  const urn = activityUrn(url);
  await waitForNoDialog(nav.page, 5000);
  await nav.pacer.beat(1500, 2500);
  await nav.goto(postUrl(url));
  const found = await waitForAny(nav.page, EXTRACT.feedPost.container, 6000);
  if (!found) {
    // "This post cannot be displayed" has text; a blank page proves nothing.
    const text = (await nav.page.locator("main").first().innerText().catch(() => "")).trim();
    return text.length >= 40;
  }
  if (await nav.page.locator(`[data-urn=${cssString(urn)}], [data-id=${cssString(urn)}]`).count()) return false;
  // Redirected somewhere else (the feed) without our post: gone.
  return !nav.page.url().includes(urn.split(":").pop()!);
}

export async function deletePost(nav: Nav, url: string): Promise<WriteResult> {
  const post = await openPost(nav, url);
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
    const menu = await find(post, SEL.post.controlMenu, { timeout: 8000 });
    await menu.click();
    await nav.pacer.beat();
    const item = await find(nav.page, SEL.post.deleteItem, { timeout: 5000 }).catch(() => {
      throw new LinkedInMcpError("INVALID_INPUT", "This post has no Delete option. You can only delete your own posts.", "Check that the URL points to one of your posts.", { url });
    });
    await item.click();
    await nav.pacer.beat();
    const dialog = await waitForDialog(nav.page, 5000);
    const confirm = await find(dialog ?? nav.page, SEL.post.deleteConfirm, { timeout: 5000 });
    attempt.commit("confirm delete");
    await confirm.click();
    if (await postGone(nav, url)) return sent();
    return unconfirmed("post_still_shown", "the post still loads at its URL after deleting");
  });
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
