export type ClientHostTargetInput = {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

export type ClientHostWriteTarget = {
  baseUrl: string;
  libraryId: string;
};

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function requireClientHostWriteTarget(
  target: ClientHostTargetInput,
  errorMessage: string,
): ClientHostWriteTarget {
  const resolvedTarget = resolveClientHostTarget(target);

  if (!resolvedTarget) {
    throw new Error(errorMessage);
  }

  return resolvedTarget;
}

export function resolveClientHostTarget(
  target: ClientHostTargetInput,
): ClientHostWriteTarget | null {
  const baseUrl = normalizedText(target.clientHostBaseUrl);
  const libraryId = normalizedText(target.clientLibraryId);

  if (!baseUrl || !libraryId) {
    return null;
  }

  return { baseUrl, libraryId };
}
