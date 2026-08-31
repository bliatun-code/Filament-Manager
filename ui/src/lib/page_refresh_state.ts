import { useCallback, useReducer } from "react";

export type ClientSnapshotSource = "UNRESOLVED" | "LIVE" | "CACHED" | "OFFLINE";
export type ResolvedClientSnapshotSource = Exclude<ClientSnapshotSource, "UNRESOLVED">;

export function isClientSnapshotFallback(source: ClientSnapshotSource): boolean {
  return source === "CACHED" || source === "OFFLINE";
}

export function shouldShowClientSnapshotWarning({
  clientReadOnly,
  initialLoadSettled,
  source,
}: {
  clientReadOnly: boolean;
  initialLoadSettled: boolean;
  source: ClientSnapshotSource;
}): boolean {
  return clientReadOnly && initialLoadSettled && isClientSnapshotFallback(source);
}

export type ClientPageFeedbackState = {
  clientDataWarningVisible: boolean;
  clientHostWarningVisible: boolean;
  clientPartialWarningVisible: boolean;
  loadErrorVisible: boolean;
};

export function resolveClientPageFeedbackState({
  clientReadOnly,
  hasLoadError,
  initialLoadSettled,
  partial,
  requestPending,
  source,
}: {
  clientReadOnly: boolean;
  hasLoadError: boolean;
  initialLoadSettled: boolean;
  partial: boolean;
  requestPending: boolean;
  source: ClientSnapshotSource;
}): ClientPageFeedbackState {
  const clientHostWarningVisible = shouldShowClientSnapshotWarning({
    clientReadOnly,
    initialLoadSettled,
    source,
  });
  const clientPartialWarningVisible =
    clientReadOnly && initialLoadSettled && partial;
  const clientDataWarningVisible =
    clientHostWarningVisible || clientPartialWarningVisible;

  return {
    clientDataWarningVisible,
    clientHostWarningVisible,
    clientPartialWarningVisible,
    // A resolved Host/cache state is more useful than the generic request
    // failure that may have occurred while composing the same snapshot.
    loadErrorVisible: hasLoadError && !requestPending && !clientDataWarningVisible,
  };
}

export function isClientCompositeSnapshotPartial({
  primarySource,
  secondarySources,
}: {
  primarySource: ClientSnapshotSource;
  secondarySources: readonly ResolvedClientSnapshotSource[];
}): boolean {
  if (primarySource === "LIVE") {
    return secondarySources.some((source) => source !== "LIVE");
  }
  if (primarySource === "CACHED") {
    return secondarySources.some((source) => source === "OFFLINE");
  }
  return false;
}

export type PageRefreshState = {
  error: string | null;
  hasSuccessfulData: boolean;
  loading: boolean;
  refreshing: boolean;
};

type PageRefreshAction =
  | { type: "begin" }
  | { type: "failure"; error: string }
  | { type: "success" };

export function createPageRefreshState(
  enabled: boolean,
  hasSuccessfulData = false,
): PageRefreshState {
  return {
    error: null,
    hasSuccessfulData,
    loading: enabled && !hasSuccessfulData,
    refreshing: false,
  };
}

export function reducePageRefreshState(
  state: PageRefreshState,
  action: PageRefreshAction,
): PageRefreshState {
  switch (action.type) {
    case "begin":
      return {
        ...state,
        loading: !state.hasSuccessfulData,
        refreshing: true,
      };
    case "failure":
      return {
        ...state,
        error: action.error,
        loading: false,
        refreshing: false,
      };
    case "success":
      return {
        error: null,
        hasSuccessfulData: true,
        loading: false,
        refreshing: false,
      };
  }
}

export function usePageRefreshState(
  enabled: boolean,
  initialHasSuccessfulData = false,
) {
  const [state, dispatch] = useReducer(
    reducePageRefreshState,
    undefined,
    () => createPageRefreshState(enabled, initialHasSuccessfulData),
  );
  const beginRefresh = useCallback(() => dispatch({ type: "begin" }), []);
  const failRefresh = useCallback(
    (error: string) => dispatch({ type: "failure", error }),
    [],
  );
  const completeRefresh = useCallback(() => dispatch({ type: "success" }), []);

  return {
    ...state,
    beginRefresh,
    completeRefresh,
    failRefresh,
  };
}
