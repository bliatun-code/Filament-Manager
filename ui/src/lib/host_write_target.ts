export type ClientHostTargetInput = {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

export type ClientHostWriteTarget = {
  baseUrl: string;
  libraryId: string;
};

export type ClientHostBaseTarget = {
  baseUrl: string;
  libraryId: string | null;
};

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function requireClientHostWriteTarget(
  target: ClientHostTargetInput,
  errorMessage: string,
): ClientHostWriteTarget {
  const baseUrl = normalizedText(target.clientHostBaseUrl);
  const libraryId = normalizedText(target.clientLibraryId);

  if (!baseUrl || !libraryId) {
    throw new Error(errorMessage);
  }

  return { baseUrl, libraryId };
}

export function requireClientHostBaseTarget(
  target: ClientHostTargetInput,
  errorMessage: string,
): ClientHostBaseTarget {
  const baseUrl = normalizedText(target.clientHostBaseUrl);

  if (!baseUrl) {
    throw new Error(errorMessage);
  }

  return {
    baseUrl,
    libraryId: normalizedText(target.clientLibraryId),
  };
}
