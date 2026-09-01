import type { PackagedHostClientE2eScenarioError } from "./packaged_host_client_e2e_scenario";
import {
  failPackagedHostClientE2e,
  failPackagedHostClientE2eBootstrap,
  getPackagedHostClientE2eConfiguration,
  type PackagedHostClientE2eConfiguration,
  type PackagedHostClientE2eFailure,
} from "./tauri_packaged_host_client_e2e_client";
import { isTauri } from "./tauri_invoke";

type BootstrapDependencies = {
  isTauri: () => boolean;
  configuration: () => Promise<PackagedHostClientE2eConfiguration | null>;
  loadScenario: () => Promise<{
    runPackagedHostClientE2eScenario: (
      config: PackagedHostClientE2eConfiguration,
    ) => Promise<void>;
  }>;
  fail: (input: PackagedHostClientE2eFailure) => Promise<void>;
  failBootstrap: () => Promise<void>;
  reportBootstrapFailure: (message: string) => void;
};

const SAFE_BOOTSTRAP_FAILURE = "Packaged Host-Client E2E bootstrap failed.";
const SAFE_SCENARIO_FAILURE = "Packaged Host-Client E2E scenario failed.";

const defaultDependencies: BootstrapDependencies = {
  isTauri,
  configuration: getPackagedHostClientE2eConfiguration,
  loadScenario: () => import("./packaged_host_client_e2e_scenario"),
  fail: failPackagedHostClientE2e,
  failBootstrap: failPackagedHostClientE2eBootstrap,
  reportBootstrapFailure: (message) => {
    console.error(message);
  },
};

function safeScenarioFailure(
  error: unknown,
): Pick<PackagedHostClientE2eFailure, "step" | "message" | "failure_kind"> {
  const candidate = error as Partial<PackagedHostClientE2eScenarioError>;
  if (
    candidate?.name === "PackagedHostClientE2eScenarioError" &&
    typeof candidate.step === "string" &&
    candidate.step.trim() &&
    typeof candidate.message === "string" &&
    candidate.message.trim()
  ) {
    return {
      step: candidate.step,
      message: candidate.message,
      failure_kind:
        candidate.failureKind === "port-in-use" ? "port-in-use" : "scenario",
    };
  }
  return {
    step: "scenario",
    message: SAFE_SCENARIO_FAILURE,
    failure_kind: "scenario",
  };
}

export async function runPackagedHostClientE2eBootstrap(
  dependencies: BootstrapDependencies = defaultDependencies,
) {
  if (!dependencies.isTauri()) {
    return;
  }
  let config: PackagedHostClientE2eConfiguration | null;
  try {
    config = await dependencies.configuration();
  } catch {
    await dependencies.failBootstrap();
    return;
  }
  if (!config) {
    return;
  }
  try {
    const scenario = await dependencies.loadScenario();
    await scenario.runPackagedHostClientE2eScenario(config);
  } catch (error) {
    const failure = safeScenarioFailure(error);
    await dependencies.fail({
      role: config.role,
      phase: config.phase,
      run_id: config.run_id,
      step: failure.step,
      message: failure.message,
      failure_kind: failure.failure_kind,
    });
  }
}

export function startPackagedHostClientE2eBootstrap(
  dependencies: BootstrapDependencies = defaultDependencies,
) {
  void runPackagedHostClientE2eBootstrap(dependencies).catch(() => {
    dependencies.reportBootstrapFailure(SAFE_BOOTSTRAP_FAILURE);
  });
}
