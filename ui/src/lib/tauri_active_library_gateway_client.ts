import { invoke } from "./tauri_invoke";
import type { UpdateSpoolDetailsInput } from "./tauri_inventory_client";

export type ReviewedLibraryAuthority = { mode: "LOCAL" } | {
  mode: "CLIENT"; base_url: string; library_id: string; target_generation: number;
};

export async function updateActiveLibrarySpoolDetails(
  input: UpdateSpoolDetailsInput,
  expectedAuthority?: ReviewedLibraryAuthority,
): Promise<void> {
  await invoke<void>("update_active_library_spool_details", { input, ...(expectedAuthority ? { expectedAuthority } : {}) });
}
