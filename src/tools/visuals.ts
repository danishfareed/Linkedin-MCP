import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { invalidInput } from "../errors.js";
import { ASPECT_RATIOS, FONT_KEYS, HEX_COLOR, IMAGE_PROVIDERS, THEME_NAMES } from "../visuals/constants.js";
import { type GenerateDeps, type GenerateResult, ImageJobs, defaultGenerateDeps, generateImages } from "../visuals/generate.js";
import { listMedia } from "../visuals/media.js";
import { providerStatus } from "../visuals/providers/index.js";
import { type RenderEnv, createCarousel, createQuoteCard } from "../visuals/render/index.js";
import { THEMES } from "../visuals/render/themes.js";
import { defineTool } from "./registry.js";

/**
 * Visuals for posts: AI images from the user's own provider, branded quote
 * cards and carousels rendered locally, and the media folder they land in.
 * None of these tools send anything to LinkedIn; the assistant attaches the
 * files to create_post / schedule_post, whose preview the user approves.
 */

/** Contacts an outside service (the image provider) and may cost money; creates new files each time. */
const GENERATE: Omit<ToolAnnotations, "title"> = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
/** Writes new files locally; nothing leaves the machine except font requests to Google Fonts. */
const RENDER: Omit<ToolAnnotations, "title"> = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const LOCAL_READ: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const hex = z.string().regex(HEX_COLOR, "Use a hex color like #1D3FD8");

const brandInput = z
  .object({
    primary_color: hex.optional().describe("Main brand color: background of quote cards and the first and last carousel slides."),
    accent_color: hex.optional().describe("Highlight color: quote marks, numbers, bullets, progress bar."),
    font: z.enum(FONT_KEYS).optional().describe("Font for headings and text. Web fonts load from Google Fonts with a system fallback."),
    logo_path: z.string().min(1).optional().describe("Absolute path to a PNG/JPEG/WebP logo, shown small in a corner."),
  })
  .optional()
  .describe("Overrides for this image only. Defaults come from brand settings in config.json.");

const authorInput = z
  .object({
    name: z.string().max(80).optional().describe("Shown under the text. Defaults to the brand name, then the signed-in LinkedIn name. Empty string hides it."),
    handle: z.string().max(80).optional().describe("A second line such as a title or @handle. Empty string hides it."),
    headshot_path: z.string().optional().describe("Absolute path to a square-ish PNG/JPEG headshot, shown in a circle."),
  })
  .optional();

const themeInput = z
  .enum(THEME_NAMES)
  .optional()
  .describe(`Look: ${THEME_NAMES.map((t) => `${t} (${THEMES[t].description.split(".")[0]!.toLowerCase()})`).join("; ")}. Defaults to the brand theme, else midnight.`);

const ATTACH_IMAGES =
  "To post, pass the paths in create_post or schedule_post as images (up to 9 per post). Show the image to the user first if your client can; nothing is posted until they approve the post preview.";

export interface VisualDeps {
  /** Fresh dependencies for each generation (fetch, env, clock, DNS). */
  generate: () => GenerateDeps;
  jobs: ImageJobs;
}

/** How long one call waits for a generation: just under the tool time budget, so MCP clients don't time out. */
function waitBudget(ctx: AppContext): number {
  return Math.max(1_000, ctx.config.toolTimeoutMs - 5_000);
}

async function renderEnv(ctx: AppContext): Promise<RenderEnv> {
  const account = await ctx.account.get().catch(() => null);
  return { config: ctx.config, now: ctx.clock(), timeoutMs: Math.max(15_000, ctx.config.toolTimeoutMs - 3_000), fallbackName: account?.name ?? undefined };
}

function generated(result: GenerateResult) {
  return {
    status: "done" as const,
    provider: result.provider_name,
    model: result.model,
    images: result.images,
    cost_usd: result.cost_usd,
    cost_note: result.cost_usd !== undefined ? (result.cost_kind === "quote" ? "Price quoted by the provider for this request." : "The provider's estimate for this request.") : undefined,
    notes: result.notes.length ? result.notes : undefined,
    attach: { images: result.images.map((i) => i.path) },
    note: ATTACH_IMAGES,
  };
}

function pending(jobId: string) {
  return {
    status: "pending" as const,
    job_id: jobId,
    note: "The provider is still working. Call generate_image again with only job_id to wait for it; the finished files also appear in list_media.",
  };
}

