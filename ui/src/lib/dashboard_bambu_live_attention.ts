import type {
  BambuTlsTrustState,
  PrinterSettingsSnapshot,
} from "./tauri_client";

export type DashboardBambuLiveAttention = {
  printerId: string;
  printerName: string;
  trustState: Exclude<BambuTlsTrustState, "TRUSTED">;
};

export function buildDashboardBambuLiveAttention(
  snapshot: PrinterSettingsSnapshot | null,
): DashboardBambuLiveAttention[] {
  if (!snapshot) {
    return [];
  }

  const printerNameById = new Map(
    snapshot.printers.map((printer) => [printer.id, printer.name]),
  );

  return snapshot.bambu_live_integrations
    .flatMap(({ config, printer_id }) => {
      const trustState = config.tls_trust_state ?? "UNPAIRED";
      if (!config.enabled || trustState === "TRUSTED") {
        return [];
      }
      return [{
        printerId: printer_id,
        printerName: printerNameById.get(printer_id) ?? printer_id,
        trustState,
      }];
    })
    .sort(
      (left, right) =>
        left.printerName.localeCompare(right.printerName) ||
        left.printerId.localeCompare(right.printerId),
    );
}
