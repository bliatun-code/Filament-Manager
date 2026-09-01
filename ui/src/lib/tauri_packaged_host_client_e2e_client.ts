import { invoke } from "./tauri_invoke";

export type PackagedHostClientE2eRole = "host" | "client";

export type PackagedHostClientE2ePhase =
  | "generation-1"
  | "generation-2"
  | "pair"
  | "offline"
  | "recover"
  | "cleanup";

export type PackagedHostClientE2eConfiguration = {
  role: PackagedHostClientE2eRole;
  phase: PackagedHostClientE2ePhase;
  run_id: string;
  listen_port: number;
  library_id: string;
  spool_id: string;
  host_initial_weight_g: number;
  paired_weight_g: number;
  recovered_weight_g: number;
  client_shadow_weight_g: number;
  base_url?: string | null;
  pairing_url?: string | null;
  target_generation?: number | null;
};

export type PackagedHostClientE2eHostWaitInput = {
  role: "host";
  phase: "generation-1" | "generation-2";
  run_id: string;
  library_id: string;
  base_url: string;
  pairing_url?: string | null;
};

export type PackagedHostClientE2eClientCompletion = {
  role: "client";
  phase: "pair" | "offline" | "recover";
  run_id: string;
  library_id: string;
  spool_id: string;
  local_weight_g: number;
  host_weight_g: number | null;
  cache_weight_g: number;
  target_generation: number;
  live_read_failed: boolean;
  live_write_failed: boolean;
  paired_before_cleanup: boolean;
  auth_cleared: boolean;
  session_renewed: boolean;
};

export type PackagedHostClientE2eCleanupCompletion = {
  role: "client";
  phase: "cleanup";
  run_id: string;
  auth_cleared: true;
};

export type PackagedHostClientE2eCompletion =
  | PackagedHostClientE2eClientCompletion
  | PackagedHostClientE2eCleanupCompletion;

export type PackagedHostClientE2eFailure = {
  role: PackagedHostClientE2eRole;
  phase: PackagedHostClientE2ePhase;
  run_id: string;
  step: string;
  message: string;
  failure_kind: "scenario" | "port-in-use";
};

export function getPackagedHostClientE2eConfiguration() {
  return invoke<PackagedHostClientE2eConfiguration | null>(
    "get_packaged_host_client_e2e_configuration",
  );
}

export function hostPackagedHostClientE2eReadyAndWaitForStop(
  input: PackagedHostClientE2eHostWaitInput,
) {
  return invoke<void>("host_packaged_host_client_e2e_ready_and_wait_for_stop", {
    input,
  });
}

export function completePackagedHostClientE2e(
  input: PackagedHostClientE2eCompletion,
) {
  return invoke<void>("complete_packaged_host_client_e2e", { input });
}

export function failPackagedHostClientE2e(
  input: PackagedHostClientE2eFailure,
) {
  return invoke<void>("fail_packaged_host_client_e2e", { input });
}

export function failPackagedHostClientE2eBootstrap() {
  return invoke<void>("fail_packaged_host_client_e2e_bootstrap");
}
