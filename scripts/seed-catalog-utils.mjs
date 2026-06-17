export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isShoutingAsciiLabel(value) {
  const letters = Array.from(String(value ?? "")).filter((char) => /[A-Za-z]/.test(char));
  return letters.length > 0 && letters.every((char) => char === char.toUpperCase());
}

function titleCaseAsciiLabel(value) {
  let nextUpper = true;
  return Array.from(value)
    .map((char) => {
      if (/[A-Za-z]/.test(char)) {
        const normalized = nextUpper ? char.toUpperCase() : char.toLowerCase();
        nextUpper = false;
        return normalized;
      }
      nextUpper = /[\s\-/_([{]/.test(char);
      return char;
    })
    .join("");
}

export function normalizeSeedColorName(value) {
  const trimmed = String(value ?? "").trim();
  return isShoutingAsciiLabel(trimmed) ? titleCaseAsciiLabel(trimmed) : trimmed;
}

export function normalizeHexColor(value) {
  const raw = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{3}$/.test(raw) || /^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw) || /^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function normalizeSwatchColorList(raw) {
  const colors = String(raw ?? "")
    .split(/[;,]/)
    .map((part) => normalizeHexColor(part.trim()))
    .filter(Boolean);
  return colors.length >= 2 ? colors : null;
}

export function isValidSwatch(value) {
  if (value == null) {
    return true;
  }
  const raw = String(value).trim();
  if (!raw) {
    return false;
  }
  if (normalizeHexColor(raw)) {
    return true;
  }
  const compositeMatch = raw.match(/^(multi|gradient)\((.*)\)$/i);
  if (compositeMatch) {
    return normalizeSwatchColorList(compositeMatch[2]) != null;
  }
  return normalizeSwatchColorList(raw) != null;
}

export function seedCatalogIdentityKey(entry) {
  return [entry.material, entry.filament_name, entry.color_name]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("\u001f");
}

function seedCatalogEntryRank(entry) {
  return [
    entry.is_discontinued ? 1 : 0,
    isShoutingAsciiLabel(entry.color_name) ? 1 : 0,
    entry.product_url ? 0 : 1,
    entry.id,
  ];
}

function compareSeedCatalogEntryRank(left, right) {
  const leftRank = seedCatalogEntryRank(left);
  const rightRank = seedCatalogEntryRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) {
      return -1;
    }
    if (leftRank[index] > rightRank[index]) {
      return 1;
    }
  }
  return 0;
}

export function dedupeSeedCatalogEntries(rawEntries) {
  const byIdentity = new Map();
  for (const entry of rawEntries) {
    const key = seedCatalogIdentityKey(entry);
    const existing = byIdentity.get(key);
    if (!existing || compareSeedCatalogEntryRank(entry, existing) < 0) {
      byIdentity.set(key, entry);
    }
  }
  return Array.from(byIdentity.values()).sort((left, right) =>
    [left.vendor, left.material, left.filament_name, left.color_name, left.id]
      .join("\u001f")
      .localeCompare(
        [right.vendor, right.material, right.filament_name, right.color_name, right.id].join(
          "\u001f",
        ),
      ),
  );
}
