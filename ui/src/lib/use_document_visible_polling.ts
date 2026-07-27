import { useCallback, useEffect, useRef } from "react";

import { boundedPollingBackoffDelay } from "./polling_schedule";

type PollResult = boolean | void;

type UseDocumentVisiblePollingInput = {
  enabled: boolean;
  failureInitialDelayMs?: number;
  failureMaxDelayMs?: number;
  intervalMs: number;
  poll: () => PollResult | Promise<PollResult>;
  runImmediately?: boolean;
};

function documentAllowsPolling(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function useDocumentVisiblePolling({
  enabled,
  failureInitialDelayMs = 1_000,
  failureMaxDelayMs = 30_000,
  intervalMs,
  poll,
  runImmediately = false,
}: UseDocumentVisiblePollingInput): () => void {
  const pollRef = useRef(poll);
  const triggerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) {
      triggerRef.current = () => undefined;
      return;
    }

    let cancelled = false;
    let consecutiveFailures = 0;
    let polling = false;
    let rerunRequested = false;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (cancelled || !documentAllowsPolling()) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        void runPoll();
      }, Math.max(0, delayMs));
    };

    const runPoll = async () => {
      if (cancelled || !documentAllowsPolling()) {
        return;
      }
      if (polling) {
        rerunRequested = true;
        return;
      }

      clearTimer();
      polling = true;
      let succeeded = false;
      try {
        succeeded = (await pollRef.current()) !== false;
      } catch (pollError) {
        console.error(pollError);
      } finally {
        polling = false;
      }

      if (cancelled || !documentAllowsPolling()) {
        return;
      }
      if (rerunRequested) {
        rerunRequested = false;
        schedule(0);
        return;
      }

      if (succeeded) {
        consecutiveFailures = 0;
        schedule(intervalMs);
        return;
      }

      consecutiveFailures += 1;
      schedule(
        boundedPollingBackoffDelay({
          failureCount: consecutiveFailures,
          initialDelayMs: failureInitialDelayMs,
          maxDelayMs: failureMaxDelayMs,
        }),
      );
    };

    const trigger = () => {
      if (!documentAllowsPolling()) {
        return;
      }
      clearTimer();
      void runPoll();
    };
    triggerRef.current = trigger;

    const handleVisibilityChange = () => {
      if (!documentAllowsPolling()) {
        clearTimer();
        return;
      }
      consecutiveFailures = 0;
      trigger();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (documentAllowsPolling()) {
      if (runImmediately) {
        trigger();
      } else {
        schedule(intervalMs);
      }
    }

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (triggerRef.current === trigger) {
        triggerRef.current = () => undefined;
      }
    };
  }, [
    enabled,
    failureInitialDelayMs,
    failureMaxDelayMs,
    intervalMs,
    runImmediately,
  ]);

  return useCallback(() => {
    triggerRef.current();
  }, []);
}
