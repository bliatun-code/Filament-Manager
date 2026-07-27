import {
  fetchLibrarySyncDomainRevisions,
  getLibraryDomainRevisions,
  type LibraryDomainRevisions,
} from "./tauri_library_sync_client";

export const LIBRARY_REVISION_DOMAINS = {
  inventory: "inventory",
  catalog: "catalog",
  loans: "loans",
  printers: "printers",
  jobs: "jobs",
  wishlist: "wishlist",
} as const;

export type LibraryRevisionDomain =
  (typeof LIBRARY_REVISION_DOMAINS)[keyof typeof LIBRARY_REVISION_DOMAINS];

export type LibraryRevisionSource =
  | { kind: "local" }
  | {
      kind: "host";
      baseUrl: string;
      libraryId: string;
    };

export type LibraryRevisionSourceInput = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

export type LibraryRevisionTrackerStatus = "idle" | "ready" | "unavailable";

export type LibraryRevisionTracker = {
  sourceKey: string | null;
  revisions: LibraryDomainRevisions | null;
  status: LibraryRevisionTrackerStatus;
};

export type LibraryRevisionObservation = {
  tracker: LibraryRevisionTracker;
  shouldReload: boolean;
  sourceChanged: boolean;
  revisionsChanged: boolean;
  wasUnavailable: boolean;
};

export type LibraryRevisionFetchDependencies = {
  fetchLocal?: typeof getLibraryDomainRevisions;
  fetchHost?: typeof fetchLibrarySyncDomainRevisions;
};

function normalizedText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedHostBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveLibraryRevisionSource({
  clientReadOnly,
  clientHostBaseUrl,
  clientLibraryId,
}: LibraryRevisionSourceInput): LibraryRevisionSource | null {
  if (!clientReadOnly) {
    return { kind: "local" };
  }

  const baseUrl = normalizedText(clientHostBaseUrl);
  const libraryId = normalizedText(clientLibraryId);
  if (!baseUrl || !libraryId) {
    return null;
  }

  return {
    kind: "host",
    baseUrl: normalizedHostBaseUrl(baseUrl),
    libraryId,
  };
}

export function libraryRevisionSourceKey(source: LibraryRevisionSource | null): string | null {
  if (!source) {
    return null;
  }
  if (source.kind === "local") {
    return "local";
  }

  return JSON.stringify([
    "host",
    normalizedHostBaseUrl(source.baseUrl.trim()),
    source.libraryId.trim(),
  ]);
}

export function haveRelevantLibraryRevisionsChanged(
  previous: LibraryDomainRevisions,
  current: LibraryDomainRevisions,
  relevantDomains: readonly LibraryRevisionDomain[],
): boolean {
  return relevantDomains.some((domain) => previous[domain] !== current[domain]);
}

export async function fetchLibraryDomainRevisionsForSource(
  source: LibraryRevisionSource | null,
  dependencies: LibraryRevisionFetchDependencies = {},
): Promise<LibraryDomainRevisions | null> {
  if (!source) {
    return null;
  }

  if (source.kind === "local") {
    return (dependencies.fetchLocal ?? getLibraryDomainRevisions)();
  }

  return (dependencies.fetchHost ?? fetchLibrarySyncDomainRevisions)(
    source.baseUrl,
    source.libraryId,
  );
}

export function createLibraryRevisionTracker(): LibraryRevisionTracker {
  return {
    sourceKey: null,
    revisions: null,
    status: "idle",
  };
}

export function observeLibraryDomainRevisions(
  tracker: LibraryRevisionTracker,
  source: LibraryRevisionSource,
  revisions: LibraryDomainRevisions,
  relevantDomains: readonly LibraryRevisionDomain[],
): LibraryRevisionObservation {
  const sourceKey = libraryRevisionSourceKey(source);
  const sourceChanged = tracker.sourceKey !== sourceKey;
  const hasComparableBaseline = !sourceChanged && tracker.revisions !== null;
  const revisionsChanged = hasComparableBaseline
    ? haveRelevantLibraryRevisionsChanged(tracker.revisions!, revisions, relevantDomains)
    : false;
  const wasUnavailable = !sourceChanged && tracker.status === "unavailable";

  return {
    tracker: {
      sourceKey,
      revisions,
      status: "ready",
    },
    shouldReload:
      sourceChanged || !hasComparableBaseline || revisionsChanged || wasUnavailable,
    sourceChanged,
    revisionsChanged,
    wasUnavailable,
  };
}

export function markLibraryRevisionUnavailable(
  tracker: LibraryRevisionTracker,
  source: LibraryRevisionSource | null,
): LibraryRevisionTracker {
  const sourceKey = libraryRevisionSourceKey(source);
  const sourceChanged = tracker.sourceKey !== sourceKey;

  return {
    sourceKey,
    revisions: sourceChanged ? null : tracker.revisions,
    status: "unavailable",
  };
}
