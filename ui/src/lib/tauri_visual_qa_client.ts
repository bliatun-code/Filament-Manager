import { invoke } from "./tauri_invoke";

export async function prepareDesktopVisualQaWindow(): Promise<void> {
  await invoke<void>("prepare_desktop_visual_qa_window");
}

export async function signalDesktopVisualQaReadiness(token: string): Promise<void> {
  await invoke<void>("signal_desktop_visual_qa_readiness", { token });
}
