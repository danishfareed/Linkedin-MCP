import type { Config } from "../../config.js";
import { LinkedInMcpError, invalidInput } from "../../errors.js";
import { IMAGE_PROVIDERS, type ImageProviderId } from "../constants.js";
import type { ImageProvider } from "../types.js";
import { fal } from "./fal.js";
import { gemini } from "./gemini.js";
import { higgsfield } from "./higgsfield.js";
import { ideogram } from "./ideogram.js";
import { openai } from "./openai.js";
import { replicate } from "./replicate.js";

export const PROVIDERS: Record<ImageProviderId, ImageProvider> = { higgsfield, openai, gemini, fal, replicate, ideogram };

export type ImageSettings = Config["images"];

function envList(p: ImageProvider): string {
  return p.envSets.map((set) => set.join(" + ")).join(", or ");
}

/** How to set a provider up, in one sentence. */
export function setupHint(p: ImageProvider): string {
  return `Create a key at ${p.keysUrl}, then set ${envList(p)} in the env block of your MCP client's linkedin-mcp entry and restart the client.`;
}

export interface ProviderChoice {
  provider: ImageProvider;
  credentials: string;
  model: string;
  /** Why this provider: requested, configured, or the only/first one set up. */
  chosenBy: "request" | "config" | "only_configured" | "first_configured";
}

/**
 * Pick the provider: the one asked for, else LINKEDIN_MCP_IMAGE_PROVIDER /
 * images.provider, else the only (or first) one with credentials.
 */
export function chooseProvider(settings: ImageSettings, env: NodeJS.ProcessEnv, requested?: ImageProviderId, requestedModel?: string): ProviderChoice {
  const configured = IMAGE_PROVIDERS.filter((id) => PROVIDERS[id].credentials(env));
  let id: ImageProviderId;
  let chosenBy: ProviderChoice["chosenBy"];
  if (requested) {
    id = requested;
    chosenBy = "request";
  } else if (settings.provider) {
    id = settings.provider;
    chosenBy = "config";
  } else if (configured.length) {
    id = configured[0]!;
    chosenBy = configured.length === 1 ? "only_configured" : "first_configured";
  } else {
    throw new LinkedInMcpError(
      "INVALID_INPUT",
      "No AI image provider is set up, so generate_image can't run.",
      "Call image_providers for setup steps (each needs your own API key, which may cost money). create_quote_card and create_carousel work without one.",
    );
  }
  const provider = PROVIDERS[id];
  const credentials = provider.credentials(env);
  if (!credentials) {
    throw new LinkedInMcpError("INVALID_INPUT", `${provider.label} isn't set up: its API key isn't in the environment.`, setupHint(provider), {
      configured: configured.length ? configured : "none",
    });
  }
  // The general model setting applies to the configured provider, or to whichever is picked when none is configured.
  const general = !settings.provider || settings.provider === id ? settings.model : undefined;
  const model = requestedModel?.trim() || general || settings.models[id] || provider.defaultModel;
  if (!provider.validModel(model)) throw invalidInput(`"${model}" isn't a valid ${provider.label} model name.`, { default_model: provider.defaultModel });
  return { provider, credentials, model, chosenBy };
}

/** Status of every provider for image_providers. Never includes the keys. */
export function providerStatus(settings: ImageSettings, env: NodeJS.ProcessEnv) {
  let active: ImageProviderId | null = null;
  try {
    active = chooseProvider(settings, env).provider.id;
  } catch {
    active = null;
  }
  return IMAGE_PROVIDERS.map((id) => {
    const p = PROVIDERS[id];
    const configured = p.credentials(env) !== null;
    const general = !settings.provider || settings.provider === id ? settings.model : undefined;
    return {
      provider: id,
      name: p.label,
      configured,
      active: id === active,
      model: general || settings.models[id] || p.defaultModel,
      default_model: p.defaultModel,
      env: p.envSets,
      about: p.summary,
      setup: configured ? undefined : setupHint(p),
      docs: p.docsUrl,
    };
  });
}
