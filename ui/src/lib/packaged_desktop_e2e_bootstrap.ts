import { isTauri } from "./tauri_invoke";
import type { PackagedDesktopE2eScenarioError } from "./packaged_desktop_e2e_scenario";
import {
  failPackagedDesktopE2e,
  getPackagedDesktopE2eConfiguration,
  type PackagedDesktopE2eConfiguration,
  type PackagedDesktopE2eFailure,
} from "./tauri_packaged_desktop_e2e_client";

type BootstrapDependencies = {
  isTauri: () => boolean;
  configuration: () => Promise<PackagedDesktopE2eConfiguration | null>;
  loadScenario: () => Promise<{
    runPackagedDesktopE2eScenario: (
      config: PackagedDesktopE2eConfiguration,
    ) => Promise<void>;
  }>;
  fail: (input: PackagedDesktopE2eFailure) => Promise<void>;
  reportBootstrapFailure: (message: string) => void;
};

const defaultDependencies: BootstrapDependencies = {
  isTauri,
  configuration: getPackagedDesktopE2eConfiguration,
  loadScenario: () => import("./packaged_desktop_e2e_scenario"),
  fail: failPackagedDesktopE2e,
  reportBootstrapFailure: (message) => {
    console.error(`Packaged desktop E2E bootstrap failed: ${message}`);
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorStep(error: unknown) {
  const candidate = error as Partial<PackagedDesktopE2eScenarioError>;
  return typeof candidate?.step === "string" && candidate.step.trim()
    ? candidate.step
    : "scenario";
}

export async function runPackagedDesktopE2eBootstrap(
  dependencies: BootstrapDependencies = defaultDependencies,
) {
  if (!dependencies.isTauri()) {
    return;
  }
  const config = await dependencies.configuration();
  if (!config) {
    return;
  }
  try {
    const scenario = await dependencies.loadScenario();
    await scenario.runPackagedDesktopE2eScenario(config);
  } catch (error) {
    await dependencies.fail({
      phase: config.phase,
      run_id: config.run_id,
      step: errorStep(error),
      message: errorMessage(error),
    });
  }
}

export function startPackagedDesktopE2eBootstrap(
  dependencies: BootstrapDependencies = defaultDependencies,
) {
  void runPackagedDesktopE2eBootstrap(dependencies).catch((error) => {
    dependencies.reportBootstrapFailure(errorMessage(error));
  });
}
