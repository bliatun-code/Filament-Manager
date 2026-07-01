import type { InventorySpool } from "./inventory_list_model";

export const DESKTOP_VISUAL_QA_QUERY_KEY = "bfm_visual_qa";

export const DESKTOP_VISUAL_QA_SCENARIOS = [
  "dashboard-overview",
  "inventory-overview",
  "add-filament",
  "bambu-batch-add",
  "loans-overview",
  "loan-out",
  "selected-roll",
  "rfid-capture",
  "return-loan",
  "printer-board",
  "printer-slot-assignment",
  "printer-slot-onboarding",
  "printer-slot-replacement",
  "printer-slot-clear",
  "settings-general",
  "settings-library",
  "settings-printer-diagnostics",
  "settings-printer-diagnostics-fields",
  "settings-printer-diagnostics-paused",
  "settings-catalog",
  "settings-maintenance",
  "statistics-overview",
] as const;

export type DesktopVisualQaScenario = (typeof DESKTOP_VISUAL_QA_SCENARIOS)[number];
export type DesktopVisualQaInitialPage =
  | "dashboard"
  | "inventory"
  | "loans"
  | "printers"
  | "settings"
  | "statistics";
export type DesktopVisualQaInitialSettingsTab =
  | "GENERAL"
  | "LIBRARY"
  | "PRINTERS"
  | "CATALOG"
  | "MAINTENANCE";

function isDevRuntime(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  return Boolean(env?.DEV);
}

export function normalizeDesktopVisualQaScenario(
  value: string | null | undefined,
): DesktopVisualQaScenario | null {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "dashboard-overview":
    case "dashboard":
      return "dashboard-overview";
    case "inventory-overview":
    case "inventory":
      return "inventory-overview";
    case "add-filament":
    case "inventory-add":
      return "add-filament";
    case "loans-overview":
    case "loans":
    case "loan-history":
      return "loans-overview";
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
    case "printer-slot-onboarding":
    case "slot-onboarding":
    case "ams-onboarding":
    case "printer-ams-onboarding":
      return "printer-slot-onboarding";
    case "printer-slot-replacement":
    case "printer-slot-swap":
    case "slot-replacement":
    case "slot-swap":
      return "printer-slot-replacement";
    case "printer-slot-clear":
    case "printer-slot-unload":
    case "slot-clear":
    case "slot-unload":
      return "printer-slot-clear";
    case "bambu-batch-add":
    case "batch-add":
    case "bambu-batch":
      return "bambu-batch-add";
    case "settings-general":
    case "general-settings":
      return "settings-general";
    case "settings-library":
    case "library-settings":
    case "companion-settings":
      return "settings-library";
    case "settings-printer-diagnostics":
    case "printer-diagnostics":
    case "bambu-live-diagnostics":
      return "settings-printer-diagnostics";
    case "settings-printer-diagnostics-fields":
    case "printer-diagnostics-fields":
    case "bambu-live-diagnostics-fields":
      return "settings-printer-diagnostics-fields";
    case "settings-printer-diagnostics-paused":
    case "printer-diagnostics-paused":
    case "bambu-live-diagnostics-paused":
      return "settings-printer-diagnostics-paused";
    case "settings-catalog":
    case "catalog-settings":
    case "filament-catalog":
      return "settings-catalog";
    case "settings-maintenance":
    case "maintenance-settings":
    case "program-maintenance":
      return "settings-maintenance";
    case "statistics-overview":
    case "statistics":
    case "usage-statistics":
    case "print-statistics":
      return "statistics-overview";
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
  if (scenario === "dashboard-overview") {
    return "dashboard";
  }
  if (scenario === "inventory-overview") {
    return "inventory";
  }
  if (scenario === "loans-overview" || scenario === "return-loan") {
    return "loans";
  }
  if (
    scenario === "printer-board" ||
    scenario === "printer-slot-assignment" ||
    scenario === "printer-slot-onboarding" ||
    scenario === "printer-slot-replacement" ||
    scenario === "printer-slot-clear"
  ) {
    return "printers";
  }
  if (
    scenario === "settings-general" ||
    scenario === "settings-library" ||
    scenario === "settings-printer-diagnostics" ||
    scenario === "settings-printer-diagnostics-fields" ||
    scenario === "settings-printer-diagnostics-paused" ||
    scenario === "settings-catalog" ||
    scenario === "settings-maintenance"
  ) {
    return "settings";
  }
  if (scenario === "statistics-overview") {
    return "statistics";
  }
  return "inventory";
}

export function desktopVisualQaInitialSettingsTab(
  search: string | URLSearchParams | null | undefined,
): DesktopVisualQaInitialSettingsTab | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  const scenario = normalizeDesktopVisualQaScenario(params.get(DESKTOP_VISUAL_QA_QUERY_KEY));
  if (scenario === "settings-general") {
    return "GENERAL";
  }
  if (scenario === "settings-library") {
    return "LIBRARY";
  }
  if (scenario === "settings-printer-diagnostics") {
    return "PRINTERS";
  }
  if (
    scenario === "settings-printer-diagnostics-fields" ||
    scenario === "settings-printer-diagnostics-paused"
  ) {
    return "PRINTERS";
  }
  if (scenario === "settings-catalog") {
    return "CATALOG";
  }
  if (scenario === "settings-maintenance") {
    return "MAINTENANCE";
  }
  return null;
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
  if (scenario === "selected-roll") {
    return (
      usableSpools.find(isColorfulNonBambuSpool)?.id ??
      usableSpools.find(isNonBambuSpool)?.id ??
      usableSpools[0]?.id ??
      spools[0]?.id ??
      null
    );
  }
  return usableSpools[0]?.id ?? spools[0]?.id ?? null;
}

function isNeutralColorName(value: string): boolean {
  return /\b(black|white|gray|grey|silver|transparent|clear|natural)\b/i.test(value);
}

function isNonBambuSpool(spool: InventorySpool): boolean {
  return !spool.vendor.toLowerCase().includes("bambu");
}

function isColorfulNonBambuSpool(spool: InventorySpool): boolean {
  return isNonBambuSpool(spool) && !isNeutralColorName(spool.colorName);
}
