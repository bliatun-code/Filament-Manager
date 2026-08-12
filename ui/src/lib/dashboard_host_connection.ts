export type DashboardHostConnectionTone = "off" | "live" | "warn";

export type DashboardHostConnectionObservation =
  | "checking"
  | "succeeded"
  | "failed"
  | "repair"
  | "unconfigured";

export type DashboardHostConnectionState = {
  consecutiveCoreFailures: number;
  tone: DashboardHostConnectionTone;
};

export const DASHBOARD_HOST_FAILURE_THRESHOLD = 2;

export function createDashboardHostConnectionState(
  tone: DashboardHostConnectionTone = "off",
): DashboardHostConnectionState {
  return {
    consecutiveCoreFailures:
      tone === "warn" ? DASHBOARD_HOST_FAILURE_THRESHOLD : 0,
    tone,
  };
}

export function observeDashboardHostConnection(
  state: DashboardHostConnectionState,
  observation: DashboardHostConnectionObservation,
): DashboardHostConnectionState {
  if (observation === "checking") {
    return state;
  }
  if (observation === "unconfigured") {
    return createDashboardHostConnectionState();
  }
  if (observation === "repair") {
    return {
      consecutiveCoreFailures: DASHBOARD_HOST_FAILURE_THRESHOLD,
      tone: "warn",
    };
  }
  if (observation === "succeeded") {
    return createDashboardHostConnectionState("live");
  }

  const consecutiveCoreFailures = state.consecutiveCoreFailures + 1;
  return {
    consecutiveCoreFailures,
    tone:
      consecutiveCoreFailures >= DASHBOARD_HOST_FAILURE_THRESHOLD
        ? "warn"
        : state.tone,
  };
}

export function isDashboardHostFailureInGrace(
  state: DashboardHostConnectionState,
  observation: DashboardHostConnectionObservation,
): boolean {
  return (
    observation === "failed" &&
    state.consecutiveCoreFailures < DASHBOARD_HOST_FAILURE_THRESHOLD
  );
}
