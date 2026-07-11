import { formatMessageWithLiteralTransform } from "./message_format.js";
import { intlLocaleFor, pseudoModeFor } from "./supported_locales.js";

const ACCENTED_ASCII = Object.freeze({
  A: "Å", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î",
  J: "Ĵ", K: "Ķ", L: "Ŀ", M: "Ṁ", N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ",
  S: "Ş", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
  a: "å", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î",
  j: "ĵ", k: "ķ", l: "ŀ", m: "ṁ", n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ",
  s: "ş", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
});

const CJK_ASCII = Object.freeze({
  a: "安", b: "本", c: "冊", d: "的", e: "頁", f: "分", g: "個", h: "和", i: "已",
  j: "進", k: "可", l: "列", m: "名", n: "內", o: "項", p: "品", q: "全", r: "入",
  s: "設", t: "態", u: "用", v: "值", w: "為", x: "詳", y: "有", z: "中",
});

export function pseudoLocalizeLiteral(value) {
  let letterCount = 0;
  let output = "";
  for (const character of String(value ?? "")) {
    const accented = ACCENTED_ASCII[character];
    if (!accented) {
      output += character;
      continue;
    }
    letterCount += 1;
    output += accented;
    if (letterCount % 3 === 0) {
      output += "·";
    }
  }
  return output;
}

export function pseudoLocalizeMessage(template, params = {}, locale = "en-US") {
  return `⟦${formatMessageWithLiteralTransform(
    template,
    params,
    locale,
    pseudoLocalizeLiteral,
  )}⟧`;
}

export function pseudoLocalizeRtlMessage(template, params = {}, locale = "ar") {
  const formatted = formatMessageWithLiteralTransform(
    template,
    params,
    locale,
    pseudoLocalizeLiteral,
  );
  return `⟦\u2067${formatted}\u2069⟧`;
}

export function pseudoLocalizeCjkLiteral(value) {
  return Array.from(String(value ?? ""), (character) => {
    const replacement = CJK_ASCII[character.toLowerCase()];
    return replacement ?? character;
  }).join("");
}

export function pseudoLocalizeCjkMessage(template, params = {}, locale = "zh-CN") {
  return `【${formatMessageWithLiteralTransform(
    template,
    params,
    locale,
    pseudoLocalizeCjkLiteral,
  )}】`;
}

export function pseudoLocalizeMessageForLocale(template, params = {}, locale = "en-XA") {
  const mode = pseudoModeFor(locale);
  if (mode === "rtl") {
    return pseudoLocalizeRtlMessage(template, params, intlLocaleFor(locale));
  }
  if (mode === "cjk") {
    return pseudoLocalizeCjkMessage(template, params, intlLocaleFor(locale));
  }
  return pseudoLocalizeMessage(template, params, intlLocaleFor(locale));
}
