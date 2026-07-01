import type { InventorySpool } from "./inventory_list_model";

export const DESKTOP_VISUAL_QA_QUERY_KEY = "bfm_visual_qa";

export const DESKTOP_VISUAL_QA_SCENARIOS = [
  "add-filament",
  "bambu-batch-add",
  "loan-out",
  "selected-roll",
  "rfid-capture",
  "return-loan",
  "printer-board",
  "printer-slot-assignment",
] as const;

export type DesktopVisualQaScenario = (typeof DESKTOP_VISUAL_QA_SCENARIOS)[number];
export type DesktopVisualQaInitialPage = "inventory" | "loans" | "printers";

function isDevRuntime(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  return Boolean(env?.DEV);
}

export function normalizeDesktopVisualQaScenario(
  value: string | null | undefined,
): DesktopVisualQaScenario | null {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "add-filament":
    case "inventory-add":
      return "add-filament";
    case "loan-out":
    case "inventory-loan":
      return "loan-out";
    case "selected-roll":
    case "detail":
    case "inventory-detail":
      return "selected-roll";
    case "rfid-capture":
    case "inventory-rfid":
      return "rfid-capture";
    case "return-loan":
    case "loan-return":
    case "return":
      return "return-loan";
    case "printer-board":
    case "printers":
      return "printer-board";
    case "printer-slot-assignment":
    case "printer-slot-dropdown":
    case "slot-assignment":
      return "printer-slot-assignment";
    case "bambu-batch-add":
    case "batch-add":
    case "bambu-batch":
      return "bambu-batch-add";
    default:
      return null;
  }
}

export function resolveDesktopVisualQaScenario(
  search = typeof window !== "undefined" ? window.location.search : "",
  devRuntime = isDevRuntime(),
): DesktopVisualQaScenario | null {
  if (!devRuntime) {
    return null;
  }
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  return normalizeDesktopVisualQaScenario(params.get(DESKTOP_VISUAL_QA_QUERY_KEY));
}

export function isInventoryDesktopVisualQaScenario(
  search: string | URLSearchParams | null | undefined,
): boolean {
  return desktopVisualQaInitialPage(search) === "inventory";
}

export function desktopVisualQaInitialPage(
  search: string | URLSearchParams | null | undefined,
): DesktopVisualQaInitialPage | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  const scenario = normalizeDesktopVisualQaScenario(params.get(DESKTOP_VISUAL_QA_QUERY_KEY));
  if (!scenario) {
    return null;
  }
  if (scenario === "return-loan") {
    return "loans";
  }
  if (scenario === "printer-board" || scenario === "printer-slot-assignment") {
    return "printers";
  }
  return "inventory";
}

export function chooseDesktopVisualQaSpoolId(
  spools: InventorySpool[],
  assignedSpoolIds: ReadonlySet<string>,
  scenario: DesktopVisualQaScenario,
): string | null {
  const usableSpools = spools.filter(
    (spool) => spool.status !== "EMPTY" && spool.status !== "LOST",
  );
  if (scenario === "rfid-capture") {
    return (
      usableSpools.find((spool) => assignedSpoolIds.has(spool.id) && spool.rfidTag)?.id ??
      usableSpools.find((spool) => assignedSpoolIds.has(spool.id))?.id ??
      usableSpools[0]?.id ??
      null
    );
  }
  return usableSpools[0]?.id ?? spools[0]?.id ?? null;
}
