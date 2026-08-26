import { invoke } from "./tauri_invoke";
import type { UpdateSpoolDetailsInput } from "./tauri_inventory_client";

export async function updateActiveLibrarySpoolDetails(
  input: UpdateSpoolDetailsInput,
): Promise<void> {
  await invoke<void>("update_active_library_spool_details", { input });
}
