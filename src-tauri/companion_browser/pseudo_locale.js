import { formatMessageWithLiteralTransform } from "./message_format.js";

const ACCENTED_ASCII = Object.freeze({
  A: "Å", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î",
  J: "Ĵ", K: "Ķ", L: "Ŀ", M: "Ṁ", N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ",
  S: "Ş", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
  a: "å", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î",
  j: "ĵ", k: "ķ", l: "ŀ", m: "ṁ", n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ",
  s: "ş", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
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

export function pseudoLocalizeMessage(template, params = {}) {
  return `⟦${formatMessageWithLiteralTransform(
    template,
    params,
    "en-US",
    pseudoLocalizeLiteral,
  )}⟧`;
}
