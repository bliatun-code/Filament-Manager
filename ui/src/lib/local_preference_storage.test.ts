import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOCAL_PREFERENCE_LENGTH,
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

class MemoryStorage implements LocalPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const key = "test-preference";
const fallback = { mode: "DEFAULT" };
const normalize = (value: unknown): { mode: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const mode = (value as { mode?: unknown }).mode;
  return typeof mode === "string" ? { mode } : null;
};

test("versioned local preferences round trip through injected storage", () => {
  const storage = new MemoryStorage();

  assert.equal(
    writeVersionedLocalPreference({ key, normalize, storage, value: { mode: "LIST" }, version: 1 }),
    true,
  );
  assert.deepEqual(
    readVersionedLocalPreference({ fallback, key, normalize, storage, version: 1 }),
    { mode: "LIST" },
  );
  assert.deepEqual(JSON.parse(storage.values.get(key) ?? "{}"), {
    value: { mode: "LIST" },
    version: 1,
  });
});

test("versioned local preferences safely reject malformed and unsupported records", () => {
  const storage = new MemoryStorage();
  const invalidValues = [
    "not-json",
    "null",
    "[]",
    JSON.stringify({ value: { mode: "LIST" }, version: 2 }),
    JSON.stringify({ value: { mode: 2 }, version: 1 }),
    JSON.stringify({ mode: "LIST", version: 1 }),
    "x".repeat(MAX_LOCAL_PREFERENCE_LENGTH + 1),
  ];

  for (const value of invalidValues) {
    storage.setItem(key, value);
    assert.deepEqual(
      readVersionedLocalPreference({ fallback, key, normalize, storage, version: 1 }),
      fallback,
    );
  }
});

test("versioned local preferences tolerate unavailable and throwing storage", () => {
  const throwingStorage: LocalPreferenceStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.deepEqual(
    readVersionedLocalPreference({ fallback, key, normalize, storage: null, version: 1 }),
    fallback,
  );
  assert.deepEqual(
    readVersionedLocalPreference({ fallback, key, normalize, storage: throwingStorage, version: 1 }),
    fallback,
  );
  assert.equal(
    writeVersionedLocalPreference({ key, normalize, storage: null, value: { mode: "LIST" }, version: 1 }),
    false,
  );
  assert.equal(
    writeVersionedLocalPreference({
      key,
      normalize,
      storage: throwingStorage,
      value: { mode: "LIST" },
      version: 1,
    }),
    false,
  );
});

test("reading an unsupported future version does not rewrite it", () => {
  const storage = new MemoryStorage();
  const futureValue = JSON.stringify({ value: { mode: "FUTURE" }, version: 2 });
  storage.setItem(key, futureValue);

  assert.deepEqual(
    readVersionedLocalPreference({ fallback, key, normalize, storage, version: 1 }),
    fallback,
  );
  assert.equal(storage.values.get(key), futureValue);
});
