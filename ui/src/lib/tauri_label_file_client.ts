import { invoke } from "./tauri_invoke";

export type FilamentLabelExportResult = {
  message: string;
  success: boolean;
  exportedPath?: string;
};

/** Native validation accepts only unchanged label files exported in this app session. */
export function openExportedLabelFile(path: string): Promise<void> {
  return invoke<void>("open_exported_label_file", { path });
}
