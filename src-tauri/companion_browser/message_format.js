import {
  formatLocaleDateTime,
  formatLocaleNumber,
  localePluralCategory,
} from "./locale_format.js";

function matchingBraceIndex(source, startIndex) {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitTopLevel(source, separator = ",", limit = Number.POSITIVE_INFINITY) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length && parts.length < limit - 1; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
    } else if (source[index] === separator && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function parseMessageOptions(source) {
  const options = {};
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\s,]/.test(source[index])) {
      index += 1;
    }
    const keyStart = index;
    while (index < source.length && !/[\s{]/.test(source[index])) {
      index += 1;
    }
    const key = source.slice(keyStart, index);
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }
    if (!key || source[index] !== "{") {
      break;
    }
    const end = matchingBraceIndex(source, index);
    if (end < 0) {
      break;
    }
    options[key] = source.slice(index + 1, end);
    index = end + 1;
  }
  return options;
}

function formatArgument(content, params, locale, transformLiteral) {
  const [name, type = "", style = ""] = splitTopLevel(content, ",", 3);
  const value = params[name];
  if (!type) {
    return value == null ? "" : String(value);
  }
  if (type === "number") {
    return value == null ? "" : formatLocaleNumber(value, locale);
  }
  if (type === "date" || type === "time") {
    if (value == null) {
      return "";
    }
    const options =
      type === "date"
        ? { year: "numeric", month: "short", day: "numeric" }
        : { hour: "2-digit", minute: "2-digit" };
    return formatLocaleDateTime(value, locale, options);
  }
  if (type === "select") {
    const options = parseMessageOptions(style);
    return formatFragment(
      options[String(value)] ?? options.other ?? "",
      params,
      locale,
      transformLiteral,
    );
  }
  if (type === "plural" || type === "selectordinal") {
    const numericValue = Number(value);
    const offsetMatch = style.match(/^offset:\s*(\d+)\s*/);
    const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
    const pluralValue = numericValue - offset;
    const options = parseMessageOptions(style.slice(offsetMatch?.[0].length ?? 0));
    const exactKey = Number.isFinite(numericValue) ? `=${numericValue}` : "";
    const category = Number.isFinite(numericValue)
      ? localePluralCategory(
          pluralValue,
          locale,
          type === "selectordinal" ? "ordinal" : "cardinal",
        )
      : "other";
    const selected = options[exactKey] ?? options[category] ?? options.other ?? "";
    return formatFragment(
      selected.replaceAll("#", formatLocaleNumber(pluralValue, locale)),
      params,
      locale,
      transformLiteral,
    );
  }
  return value == null ? "" : String(value);
}

function formatFragment(template, params, locale, transformLiteral = (value) => value) {
  let output = "";
  let cursor = 0;
  while (cursor < template.length) {
    const open = template.indexOf("{", cursor);
    if (open < 0) {
      output += transformLiteral(template.slice(cursor));
      break;
    }
    output += transformLiteral(template.slice(cursor, open));
    const close = matchingBraceIndex(template, open);
    if (close < 0) {
      output += transformLiteral(template.slice(open));
      break;
    }
    output += formatArgument(
      template.slice(open + 1, close),
      params,
      locale,
      transformLiteral,
    );
    cursor = close + 1;
  }
  return output;
}

export function formatMessage(template, params = {}, locale = "en") {
  return formatFragment(String(template ?? ""), params, locale);
}

export function formatMessageWithLiteralTransform(
  template,
  params = {},
  locale = "en",
  transformLiteral = (value) => value,
) {
  return formatFragment(String(template ?? ""), params, locale, transformLiteral);
}
