import { isSpoolStatusEmptyOrLost } from "./inventory_domain";
import visualQaScenarioManifest from "./desktop_visual_qa_scenarios.json";
import type { InventorySpool } from "./inventory_list_model";

export const DESKTOP_VISUAL_QA_QUERY_KEY = "bfm_visual_qa";

export type DesktopVisualQaScenario =
  | "dashboard-overview"
  | "inventory-overview"
  | "add-filament"
  | "bambu-batch-add"
  | "loans-overview"
  | "loan-out"
  | "selected-roll"
  | "rfid-capture"
  | "return-loan"
  | "printer-board"
  | "printer-slot-assignment"
  | "printer-slot-onboarding"
  | "printer-rfid-override"
  | "printer-slot-replacement"
  | "printer-slot-clear"
  | "settings-general"
  | "settings-library"
  | "settings-library-network-details"
  | "settings-printer-diagnostics"
  | "settings-printer-diagnostics-fields"
  | "settings-printer-diagnostics-paused"
  | "settings-catalog"
  | "settings-catalog-swatch-review"
  | "settings-maintenance"
  | "statistics-overview";
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
export type DesktopVisualQaScenarioCategory = "overview" | "modal" | "workflow" | "settings";
export type DesktopVisualQaScenarioDefinition = {
  aliases?: string[];
  category: DesktopVisualQaScenarioCategory;
  id: DesktopVisualQaScenario;
  page: DesktopVisualQaInitialPage;
  requiresDatabaseFixture?: boolean;
  settingsTab?: DesktopVisualQaInitialSettingsTab;
};

const DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS =
  visualQaScenarioManifest.scenarios as DesktopVisualQaScenarioDefinition[];

export const DESKTOP_VISUAL_QA_SCENARIOS = DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS.map(
  (scenario) => scenario.id,
) as DesktopVisualQaScenario[];

function isDevRuntime(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  return Boolean(env?.DEV);
}

function normalizeScenarioToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function desktopVisualQaScenarioDefinition(
  value: string | null | undefined,
): DesktopVisualQaScenarioDefinition | null {
  const token = normalizeScenarioToken(value);
  if (!token) {
    return null;
  }
  return (
    DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS.find(
      (scenario) => scenario.id === token || scenario.aliases?.includes(token),
    ) ?? null
  );
}

export function normalizeDesktopVisualQaScenario(
  value: string | null | undefined,
): DesktopVisualQaScenario | null {
  return desktopVisualQaScenarioDefinition(value)?.id ?? null;
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
  return desktopVisualQaScenarioDefinition(params.get(DESKTOP_VISUAL_QA_QUERY_KEY))?.page ?? null;
}

export function desktopVisualQaInitialSettingsTab(
  search: string | URLSearchParams | null | undefined,
): DesktopVisualQaInitialSettingsTab | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  return (
    desktopVisualQaScenarioDefinition(params.get(DESKTOP_VISUAL_QA_QUERY_KEY))?.settingsTab ??
    null
  );
}

export function chooseDesktopVisualQaSpoolId(
  spools: InventorySpool[],
  assignedSpoolIds: ReadonlySet<string>,
  scenario: DesktopVisualQaScenario,
): string | null {
  const usableSpools = spools.filter((spool) => !isSpoolStatusEmptyOrLost(spool.status));
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