export function createVisualTools(deps: VisualDeps = { generate: defaultGenerateDeps, jobs: new ImageJobs() }) {
  return [
    defineTool({
      name: "generate_image",
      title: "Generate an image with AI",
      description:
        "Create photos or illustrations for a post with an AI image model (Higgsfield, OpenAI, Gemini, fal.ai, Replicate or Ideogram). " +
        "It uses the user's own API key for that provider and may cost money on their account, so generate only what the user asked for and say which provider was used. " +
        "Files are saved to linkedin-mcp's media folder and checked to be real PNG/JPEG images. Nothing is sent to LinkedIn. " +
        "Ideogram is best for legible text in images; for quotes and slides use create_quote_card or create_carousel instead (free, no AI). " +
        "Avoid depicting real people or brands without permission. Call image_providers to see which providers are set up. " +
        "If it returns status pending, call again with only job_id.",
      input: {
        prompt: z.string().min(1).max(4000).optional().describe("What to draw: subject, setting, composition, lighting, mood. Required unless job_id is given."),
        aspect_ratio: z.enum(ASPECT_RATIOS).default("1:1").describe("1:1 square, 4:5 portrait (most feed space), 16:9 landscape, 1.91:1 link-preview landscape. Providers without a ratio use the closest one and say so."),
        count: z.number().int().min(1).max(4).default(1).describe("How many images (1-4). Each one costs money."),
        style: z.string().max(300).optional().describe("Style direction, e.g. 'editorial photo, soft daylight' or 'flat vector illustration'."),
        negative_prompt: z.string().max(500).optional().describe("Things to avoid."),
        seed: z.number().int().min(0).max(2_147_483_647).optional().describe("For repeatable results, where the provider supports it."),
        provider: z.enum(IMAGE_PROVIDERS).optional().describe("Use this provider instead of the configured one."),
        model: z.string().min(1).max(100).optional().describe("Use this model id instead of the provider's default."),
        job_id: z.string().regex(/^img_[0-9a-f]{12}$/).optional().describe("From an earlier pending result: wait for that generation instead of starting a new one."),
      },
      annotations: GENERATE,
      handler: async (args, ctx) => {
        const budget = waitBudget(ctx);
        if (args.job_id) {
          const result = await deps.jobs.wait(args.job_id, budget);
          return result ? generated(result) : pending(args.job_id);
        }
        if (!args.prompt?.trim()) throw invalidInput("Give a prompt describing the image, or a job_id to wait for an earlier one.");
        const request = {
          prompt: args.prompt,
          aspectRatio: args.aspect_ratio,
          count: args.count,
          style: args.style,
          negativePrompt: args.negative_prompt,
          seed: args.seed,
          provider: args.provider,
          model: args.model,
        };
        const id = deps.jobs.start(() => generateImages(request, ctx.config.images, ctx.config.paths.mediaDir, deps.generate()));
        const result = await deps.jobs.wait(id, budget);
        return result ? generated(result) : pending(id);
      },
    }),

    defineTool({
      name: "create_quote_card",
      title: "Create a quote card image",
      description:
        "Render a branded quote card as a PNG (1080x1350 portrait by default, or 1080x1080 square) with the quote, author name, a second line such as a title or handle, and an optional headshot and logo. " +
        "Made locally in a separate headless browser: no AI, no account, no cost. Text shrinks to fit; warnings say when it's too long. Nothing is sent to LinkedIn. " +
        ATTACH_IMAGES,
      input: {
        quote: z.string().min(1).max(500).describe("The quote. Up to about 250 characters reads best."),
        author: authorInput,
        size: z.enum(["portrait", "square"]).default("portrait").describe("portrait is 1080x1350 (most feed space), square is 1080x1080."),
        theme: themeInput,
        brand: brandInput,
      },
      annotations: RENDER,
      handler: async (args, ctx) => {
        const card = await createQuoteCard({ quote: args.quote, author: args.author, size: args.size, theme: args.theme, brand: args.brand }, await renderEnv(ctx));
        return { ...card, warnings: card.warnings.length ? card.warnings : undefined, attach: { images: [card.path] }, note: ATTACH_IMAGES };
      },
    }),

    defineTool({
      name: "create_carousel",
      title: "Create a carousel (PDF)",
      description:
        "Render a swipeable LinkedIn carousel as a PDF: a title slide, 3 to 15 content slides (heading plus body text, bullets or a big number) and an end slide with a call to action, at 1080x1350 per page. " +
        "Also saves PNG previews of the first slides so you can show the user. Made locally in a separate headless browser: no AI, no account, no cost. " +
        "Text shrinks to fit each slide; warnings name any slide whose text is too long. Nothing is sent to LinkedIn. " +
        "To post it, pass document: {path, title} from the result to create_post or schedule_post, after showing the previews.",
      input: {
        title: z.string().min(1).max(140).describe("Title slide headline. Short and specific works best (under about 60 characters)."),
        subtitle: z.string().max(240).optional().describe("One line under the title."),
        kicker: z.string().max(40).optional().describe("Small label above the title, e.g. 'Founder notes'."),
        slides: z
          .array(
            z.object({
              heading: z.string().min(1).max(140).describe("Slide headline, ideally under 60 characters."),
              body: z.string().max(700).optional().describe("Supporting text; blank lines start new paragraphs. Under about 300 characters reads best."),
              bullets: z.array(z.string().min(1).max(160)).max(6).optional().describe("Up to 6 short bullet points."),
              big_number: z.string().max(12).optional().describe("A stat shown large above the heading, e.g. '62%' or '3x'."),
            }),
          )
          .min(3)
          .max(15)
          .describe("The content slides, in order."),
        cta: z
          .object({
            heading: z.string().max(120).optional().describe("End slide headline. Default: 'Found this useful?'"),
            body: z.string().max(240).optional(),
            button: z.string().max(40).optional().describe("Button text. Default: 'Follow <name>'."),
          })
          .optional(),
        author: authorInput,
        theme: themeInput,
        brand: brandInput,
        document_title: z.string().min(1).max(100).optional().describe("Title LinkedIn shows on the document. Defaults to the title."),
        preview_count: z.number().int().min(1).max(5).default(3).describe("How many PNG previews of the first slides to save."),
      },
      annotations: RENDER,
      handler: async (args, ctx) => {
        const deck = await createCarousel(
          {
            title: args.title,
            subtitle: args.subtitle,
            kicker: args.kicker,
            slides: args.slides,
            cta: args.cta,
            author: args.author,
            theme: args.theme,
            brand: args.brand,
            document_title: args.document_title,
            preview_count: args.preview_count,
          },
          await renderEnv(ctx),
        );
        return {
          ...deck,
          warnings: deck.warnings.length ? deck.warnings : undefined,
          note: "Show the previews to the user. To post, pass document (path and title) to create_post or schedule_post; the PDF appears as a swipeable carousel.",
        };
      },
    }),

    defineTool({
      name: "list_media",
      title: "List generated images and carousels",
      description:
        "Recent files in linkedin-mcp's media folder (generated images, quote cards, carousel PDFs and previews), newest first, with absolute paths ready for create_post's images or document. " +
        "complete is false when there are more files than the limit.",
      input: {
        limit: z.number().int().min(1).max(50).default(20),
        kind: z.enum(["image", "document"]).optional().describe("Only images (PNG/JPEG/GIF) or only documents (PDF)."),
      },
      annotations: LOCAL_READ,
      handler: async (args, ctx) => {
        const { files, total } = await listMedia(ctx.config.paths.mediaDir, args.limit, args.kind);
        return {
          folder: ctx.config.paths.mediaDir,
          files,
          total,
          complete: total <= args.limit,
          note: total > args.limit ? `Showing the newest ${args.limit} of ${total}. Raise limit to see more.` : undefined,
        };
      },
    }),

    defineTool({
      name: "image_providers",
      title: "Show AI image providers",
      description:
        "Which AI image providers are set up for generate_image, which one is used, their default models, and how to set each one up. " +
        "Keys are read from the MCP server's environment; this never shows them. create_quote_card and create_carousel need no provider.",
      input: {},
      annotations: LOCAL_READ,
      handler: async (_args, ctx) => {
        const providers = providerStatus(ctx.config.images, deps.generate().env);
        const active = providers.find((p) => p.active);
        return {
          active: active?.provider ?? "none",
          providers,
          choose:
            "Set LINKEDIN_MCP_IMAGE_PROVIDER (or images.provider in config.json) to pick one; otherwise the first configured provider is used. " +
            "Set LINKEDIN_MCP_IMAGE_MODEL or images.models.<provider> in config.json to change the model.",
          note: active
            ? `generate_image will use ${active.name} (${active.model}). Each image is billed to the user's own ${active.name} account.`
            : "No provider is set up. Each needs the user's own API key, and generating may cost money. Quote cards and carousels still work without one.",
        };
      },
    }),
  ];
}

export const visualTools = createVisualTools();
