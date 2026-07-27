import { isSpoolStatusEmptyOrLost } from "./inventory_domain";
import visualQaScenarioManifest from "./desktop_visual_qa_scenarios.json";
import type { InventorySpool } from "./inventory_list_model";

export const DESKTOP_VISUAL_QA_QUERY_KEY = "bfm_visual_qa";
export const DESKTOP_VISUAL_QA_BORROWER_NAME = "Sample maker space";
export const DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID = "visual_qa_spool_inbound_lagoon";

export type DesktopVisualQaScenario =
  | "dashboard-overview"
  | "dashboard-onboarding"
  | "inventory-overview"
  | "add-filament"
  | "wishlist-queue"
  | "bambu-batch-add"
  | "loans-overview"
  | "loan-out"
  | "selected-roll"
  | "selected-roll-label"
  | "selected-roll-history"
  | "selected-roll-danger-zone"
  | "rfid-capture"
  | "return-loan"
  | "return-inbound-loan"
  | "printer-board"
  | "printer-overview"
  | "add-printer"
  | "printer-slot-assignment"
  | "printer-slot-onboarding"
  | "printer-rfid-override"
  | "printer-slot-replacement"
  | "printer-slot-clear"
  | "settings-general"
  | "settings-updates"
  | "settings-inventory-label-sheet"
  | "settings-library"
  | "settings-library-role-change"
  | "settings-library-network-details"
  | "settings-library-network-editor"
  | "settings-library-pairing"
  | "settings-library-browsers"
  | "settings-library-browsers-history"
  | "settings-printer-diagnostics"
  | "settings-printer-diagnostics-fields"
  | "settings-printer-diagnostics-paused"
  | "settings-printer-editor"
  | "settings-printer-editor-dirty"
  | "settings-printer-editor-discard"
  | "settings-catalog"
  | "settings-catalog-swatch-review"
  | "settings-maintenance"
  | "settings-application-diagnostics"
  | "statistics-overview"
  | "statistics-consumption"
  | "statistics-borrower"
  | "statistics-loans";
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
export type DesktopVisualQaReadinessToken = "printer-live-telemetry";
export type DesktopVisualQaReadiness = {
  timeoutMs: number;
  token: DesktopVisualQaReadinessToken;
};
export type DesktopVisualQaScenarioDefinition = {
  aliases?: string[];
  category: DesktopVisualQaScenarioCategory;
  id: DesktopVisualQaScenario;
  page: DesktopVisualQaInitialPage;
  readiness?: DesktopVisualQaReadiness;
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
      usableSpools.find((spool) => assignedSpoolIds.has(spool.id) && isBambuSpool(spool))?.id ??
      usableSpools.find((spool) => assignedSpoolIds.has(spool.id))?.id ??
      usableSpools[0]?.id ??
      null
    );
  }
  if (scenario === "selected-roll-label") {
    return (
      usableSpools.find(isLabelRedundancyStressSpool)?.id ??
      usableSpools.find(isBrightNeutralSpool)?.id ??
      usableSpools[0]?.id ??
      spools[0]?.id ??
      null
    );
  }
  if (scenario === "selected-roll") {
    return (
      usableSpools.find(isBrightNeutralSpool)?.id ??
      usableSpools.find(isColorfulNonBambuSpool)?.id ??
      usableSpools.find(isNonBambuSpool)?.id ??
      usableSpools[0]?.id ??
      spools[0]?.id ??
      null
    );
  }
  if (scenario === "selected-roll-history") {
    return (
      usableSpools.find(
        (spool) =>
          !assignedSpoolIds.has(spool.id) &&
          spool.status === "IN_STOCK" &&
          spool.ownershipType === "OWNED" &&
          spool.remainingGrams != null &&
          spool.remainingGrams < spool.initialWeightGrams &&
          isColorfulNonBambuSpool(spool),
      )?.id ??
      usableSpools.find(isColorfulNonBambuSpool)?.id ??
      usableSpools.find(isNonBambuSpool)?.id ??
      usableSpools[0]?.id ??
      spools[0]?.id ??
      null
    );
  }
  if (scenario === "selected-roll-danger-zone") {
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

function isLabelRedundancyStressSpool(spool: InventorySpool): boolean {
  const material = spool.material.trim();
  return (
    /^bambu(?:\s+lab)?$/i.test(spool.vendor.trim()) &&
    Boolean(material) &&
    spool.colorName.toLocaleLowerCase().startsWith(`${material.toLocaleLowerCase()} `) &&
    spool.colorName.length >= 20
  );
}

export function chooseDesktopVisualQaLoanSpool(spools: InventorySpool[]): InventorySpool | null {
  const neutralMidtones = spools.filter(
    (spool) =>
      isNonBambuSpool(spool) &&
      /\b(gray|grey|silver)\b/i.test(spool.colorName) &&
      swatchChannelAverage(spool.hexColor) >= 120 &&
      swatchChannelAverage(spool.hexColor) <= 220,
  );

  return (
    neutralMidtones.reduce<InventorySpool | null>((brightest, spool) => {
      if (!brightest) {
        return spool;
      }
      return swatchChannelAverage(spool.hexColor) > swatchChannelAverage(brightest.hexColor)
        ? spool
        : brightest;
    }, null) ??
    spools.find(isColorfulNonBambuSpool) ??
    spools.find(isNonBambuSpool) ??
    spools[0] ??
    null
  );
}

function isNeutralColorName(value: string): boolean {
  return /\b(black|white|gray|grey|silver|transparent|clear|natural)\b/i.test(value);
}

function isBrightNeutralSpool(spool: InventorySpool): boolean {
  if (/\b(white|ivory)\b/i.test(spool.colorName)) {
    return true;
  }

  const normalizedHex = spool.hexColor?.trim().replace(/^#/, "");
  if (!normalizedHex || !/^[0-9a-f]{6}$/i.test(normalizedHex)) {
    return false;
  }

  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(normalizedHex.slice(offset, offset + 2), 16),
  );
  return channels.every((channel) => channel >= 232);
}

function swatchChannelAverage(value: string | null | undefined): number {
  const normalizedHex = value?.trim().replace(/^#/, "");
  if (!normalizedHex || !/^[0-9a-f]{6}$/i.test(normalizedHex)) {
    return -1;
  }
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(normalizedHex.slice(offset, offset + 2), 16),
  );
  return channels.reduce((total, channel) => total + channel, 0) / channels.length;
}

function isBambuSpool(spool: InventorySpool): boolean {
  return spool.vendor.toLowerCase().includes("bambu");
}

function isNonBambuSpool(spool: InventorySpool): boolean {
  return !isBambuSpool(spool);
}

function isColorfulNonBambuSpool(spool: InventorySpool): boolean {
  return isNonBambuSpool(spool) && !isNeutralColorName(spool.colorName);
}
