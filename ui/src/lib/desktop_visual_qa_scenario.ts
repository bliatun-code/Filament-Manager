import type { InventorySpool } from "./inventory_list_model";

export const DESKTOP_VISUAL_QA_QUERY_KEY = "bfm_visual_qa";

export const DESKTOP_VISUAL_QA_SCENARIOS = [
  "add-filament",
  "loan-out",
  "selected-roll",
  "rfid-capture",
] as const;

export type DesktopVisualQaScenario = (typeof DESKTOP_VISUAL_QA_SCENARIOS)[number];

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
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  return normalizeDesktopVisualQaScenario(params.get(DESKTOP_VISUAL_QA_QUERY_KEY)) !== null;
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
