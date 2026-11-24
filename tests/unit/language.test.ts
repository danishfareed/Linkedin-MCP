import { describe, expect, it } from "vitest";
import { baseLanguage, checkLanguage, languageName, unsupportedLanguage } from "../../src/linkedin/language.js";

describe("language gate", () => {
  it("reads the base language from <html lang>", () => {
    expect(baseLanguage("en-US")).toBe("en");
    expect(baseLanguage("en_GB")).toBe("en");
    expect(baseLanguage("EN")).toBe("en");
    expect(baseLanguage("pt-BR")).toBe("pt");
    expect(baseLanguage("zh-Hans-CN")).toBe("zh");
    expect(baseLanguage("")).toBeNull();
    expect(baseLanguage(null)).toBeNull();
    expect(baseLanguage("x")).toBeNull();
  });

  it("allows English and unknown, blocks everything else", () => {
    expect(checkLanguage("en")).toEqual({ ok: true, lang: "en" });
    expect(checkLanguage("en-US").ok).toBe(true);
    expect(checkLanguage("").ok).toBe(true);
    expect(checkLanguage(undefined).ok).toBe(true);
    expect(checkLanguage("de")).toEqual({ ok: false, lang: "de" });
    expect(checkLanguage("fr-FR")).toEqual({ ok: false, lang: "fr-FR" });
  });

  it("explains how to switch LinkedIn to English", () => {
    expect(languageName("de")).toBe("German");
    expect(languageName("es-ES")).toBe("Spanish");
    const e = unsupportedLanguage("de");
    expect(e.code).toBe("UNSUPPORTED_LANGUAGE");
    expect(e.message).toMatch(/German/);
    expect(e.message).toMatch(/nothing was clicked or sent/);
    expect(e.nextStep).toMatch(/Settings → Account preferences → Display language/);
    expect(e.nextStep).toMatch(/Reading tools keep working/);
  });
});
