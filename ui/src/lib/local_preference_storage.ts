export type LocalPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export const MAX_LOCAL_PREFERENCE_LENGTH = 16_384;

type VersionedLocalPreferenceEnvelope = {
  value: unknown;
  version: number;
};

type ReadVersionedLocalPreferenceInput<Value> = {
  fallback: Value;
  key: string;
  normalize: (value: unknown) => Value | null;
  storage?: LocalPreferenceStorage | null;
  version: number;
};

type WriteVersionedLocalPreferenceInput<Value> = {
  key: string;
  normalize: (value: unknown) => Value | null;
  storage?: LocalPreferenceStorage | null;
  value: Value;
  version: number;
};

function resolveLocalPreferenceStorage(
  storage: LocalPreferenceStorage | null | undefined,
): LocalPreferenceStorage | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

function isVersionedLocalPreferenceEnvelope(
  value: unknown,
): value is VersionedLocalPreferenceEnvelope {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readVersionedLocalPreference<Value>({
  fallback,
  key,
  normalize,
  storage,
  version,
}: ReadVersionedLocalPreferenceInput<Value>): Value {
  const resolvedStorage = resolveLocalPreferenceStorage(storage);
  if (!resolvedStorage) {
    return fallback;
  }
  try {
    const raw = resolvedStorage.getItem(key);
    if (!raw || raw.length > MAX_LOCAL_PREFERENCE_LENGTH) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedLocalPreferenceEnvelope(parsed) || parsed.version !== version) {
      return fallback;
    }
    return normalize(parsed.value) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeVersionedLocalPreference<Value>({
  key,
  normalize,
  storage,
  value,
  version,
}: WriteVersionedLocalPreferenceInput<Value>): boolean {
  const normalized = normalize(value);
  if (!normalized) {
    return false;
  }
  const resolvedStorage = resolveLocalPreferenceStorage(storage);
  if (!resolvedStorage) {
    return false;
  }
  try {
    resolvedStorage.setItem(
      key,
      JSON.stringify({
        value: normalized,
        version,
      } satisfies VersionedLocalPreferenceEnvelope),
    );
    return true;
  } catch {
    return false;
  }
}
