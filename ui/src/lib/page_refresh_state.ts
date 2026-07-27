import { useCallback, useReducer } from "react";

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
