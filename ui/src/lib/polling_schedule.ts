export function boundedPollingBackoffDelay({
  failureCount,
  initialDelayMs,
  maxDelayMs,
}: {
  failureCount: number;
  initialDelayMs: number;
  maxDelayMs: number;
}): number {
  const safeInitialDelay = Math.max(0, initialDelayMs);
  const safeMaxDelay = Math.max(safeInitialDelay, maxDelayMs);
  const safeFailureCount = Math.max(1, Math.floor(failureCount));
  const multiplier = 2 ** Math.min(safeFailureCount - 1, 30);

  return Math.min(safeInitialDelay * multiplier, safeMaxDelay);
}
