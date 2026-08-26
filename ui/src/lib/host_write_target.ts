export type ClientHostTargetInput = {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
};

export type ClientHostWriteTarget = {
  baseUrl: string;
  libraryId: string;
};

export type ClientHostCacheTarget = ClientHostWriteTarget & {
  targetGeneration: number;
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

export function resolveClientHostCacheTarget(
  target: ClientHostTargetInput,
): ClientHostCacheTarget | null {
  const hostTarget = resolveClientHostTarget(target);
  const targetGeneration = target.clientTargetGeneration;
  if (
    !hostTarget ||
    !Number.isSafeInteger(targetGeneration) ||
    (targetGeneration ?? -1) < 0
  ) {
    return null;
  }

  return { ...hostTarget, targetGeneration: targetGeneration! };
}
