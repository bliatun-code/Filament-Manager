import assert from "node:assert/strict";
import test from "node:test";

import {
  LIBRARY_REVISION_DOMAINS,
  createLibraryRevisionTracker,
  fetchLibraryDomainRevisionsForSource,
  haveRelevantLibraryRevisionsChanged,
  libraryRevisionSourceKey,
  markLibraryRevisionUnavailable,
  observeLibraryDomainRevisions,
  resolveLibraryRevisionSource,
} from "./library_domain_revisions";
import type { LibraryDomainRevisions } from "./tauri_library_sync_client";

function revisions(overrides: Partial<LibraryDomainRevisions> = {}): LibraryDomainRevisions {
  return {
    inventory: 1,
    catalog: 2,
    loans: 3,
    printers: 4,
    jobs: 5,
    wishlist: 6,
    ...overrides,
  };
}

test("revision source resolution selects local, normalized host, or null", () => {
  assert.deepEqual(
    resolveLibraryRevisionSource({
      clientReadOnly: false,
      clientHostBaseUrl: "http://ignored",
      clientLibraryId: "ignored",
    }),
    { kind: "local" },
  );
  assert.deepEqual(
    resolveLibraryRevisionSource({
      clientReadOnly: true,
      clientHostBaseUrl: "  http://host.local:4278/// ",
      clientLibraryId: " library-1 ",
    }),
    {
      kind: "host",
      baseUrl: "http://host.local:4278",
      libraryId: "library-1",
    },
  );
  assert.equal(
    resolveLibraryRevisionSource({
      clientReadOnly: true,
      clientHostBaseUrl: "http://host.local:4278",
      clientLibraryId: " ",
    }),
    null,
  );
});

test("revision source keys are stable across insignificant host formatting", () => {
  const first = resolveLibraryRevisionSource({
    clientReadOnly: true,
    clientHostBaseUrl: "http://host.local:4278/",
    clientLibraryId: "library-1",
  });
  const second = resolveLibraryRevisionSource({
    clientReadOnly: true,
    clientHostBaseUrl: " http://host.local:4278/// ",
    clientLibraryId: " library-1 ",
  });

  assert.equal(libraryRevisionSourceKey(first), libraryRevisionSourceKey(second));
  assert.equal(libraryRevisionSourceKey({ kind: "local" }), "local");
  assert.equal(libraryRevisionSourceKey(null), null);
});

test("revision comparison considers only relevant domains", () => {
  const previous = revisions();

  assert.equal(
    haveRelevantLibraryRevisionsChanged(previous, revisions({ wishlist: 7 }), [
      LIBRARY_REVISION_DOMAINS.inventory,
      LIBRARY_REVISION_DOMAINS.printers,
    ]),
    false,
  );
  assert.equal(
    haveRelevantLibraryRevisionsChanged(previous, revisions({ printers: 8 }), [
      LIBRARY_REVISION_DOMAINS.inventory,
      LIBRARY_REVISION_DOMAINS.printers,
    ]),
    true,
  );
});

test("revision fetching routes local, host, and unavailable sources", async () => {
  const calls: string[] = [];
  const local = revisions({ inventory: 10 });
  const host = revisions({ inventory: 20 });
  const dependencies = {
    fetchLocal: async () => {
      calls.push("local");
      return local;
    },
    fetchHost: async (baseUrl: string, libraryId?: string | null) => {
      calls.push(`host:${baseUrl}:${libraryId}`);
      return host;
    },
  };

  assert.deepEqual(
    await fetchLibraryDomainRevisionsForSource({ kind: "local" }, dependencies),
    local,
  );
  assert.deepEqual(
    await fetchLibraryDomainRevisionsForSource(
      { kind: "host", baseUrl: "http://host", libraryId: "library-1" },
      dependencies,
    ),
    host,
  );
  assert.equal(await fetchLibraryDomainRevisionsForSource(null, dependencies), null);
  assert.deepEqual(calls, ["local", "host:http://host:library-1"]);
});

test("revision tracker reloads for baseline, source, and relevant-domain changes", () => {
  const local = { kind: "local" } as const;
  const initial = observeLibraryDomainRevisions(
    createLibraryRevisionTracker(),
    local,
    revisions(),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(initial.shouldReload, true);
  assert.equal(initial.sourceChanged, true);

  const unchanged = observeLibraryDomainRevisions(
    initial.tracker,
    local,
    revisions({ wishlist: 99 }),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(unchanged.shouldReload, false);
  assert.equal(unchanged.revisionsChanged, false);

  const changed = observeLibraryDomainRevisions(
    unchanged.tracker,
    local,
    revisions({ inventory: 2, wishlist: 100 }),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(changed.shouldReload, true);
  assert.equal(changed.revisionsChanged, true);

  const restoredToLowerRevision = observeLibraryDomainRevisions(
    changed.tracker,
    local,
    revisions({ inventory: 0 }),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(restoredToLowerRevision.shouldReload, true);
  assert.equal(restoredToLowerRevision.revisionsChanged, true);

  const switched = observeLibraryDomainRevisions(
    restoredToLowerRevision.tracker,
    { kind: "host", baseUrl: "http://host", libraryId: "library-1" },
    revisions({ inventory: 2 }),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(switched.shouldReload, true);
  assert.equal(switched.sourceChanged, true);
  assert.equal(switched.revisionsChanged, false);
});

test("revision tracker preserves a same-source baseline and reloads once after recovery", () => {
  const source = { kind: "local" } as const;
  const ready = observeLibraryDomainRevisions(
    createLibraryRevisionTracker(),
    source,
    revisions(),
    [LIBRARY_REVISION_DOMAINS.inventory],
  ).tracker;
  const unavailable = markLibraryRevisionUnavailable(ready, source);

  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(unavailable.revisions, revisions());

  const recovered = observeLibraryDomainRevisions(
    unavailable,
    source,
    revisions(),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(recovered.shouldReload, true);
  assert.equal(recovered.wasUnavailable, true);

  const stable = observeLibraryDomainRevisions(
    recovered.tracker,
    source,
    revisions(),
    [LIBRARY_REVISION_DOMAINS.inventory],
  );
  assert.equal(stable.shouldReload, false);
  assert.equal(stable.wasUnavailable, false);
});

test("revision tracker discards a baseline when its source becomes unavailable", () => {
  const ready = observeLibraryDomainRevisions(
    createLibraryRevisionTracker(),
    { kind: "local" },
    revisions(),
    [LIBRARY_REVISION_DOMAINS.inventory],
  ).tracker;
  const unavailable = markLibraryRevisionUnavailable(ready, null);

  assert.deepEqual(unavailable, {
    sourceKey: null,
    revisions: null,
    status: "unavailable",
  });
});
