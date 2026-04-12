import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignPrinterSlot,
  assignLibrarySyncHostPrinterSlot,
  createPrinter,
  createLibrarySyncHostPrinter,
  fetchCachedLibrarySyncPrinterOverview,
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSpools,
  getLibrarySyncSettings,
  getPrinterSettings,
  isTauri,
  listPrinterOverview,
  listSpools,
  recordPrintUsage,
  recordLibrarySyncHostPrintUsage,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolWeight,
  type PrinterOverviewRow,
  type PrinterAmsSlotRow,
  type SpoolWithMasterRow,
} from "../lib/tauri_client";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { ModalHeader, modalPanelClassName } from "../components/modal_chrome";
import { PrinterModelPreview } from "../components/printer_model_preview";
import { SaveOnlyModal } from "../components/save_only_modal";
import { semanticChipClass } from "../lib/chip_styles";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";
import {
  describePrinterCapability,
  describeConfiguredPrinterSetup,
  findPrinterModelProfileExact,
  formatPrinterSlotLabelForModel,
  hasConfiguredMultiMaterial,
  listSupportedPrinterModels,
  multiMaterialSlotsInputLabel,
  multiMaterialUnitsInputLabel,
  resolvePrinterModelProfile,
  sortPrinterSlotsExtLast,
  summarizeEffectivePrinterSlots,
} from "../lib/printer_profiles";

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function defaultSpoolTareWeightForVendor(vendor?: string | null): number {
  const normalized = (vendor ?? "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

function resolveSpoolTareWeightForRow(row?: SpoolWithMasterRow | null): number {
  if (!row) {
    return 0;
  }
  const explicit = row.spool.spool_tare_weight_g;
  if (explicit != null && Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(row.master.vendor);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatGrams(value?: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${Math.max(0, value)} g`;
}

function formatDateTime(raw: string, locale: Locale): string {
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

function toSwatchColor(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "#CBD5E1";
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return "#CBD5E1";
}

function hexToRgb(raw?: string | null): [number, number, number] | null {
  const normalized = toSwatchColor(raw).replace("#", "");
  if (normalized.length === 3) {
    const expanded = normalized
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  return null;
}

function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function printerSwatchSurfaceStyle(
  raw: string | null | undefined,
  tone: "panel" | "inset",
  resolvedTheme: ResolvedTheme,
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "panel"
        ? {
            top: 0.32,
            mid: 0.16,
            bottom: 0.08,
            base: "rgb(10, 17, 31)",
            shadow: 0.38,
            border: 0.44,
            ambientShadow: "rgba(2, 6, 23, 0.5)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
        : {
            top: 0.28,
            mid: 0.14,
            bottom: 0.06,
            base: "rgb(13, 21, 39)",
            shadow: 0.34,
            border: 0.4,
            ambientShadow: "rgba(2, 6, 23, 0.44)",
            inset: "rgba(255, 255, 255, 0.028)",
          }
      : tone === "panel"
        ? {
            top: 0.12,
            mid: 0.055,
            bottom: 0.022,
            base: "rgba(252, 254, 255, 0.96)",
            shadow: 0.22,
            border: 0.18,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          }
        : {
            top: 0.105,
            mid: 0.045,
            bottom: 0.018,
            base: "rgba(253, 254, 255, 0.97)",
            shadow: 0.18,
            border: 0.16,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          };

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${darkTheme ? "24%" : "40%"}, ${swatchRgba(
      raw,
      strength.bottom,
    )} ${darkTheme ? "66%" : "74%"}, ${strength.base} 100%)`,
    borderColor: swatchRgba(raw, strength.border),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 16px 34px -30px ${swatchRgba(raw, strength.shadow)}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}

function printerSwatchInteractiveInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
  emphasis: "default" | "selected" = "default",
) {
  const base = printerSwatchSurfaceStyle(raw, "inset", resolvedTheme);
  if (emphasis === "selected") {
    return {
      ...base,
      borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.56 : 0.34),
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(226, 232, 240, 0.1)"
          : "rgba(15, 23, 42, 0.08)"
      }, 0 16px 30px -24px ${swatchRgba(raw, resolvedTheme === "dark" ? 0.44 : 0.28)}`,
    } as const;
  }
  return base;
}

function swatchTextColor(raw: string | null | undefined): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "#FFFFFF";
  }
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness >= 170 ? "#0F172A" : "#FFFFFF";
}

function blendSwatchColor(
  raw: string | null | undefined,
  target: [number, number, number],
  amount: number,
): string {
  const rgb = hexToRgb(raw) ?? [51, 65, 85];
  const mixed = rgb.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount),
  ) as [number, number, number];
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function printerSwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return {
    background:
      resolvedTheme === "dark"
        ? `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.04)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.44,
          )} 100%)`
        : `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.08)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.22,
          )} 100%)`,
    borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.62 : 0.46),
    color: swatchTextColor(raw),
    boxShadow:
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${swatchRgba(raw, 0.72)}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`
        : `0 18px 36px -24px ${swatchRgba(raw, 0.54)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
  } as const;
}

function commandErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
}

type SlotSwapDraft = {
  targetSpoolId: string;
  search: string;
  outgoingWeight: string;
  incomingWeight: string;
};

type IncomingWeightPrompt = {
  printerId: string;
  slotId: string;
  targetSpoolId: string | null;
  targetMaterial: string;
  targetFilamentName: string;
  targetColorName: string;
  targetHexColor?: string | null;
  requiresOutgoingWeight: boolean;
  requiresIncomingWeight: boolean;
  currentMaterial?: string | null;
  currentFilamentName?: string | null;
  currentColorName?: string | null;
};

export default function PrintersPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [spools, setSpools] = useState<SpoolWithMasterRow[]>([]);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauri);
  const [clientPrinterSource, setClientPrinterSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "LIVE",
  );
  const [clientPrinterUpdatedAt, setClientPrinterUpdatedAt] = useState<string | null>(null);
  const [printerModels, setPrinterModels] = useState<string[]>([]);
  const [showAddPrinterModal, setShowAddPrinterModal] = useState(false);
  const [newPrinterModel, setNewPrinterModel] = useState("");
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newAmsUnits, setNewAmsUnits] = useState("0");
  const [newSlotsPerUnit, setNewSlotsPerUnit] = useState("4");
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotSwapDraft>>({});
  const [openDropdownSlotId, setOpenDropdownSlotId] = useState<string | null>(null);
  const [incomingWeightPrompt, setIncomingWeightPrompt] = useState<IncomingWeightPrompt | null>(
    null,
  );
  const [incomingWeightValue, setIncomingWeightValue] = useState("");
  const [outgoingWeightValue, setOutgoingWeightValue] = useState("");
  const selectedModelProfile = useMemo(
    () => resolvePrinterModelProfile(newPrinterModel || ""),
    [newPrinterModel],
  );
  const supportedPrinterModels = useMemo(() => listSupportedPrinterModels(), []);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const syncSettings = await getLibrarySyncSettings();
        if (cancelled) {
          return;
        }
        setClientReadOnly(syncSettings.mode === "CLIENT");
        setClientHostWritePaired(syncSettings.client_auth_paired ?? false);
        setClientHostDeviceName(syncSettings.host_device_name ?? null);
        setClientHostBaseUrl(syncSettings.host_base_url ?? null);
        setClientLibraryId(syncSettings.library_id ?? null);
      } catch (syncError) {
        console.error(syncError);
      } finally {
        if (!cancelled) {
          setLibrarySyncReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfo(
      t(
        "printers.clientReadOnlyAction",
        "This device is connected as a client. Use the host for printer changes.",
      ),
    );
    return false;
  }, [clientReadOnly, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "printers.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "printers.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected printer actions.",
        ),
      );
      return false;
    }
    return true;
  }, [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, t]);

  const formatPrinterSpoolStatusLabel = useCallback(
    (status?: string | null) => {
      switch ((status ?? "").trim().toUpperCase()) {
        case "IN_STOCK":
          return t("inventory.statusInStock", "In stock");
        case "IN_USE":
          return t("inventory.statusInUse", "In use");
        case "BORROWED":
          return t("inventory.statusBorrowed", "Loaned out");
        case "EMPTY":
          return t("inventory.statusEmpty", "Empty");
        case "LOST":
          return t("inventory.statusLost", "Lost");
        default:
          return status?.trim() || t("common.unknown", "Unknown");
      }
    },
    [t],
  );

  const formatPrinterSpoolStatusTone = useCallback((status?: string | null) => {
    switch ((status ?? "").trim().toUpperCase()) {
      case "IN_USE":
        return "success";
      case "IN_STOCK":
        return "info";
      case "BORROWED":
        return "warning";
      case "EMPTY":
        return "neutral";
      case "LOST":
        return "danger";
      default:
        return "neutral";
    }
  }, []);

  const resolveSpoolTareWeightById = useCallback(
    (spoolId: string | null | undefined) => {
      const id = (spoolId ?? "").trim();
      if (!id) {
        return 0;
      }
      const row = spools.find((candidate) => candidate.spool.id === id) ?? null;
      return resolveSpoolTareWeightForRow(row);
    },
    [spools],
  );

  const printerPageSummary = useMemo(() => {
    let loadedSlots = 0;
    let totalSlots = 0;
    for (const printer of printers) {
      const summary = summarizeEffectivePrinterSlots(printer.slots);
      totalSlots += summary.totalSlots;
      loadedSlots += summary.loadedSlots;
    }
    return {
      printerCount: printers.length,
      loadedSlots,
      totalSlots,
    };
  }, [printers]);

  const sortedSpools = useMemo(() => sortSpoolsAlphabetically(spools, locale), [locale, spools]);

  const reloadData = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const [overview, spoolRows, settings] = await Promise.all(
        clientReadOnly && clientHostBaseUrl && clientLibraryId
          ? [
              fetchLibrarySyncPrinterOverview(clientHostBaseUrl, clientLibraryId),
              fetchLibrarySyncSpools(clientHostBaseUrl, clientLibraryId, 1200, 0),
              Promise.resolve({ printer_models: supportedPrinterModels }),
            ]
          : [listPrinterOverview(), listSpools(1200, 0), getPrinterSettings()],
      );
      if (clientReadOnly) {
        setClientPrinterSource("LIVE");
        const [cachedPrinters] = await Promise.all([
          fetchCachedLibrarySyncPrinterOverview().catch(() => null),
        ]);
        setClientPrinterUpdatedAt(cachedPrinters?.captured_at ?? null);
      }
      setPrinters(
        overview.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
      setSpools(spoolRows);
      setPrinterModels(
        settings.printer_models.length > 0 ? settings.printer_models : supportedPrinterModels,
      );
      setSlotDrafts({});
      setOpenDropdownSlotId(null);
      setIncomingWeightPrompt(null);
      setIncomingWeightValue("");
      setOutgoingWeightValue("");
    } catch (loadError) {
      console.error(loadError);
      if (clientReadOnly) {
        try {
          const [cachedPrinters, cachedSpools] = await Promise.all([
            fetchCachedLibrarySyncPrinterOverview(),
            fetchCachedLibrarySyncSpools(),
          ]);
          if (cachedPrinters?.rows || cachedSpools?.rows) {
            setClientPrinterSource("CACHED");
            setClientPrinterUpdatedAt(cachedPrinters?.captured_at ?? null);
            setPrinters(
              (cachedPrinters?.rows ?? []).map((printer) => ({
                ...printer,
                slots: sortPrinterSlotsExtLast(printer.slots),
              })),
            );
            setSpools(cachedSpools?.rows ?? []);
            setPrinterModels(supportedPrinterModels);
            setSlotDrafts({});
            setOpenDropdownSlotId(null);
            setIncomingWeightPrompt(null);
            setIncomingWeightValue("");
            setOutgoingWeightValue("");
            return;
          }
        } catch (cacheError) {
          console.error(cacheError);
        }
        setClientPrinterSource("OFFLINE");
        setClientPrinterUpdatedAt(null);
        setPrinters([]);
        setSpools([]);
      }
      setError(t("printers.error.load", "Failed to load printer overview."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, supportedPrinterModels, t, tauri]);

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    void reloadData();
  }, [librarySyncReady, reloadData, tauri]);

  useEffect(() => {
    if (!openDropdownSlotId) {
      return;
    }
    const selector = `[data-slot-dropdown="${openDropdownSlotId}"]`;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest(selector)) {
        setOpenDropdownSlotId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdownSlotId(null);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openDropdownSlotId]);

  function closeAddPrinterModal() {
    if (busy) {
      return;
    }
    setShowAddPrinterModal(false);
  }

  function openAddPrinterModal() {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    setNewPrinterModel("");
    setNewPrinterName("");
    setNewAmsUnits("0");
    setNewSlotsPerUnit("4");
    setShowAddPrinterModal(true);
    setError(null);
    setInfo(null);
  }

  async function handleAddPrinter() {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    const model = newPrinterModel.trim();
    const name = newPrinterName.trim();
    if (!model || !name) {
      setError(t("settings.error.printerRequired", "Printer name and model are required."));
      return;
    }

    const profile = resolvePrinterModelProfile(model);
    const units = clampInt(
      parseNonNegativeInt(newAmsUnits, profile.defaultUnits),
      0,
      profile.maxUnits,
    );
    const slotsPerUnit = clampInt(
      parsePositiveInt(newSlotsPerUnit, profile.defaultSlotsPerUnit),
      1,
      profile.maxSlotsPerUnit,
    );

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const printerId = `printer_${Date.now()}`;
      if (clientReadOnly) {
        await createLibrarySyncHostPrinter(clientHostBaseUrl!, clientLibraryId, {
          id: printerId,
          model,
          name,
          ams_units: units,
          slots_per_ams: slotsPerUnit,
        });
      } else {
        await createPrinter({
          id: printerId,
          model,
          name,
          ams_units: units,
          slots_per_ams: slotsPerUnit,
        });
      }
      setShowAddPrinterModal(false);
      await reloadData();
      setInfo(`${t("settings.addedPrinter", "Added printer")} "${name}".`);
    } catch (createError) {
      console.error(createError);
      setError(
        commandErrorText(
          createError,
          t("settings.error.addPrinter", "Failed to add printer."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function allowedSpoolsForSlot(slotSpoolId?: string | null) {
    return sortedSpools.filter((row) => {
      const status = (row.spool.status ?? "").trim().toUpperCase();
      const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
      if (
        status === "EMPTY" ||
        status === "LOST" ||
        status === "MISSING" ||
        (status === "BORROWED" && ownershipType !== "BORROWED_IN")
      ) {
        return false;
      }
      if (slotSpoolId && row.spool.id === slotSpoolId) {
        return true;
      }
      if (status === "IN_USE") {
        return false;
      }
      return true;
    });
  }

  function parseWeightInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.round(parsed);
  }

  function getSlotDraft(slot: PrinterAmsSlotRow): SlotSwapDraft {
    const cached = slotDrafts[slot.slot_id];
    if (cached) {
      return cached;
    }
    return {
      targetSpoolId: slot.spool_id ?? "",
      search: "",
      outgoingWeight:
        slot.spool_remaining_g != null
          ? String(
              Math.max(
                0,
                slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id ?? null),
              ),
            )
          : "",
      incomingWeight: "",
    };
  }

  function setSlotDraft(slotId: string, next: SlotSwapDraft) {
    setSlotDrafts((current) => ({
      ...current,
      [slotId]: next,
    }));
  }

  function openIncomingWeightDialog(
    printerId: string,
    slot: PrinterAmsSlotRow,
    row: SpoolWithMasterRow,
  ) {
    const requiresOutgoingWeight = Boolean(slot.spool_id && slot.spool_id !== row.spool.id);
    setIncomingWeightPrompt({
      printerId,
      slotId: slot.slot_id,
      targetSpoolId: row.spool.id,
      targetMaterial: row.master.material,
      targetFilamentName: row.master.filament_name,
      targetColorName: row.master.color_name,
      targetHexColor: row.master.hex_color,
      requiresOutgoingWeight,
      requiresIncomingWeight: true,
      currentMaterial: slot.spool_material,
      currentFilamentName: slot.spool_filament_name,
      currentColorName: slot.spool_color_name,
    });
    setIncomingWeightValue(
      row.spool.remaining_g != null
        ? String(Math.max(0, row.spool.remaining_g + resolveSpoolTareWeightForRow(row)))
        : "",
    );
    setOutgoingWeightValue(
      requiresOutgoingWeight && slot.spool_remaining_g != null
        ? String(
            Math.max(
              0,
              slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id ?? null),
            ),
          )
        : "",
    );
  }

  function openEmptySlotWeightDialog(printerId: string, slot: PrinterAmsSlotRow) {
    if (!slot.spool_id) {
      return;
    }
    setIncomingWeightPrompt({
      printerId,
      slotId: slot.slot_id,
      targetSpoolId: null,
      targetMaterial: slot.spool_material ?? "—",
      targetFilamentName: slot.spool_filament_name ?? "—",
      targetColorName: slot.spool_color_name ?? "—",
      targetHexColor: slot.spool_hex_color,
      requiresOutgoingWeight: true,
      requiresIncomingWeight: false,
      currentMaterial: slot.spool_material,
      currentFilamentName: slot.spool_filament_name,
      currentColorName: slot.spool_color_name,
    });
    setIncomingWeightValue("");
    setOutgoingWeightValue(
      slot.spool_remaining_g != null
        ? String(
            Math.max(
              0,
              slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id ?? null),
            ),
          )
        : "",
    );
  }

  async function confirmIncomingWeightDialog() {
    if (!incomingWeightPrompt) {
      return;
    }
    const parsedIncoming = incomingWeightPrompt.requiresIncomingWeight
      ? parseWeightInput(incomingWeightValue)
      : null;
    if (incomingWeightPrompt.requiresIncomingWeight && parsedIncoming == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    const parsedOutgoing = incomingWeightPrompt.requiresOutgoingWeight
      ? parseWeightInput(outgoingWeightValue)
      : null;
    if (incomingWeightPrompt.requiresOutgoingWeight && parsedOutgoing == null) {
      setError(
        t(
          "printers.error.outgoingWeightRequired",
          "Enter outgoing spool weight before swapping rolls.",
        ),
      );
      return;
    }
    const printer = printers.find((item) => item.printer.id === incomingWeightPrompt.printerId);
    const slot = printer?.slots.find((item) => item.slot_id === incomingWeightPrompt.slotId);
    if (!printer || !slot) {
      setError(t("printers.error.updateSlot", "Failed to update printer slot."));
      return;
    }

    const applied = await applySlotChange(printer.printer.id, slot, {
      targetSpoolId: incomingWeightPrompt.targetSpoolId,
      incomingWeight: parsedIncoming,
      outgoingWeight: incomingWeightPrompt.requiresOutgoingWeight ? parsedOutgoing : null,
    });
    if (!applied) {
      return;
    }

    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
  }

  function openWeightPromptForDraft(
    printer: PrinterOverviewRow["printer"],
    slot: PrinterAmsSlotRow,
    draft: SlotSwapDraft,
  ) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!draft.targetSpoolId) {
      setError(
        t(
          "printers.error.selectRollBeforeWeight",
          "Select a target roll before updating weight.",
        ),
      );
      return;
    }
    const slotOptions = allowedSpoolsForSlot(slot.spool_id);
    const row = slotOptions.find((item) => item.spool.id === draft.targetSpoolId);
    if (!row) {
      setError(
        t(
          "printers.error.selectRollBeforeWeight",
          "Select a target roll before updating weight.",
        ),
      );
      return;
    }
    openIncomingWeightDialog(printer.id, slot, row);
  }

  async function applyMeasuredWeightWithUsage(
    printerId: string,
    spoolId: string,
    previousRemaining: number | null | undefined,
    measuredTotalWeight: number,
    tareWeight: number,
  ) {
    const safeMeasuredTotal = Math.max(0, Math.round(measuredTotalWeight));
    const safeTareWeight = Math.max(0, Math.round(tareWeight));
    const measuredFilament = Math.max(0, safeMeasuredTotal - safeTareWeight);
    const baseline =
      previousRemaining != null && Number.isFinite(previousRemaining)
        ? Math.max(0, Math.round(previousRemaining))
        : null;
    const usedGrams = baseline != null ? Math.max(0, baseline - measuredFilament) : 0;
    if (clientReadOnly) {
      if (!canUseClientHostWrite()) {
        throw new Error(
          t(
            "printers.clientWriteRequiresPairing",
            "Pair this desktop client with the host before running protected printer actions.",
          ),
        );
      }
      if (baseline != null && usedGrams > 0) {
        await recordLibrarySyncHostPrintUsage(clientHostBaseUrl!, clientLibraryId, {
          printer_id: printerId,
          spool_id: spoolId,
          grams: usedGrams,
          job_name: null,
          success: true,
        });
      } else {
        await updateLibrarySyncHostSpoolWeight(
          clientHostBaseUrl!,
          clientLibraryId,
          spoolId,
          safeMeasuredTotal,
        );
      }
      return;
    }
    if (baseline != null) {
      if (usedGrams > 0) {
        await recordPrintUsage({
          printer_id: printerId,
          spool_id: spoolId,
          grams: usedGrams,
          job_name: null,
          success: true,
        });
        return;
      }
      if (measuredFilament !== baseline) {
        await updateSpoolWeight(spoolId, safeMeasuredTotal);
      }
      return;
    }
    await updateSpoolWeight(spoolId, safeMeasuredTotal);
  }

  async function applySlotChange(
    printerId: string,
    slot: PrinterAmsSlotRow,
    overrides?: {
      targetSpoolId: string | null;
      outgoingWeight: number | null;
      incomingWeight: number | null;
    },
  ) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return false;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return false;
    }
    if (!tauri || busy) {
      return false;
    }
    const currentSpoolId = slot.spool_id ?? null;
    const draft = overrides ? null : getSlotDraft(slot);
    const targetSpoolId = overrides ? overrides.targetSpoolId : draft?.targetSpoolId || null;
    const hasChange = currentSpoolId !== targetSpoolId;
    const outgoingWeightRaw = overrides ? "" : draft?.outgoingWeight.trim() ?? "";
    const incomingWeightRaw = overrides ? "" : draft?.incomingWeight.trim() ?? "";
    const outgoingWeight = overrides ? overrides.outgoingWeight : parseWeightInput(outgoingWeightRaw);
    const incomingWeight = overrides ? overrides.incomingWeight : parseWeightInput(incomingWeightRaw);

    if (!overrides && outgoingWeightRaw && outgoingWeight == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return false;
    }
    if (!overrides && incomingWeightRaw && incomingWeight == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return false;
    }

    if (!hasChange && outgoingWeight == null && incomingWeight == null) {
      setInfo(t("printers.noPendingChanges", "No pending slot changes."));
      return false;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (currentSpoolId && hasChange) {
        if (outgoingWeight == null) {
          throw new Error(
            t(
              "printers.error.outgoingWeightRequired",
              "Enter outgoing spool weight before swapping rolls.",
            ),
          );
        }
        await applyMeasuredWeightWithUsage(
          printerId,
          currentSpoolId,
          slot.spool_remaining_g,
          outgoingWeight,
          resolveSpoolTareWeightById(currentSpoolId),
        );
      } else if (currentSpoolId && !hasChange && (incomingWeight != null || outgoingWeight != null)) {
        const sameRollMeasuredWeight = incomingWeight ?? outgoingWeight;
        if (sameRollMeasuredWeight != null) {
          await applyMeasuredWeightWithUsage(
            printerId,
            currentSpoolId,
            slot.spool_remaining_g,
            sameRollMeasuredWeight,
            resolveSpoolTareWeightById(currentSpoolId),
          );
        }
      }

      if (hasChange) {
        if (clientReadOnly) {
          await assignLibrarySyncHostPrinterSlot(
            clientHostBaseUrl!,
            clientLibraryId,
            {
              printer_id: printerId,
              slot_id: slot.slot_id,
              spool_id: targetSpoolId,
            },
          );
        } else {
          await assignPrinterSlot({
            printer_id: printerId,
            slot_id: slot.slot_id,
            spool_id: targetSpoolId,
          });
        }
      }

      if (hasChange && targetSpoolId && incomingWeight != null) {
        if (clientReadOnly) {
          await updateLibrarySyncHostSpoolWeight(
            clientHostBaseUrl!,
            clientLibraryId,
            targetSpoolId,
            incomingWeight,
          );
        } else {
          await updateSpoolWeight(targetSpoolId, incomingWeight);
        }
      }
      await reloadData();
      setInfo(t("printers.slotUpdated", "Printer slot updated."));
      return true;
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("printers.error.updateSlot", "Failed to update printer slot."),
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.printers", "Printers")}</h1>
          <div className="page-subtitle max-w-2xl">
            {t(
              "printers.subtitle",
              "Track printer slot placement and printer-linked material consumption.",
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <div className="page-header-tools">
            <div className="page-header-filter-surface grid min-w-[17rem] grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:shadow-none">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("printers.configuredPrinters", "Configured printers")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {printerPageSummary.printerCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:shadow-none">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("printers.loadedSlots", "Loaded slots")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {printerPageSummary.loadedSlots}
                  <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                    / {printerPageSummary.totalSlots}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="header-button-primary w-full min-[920px]:w-auto"
              onClick={openAddPrinterModal}
              disabled={!tauri || busy || (clientReadOnly ? !clientHostWritePaired : false)}
            >
              {t("settings.addPrinter", "Add printer")}
            </button>
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("printers.desktopOnly", "Printer overview is available in the desktop app build.")}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      {clientReadOnly && clientPrinterSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName
            ? `${clientHostDeviceName}. `
            : null}
          {clientPrinterSource === "CACHED"
            ? t(
                "printers.clientReadOnlyCached",
                "Host unavailable. Showing the last cached printer snapshot.",
              )
            : t(
                "printers.clientReadOnlyOffline",
                "Host unavailable and no cached printer snapshot is available yet.",
              )}
          {clientPrinterUpdatedAt
            ? ` ${t("printers.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientPrinterUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
      ) : null}

      {loading ? (
        <div className="surface-subtle mt-6 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          {t("common.loadingPrinters", "Loading printers...")}
        </div>
      ) : null}

      {!loading && printers.length === 0 ? (
        <div className="surface-subtle mt-6 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t("printers.noPrinters", "No printers configured yet. Use Add printer to create one.")}
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {printers.map((printer) => {
          const hasMultiMaterial = hasConfiguredMultiMaterial(printer.slots);
          const configuredSetup = describeConfiguredPrinterSetup(
            t,
            printer.printer.model,
            printer.slots,
          );
          const usageMetrics = [
            {
              key: "jobs",
              label: t("printers.jobs", "Jobs"),
              value: String(printer.usage.total_jobs),
              valueClassName: "text-slate-900 dark:text-slate-50",
            },
            {
              key: "success",
              label: t("printers.success", "Success"),
              value: String(printer.usage.successful_jobs),
              valueClassName: "text-emerald-700 dark:text-emerald-200",
            },
            {
              key: "failed",
              label: t("printers.failed", "Failed"),
              value: String(printer.usage.failed_jobs),
              valueClassName: "text-rose-700 dark:text-rose-200",
            },
            {
              key: "used",
              label: t("printers.used", "Used"),
              value: `${printer.usage.total_used_g} g`,
              valueClassName: "text-amber-700 dark:text-amber-200",
            },
          ];
          return (
            <section
              key={printer.printer.id}
              className="surface-card"
              style={printerBrandSurfaceStyle(printer.printer.model, "card", resolvedTheme)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <PrinterModelPreview
                    model={printer.printer.model}
                    hasMultiMaterial={hasMultiMaterial}
                  />
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      {printer.printer.name}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {printer.printer.model} ·{" "}
                      {describePrinterCapability(
                        t,
                        printer.printer.model,
                        hasMultiMaterial,
                      )}{" "}
                      · {configuredSetup}
                    </div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[24rem] min-[1080px]:grid-cols-4">
                  {usageMetrics.map((metric) => (
                    <div
                      key={metric.key}
                      className="rounded-2xl border px-3 py-2.5 shadow-sm dark:shadow-none"
                      style={printerBrandSurfaceStyle(
                        printer.printer.model,
                        "compact",
                        resolvedTheme,
                      )}
                    >
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {metric.label}
                      </div>
                      <div className={`mt-1 text-lg font-semibold ${metric.valueClassName}`}>
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {printer.slots.map((slot) => {
                const slotOptions = allowedSpoolsForSlot(slot.spool_id);
                const draft = getSlotDraft(slot);
                const searchTerm = draft.search.trim().toLowerCase();
                const filteredSlotOptions = slotOptions.filter((row) => {
                  if (!searchTerm) {
                    return true;
                  }
                  return `${row.master.vendor} ${row.master.material} ${row.master.filament_name} ${row.master.color_name} ${row.spool.id} ${row.spool.location_id ?? ""}`
                    .toLowerCase()
                    .includes(searchTerm);
                });
                const selectedTargetSpool =
                  draft.targetSpoolId.length > 0
                    ? slotOptions.find((row) => row.spool.id === draft.targetSpoolId) ?? null
                    : null;
                const isDropdownOpen = openDropdownSlotId === slot.slot_id;
                const slotSwatchHex =
                  selectedTargetSpool?.master.hex_color ?? slot.spool_hex_color ?? null;
                const slotSelectorStyle = slotSwatchHex
                  ? printerSwatchInteractiveInsetStyle(
                      slotSwatchHex,
                      resolvedTheme,
                      selectedTargetSpool ? "selected" : "default",
                    )
                  : undefined;
                const slotCurrentRollStyle = slot.spool_id
                  ? printerSwatchInteractiveInsetStyle(
                      slot.spool_hex_color,
                      resolvedTheme,
                      "selected",
                    )
                  : undefined;
                const slotActionStyle = slotSwatchHex
                  ? printerSwatchActionButtonStyle(slotSwatchHex, resolvedTheme)
                  : undefined;
                return (
                  <div
                    key={slot.slot_id}
                    className="surface-subtle flex h-full flex-col p-3"
                    style={
                      slotSwatchHex
                        ? printerSwatchSurfaceStyle(slotSwatchHex, "panel", resolvedTheme)
                        : undefined
                    }
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {formatPrinterSlotLabelForModel(t, printer.printer.model, {
                        ams_id: slot.ams_id,
                        slot_index: slot.slot_index,
                      })}
                    </div>

                    <div
                      className="relative mt-2"
                      data-slot-dropdown={slot.slot_id}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
                        onClick={() =>
                          setOpenDropdownSlotId((current) =>
                            current === slot.slot_id ? null : slot.slot_id,
                          )
                        }
                        disabled={!tauri || busy}
                        style={slotSelectorStyle}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-5 w-5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                            style={{
                              backgroundColor: toSwatchColor(slotSwatchHex),
                            }}
                          />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {selectedTargetSpool
                                  ? formatFilamentDisplayTitle(
                                      selectedTargetSpool.master.material,
                                      selectedTargetSpool.master.filament_name,
                                      selectedTargetSpool.master.color_name,
                                    )
                                  : t("printers.emptySlot", "Empty slot")}
                              </span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                {selectedTargetSpool
                                  ? `${selectedTargetSpool.master.vendor} · ${formatSpoolReference(selectedTargetSpool.spool.id)} · ${formatGrams(selectedTargetSpool.spool.remaining_g)}`
                                : t("printers.targetEmpty", "Target: Empty slot")}
                              </span>
                            </span>
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">▾</span>
                      </button>

                      {isDropdownOpen ? (
                        <div
                          className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/20 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/30"
                          style={
                            slotSwatchHex
                              ? printerSwatchSurfaceStyle(slotSwatchHex, "panel", resolvedTheme)
                              : undefined
                          }
                        >
                          <input
                            type="text"
                            value={draft.search}
                            onChange={(event) =>
                              setSlotDraft(slot.slot_id, {
                                ...draft,
                                search: event.target.value,
                              })
                            }
                            placeholder={t("printers.searchRolls", "Search rolls by name/vendor")}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                            disabled={!tauri || busy}
                          />
                          <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-600">
                            <button
                              type="button"
                              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${
                                draft.targetSpoolId === ""
                                  ? "border border-slate-300 bg-slate-100 font-semibold text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                                  : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                              }`}
                              onClick={() => {
                                setSlotDraft(slot.slot_id, {
                                  ...draft,
                                  targetSpoolId: "",
                                });
                                setOpenDropdownSlotId(null);
                                if (!slot.spool_id) {
                                  return;
                                }
                                openEmptySlotWeightDialog(printer.printer.id, slot);
                              }}
                              disabled={!tauri || busy}
                              style={
                                draft.targetSpoolId === ""
                                  ? printerSwatchInteractiveInsetStyle(
                                      null,
                                      resolvedTheme,
                                      "selected",
                                    )
                                  : undefined
                              }
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                                  style={{ backgroundColor: "#CBD5E1" }}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">
                                    {t("printers.emptySlot", "Empty slot")}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                                    {t(
                                      "printers.clearSlotOptionHint",
                                      "Remove current roll from this slot",
                                    )}
                                  </span>
                                </span>
                              </span>
                            </button>
                            {filteredSlotOptions.map((row) => {
                              const placementLabel = formatPlacementLabel(t, row.spool.location_id);
                              return (
                                <button
                                  key={row.spool.id}
                                  type="button"
                                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm ${
                                    draft.targetSpoolId === row.spool.id
                                      ? "border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                                      : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                                  }`}
                                  style={printerSwatchInteractiveInsetStyle(
                                    row.master.hex_color,
                                    resolvedTheme,
                                    draft.targetSpoolId === row.spool.id ? "selected" : "default",
                                  )}
                                  onClick={() => {
                                    setSlotDraft(slot.slot_id, {
                                      ...draft,
                                      targetSpoolId: row.spool.id,
                                    });
                                    setOpenDropdownSlotId(null);
                                    openIncomingWeightDialog(printer.printer.id, slot, row);
                                  }}
                                  disabled={!tauri || busy}
                                >
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <span
                                      className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                                      style={{
                                        backgroundColor: toSwatchColor(row.master.hex_color),
                                      }}
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate font-semibold leading-tight">
                                        {formatFilamentDisplayTitle(
                                          row.master.material,
                                          row.master.filament_name,
                                          row.master.color_name,
                                        )}
                                      </span>
                                      <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                                        {row.master.vendor} · {formatSpoolReference(row.spool.id)}{" "}
                                        · {formatGrams(row.spool.remaining_g)}
                                      </span>
                                      <span className="mt-px block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                                        {placementLabel}
                                      </span>
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                            {filteredSlotOptions.length === 0 ? (
                              <div className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
                                {t("inventory.noMatch", "No spools match current filters.")}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {slot.spool_id ? (
                      <div
                        className="mt-3 rounded-xl border p-3 text-xs text-slate-700 dark:text-slate-300"
                        style={slotCurrentRollStyle}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {t("printers.currentRoll", "Current roll")}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                              <span>
                                {t("inventory.reference", "Reference")}{" "}
                                {formatSpoolReference(slot.spool_id)}
                              </span>
                              <span
                                className={semanticChipClass(
                                  formatPrinterSpoolStatusTone(slot.spool_status),
                                  "px-2 py-0.5 text-[10px]",
                                )}
                              >
                                {formatPrinterSpoolStatusLabel(slot.spool_status)}
                              </span>
                            </div>
                          </div>
                          <span
                            className="h-7 w-7 shrink-0 rounded-lg border border-slate-200 dark:border-slate-600"
                            style={{ backgroundColor: toSwatchColor(slot.spool_hex_color) }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-slate-300/80 px-3 py-3 text-xs text-slate-500 dark:border-slate-600/80 dark:text-slate-400">
                        {t("printers.noSpoolAssigned", "No spool assigned.")}
                      </div>
                    )}

                    <button
                      type="button"
                      className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                        slotActionStyle
                          ? "shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
                      }`}
                      style={slotActionStyle}
                      onClick={() => openWeightPromptForDraft(printer.printer, slot, draft)}
                      disabled={!tauri || busy || !draft.targetSpoolId}
                    >
                      {t("printers.updateWeight", "Update weight")}
                    </button>
                  </div>
                );
              })}
              </div>
            </section>
          );
        })}
      </div>

      {incomingWeightPrompt ? (
        <SaveOnlyModal
          title={
            incomingWeightPrompt.requiresIncomingWeight
              ? t("printers.incomingWeightPromptTitle", "Set incoming roll weight")
              : t("printers.outgoingWeightPromptTitle", "Set outgoing roll weight")
          }
          subtitle={formatFilamentDisplayTitle(
            incomingWeightPrompt.targetMaterial,
            incomingWeightPrompt.targetFilamentName,
            incomingWeightPrompt.targetColorName,
          )}
          swatchColor={toSwatchColor(incomingWeightPrompt.targetHexColor)}
          saveDisabled={busy}
          onSave={() => void confirmIncomingWeightDialog()}
        >
          <div className="space-y-3">
            {incomingWeightPrompt.requiresOutgoingWeight ? (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("printers.outgoingWeight", "Outgoing weight (g)")}
                </label>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {formatFilamentDisplayTitle(
                    incomingWeightPrompt.currentMaterial,
                    incomingWeightPrompt.currentFilamentName,
                    incomingWeightPrompt.currentColorName,
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  value={outgoingWeightValue}
                  onChange={(event) => setOutgoingWeightValue(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                  autoFocus={!incomingWeightPrompt.requiresIncomingWeight}
                />
              </div>
            ) : null}
            {incomingWeightPrompt.requiresIncomingWeight ? (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("printers.incomingWeightPromptLabel", "Measured weight (g)")}
                </label>
                <input
                  type="number"
                  min={0}
                  value={incomingWeightValue}
                  onChange={(event) => setIncomingWeightValue(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                  autoFocus
                />
              </div>
            ) : null}
          </div>
        </SaveOnlyModal>
      ) : null}

      {showAddPrinterModal ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={closeAddPrinterModal}
          panelClassName={modalPanelClassName("lg", "p-0")}
        >
          <div>
            <ModalHeader
              eyebrow={t("nav.printers", "Printers")}
              title={t("settings.addPrinter", "Add printer")}
              subtitle={t(
                "settings.columnsHint",
                "Choose model, name and multi-material capacity. EXT stays available automatically.",
              )}
              onClose={closeAddPrinterModal}
              closeLabel={t("common.close", "Close")}
              disabled={busy}
              className="px-6 py-5"
            />

            <div className="space-y-4 px-6 py-6">
              <div className="surface-card space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("settings.selectPrinterModel", "Select printer model")}
                  </label>
                  <select
                    value={newPrinterModel}
                    onChange={(event) => {
                      const nextModel = event.target.value;
                      setNewPrinterModel(nextModel);
                      const exactProfile = findPrinterModelProfileExact(nextModel);
                      if (exactProfile) {
                        setNewAmsUnits(String(exactProfile.defaultUnits));
                        setNewSlotsPerUnit(String(exactProfile.defaultSlotsPerUnit));
                      } else if (!nextModel) {
                        setNewAmsUnits("0");
                        setNewSlotsPerUnit("4");
                      }
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                    disabled={!tauri || busy || printerModels.length === 0}
                  >
                    <option value="">
                      {t("settings.selectPrinterModel", "Select printer model")}
                    </option>
                    {printerModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("settings.printerName", "Printer name")}
                  </label>
                  <input
                    type="text"
                    value={newPrinterName}
                    onChange={(event) => setNewPrinterName(event.target.value)}
                    placeholder={t("settings.printerName", "Printer name")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                    disabled={!tauri || busy}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {multiMaterialUnitsInputLabel(t, newPrinterModel || "")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={selectedModelProfile.maxUnits}
                      value={newAmsUnits}
                      onChange={(event) => setNewAmsUnits(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                      title={multiMaterialUnitsInputLabel(t, newPrinterModel || "")}
                      disabled={!tauri || busy || selectedModelProfile.maxUnits === 0}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {multiMaterialSlotsInputLabel(t, newPrinterModel || "")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={selectedModelProfile.maxSlotsPerUnit}
                      value={newSlotsPerUnit}
                      onChange={(event) => setNewSlotsPerUnit(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                      title={multiMaterialSlotsInputLabel(t, newPrinterModel || "")}
                      disabled={!tauri || busy || selectedModelProfile.maxUnits === 0}
                    />
                  </div>
                </div>

                <div
                  className="surface-subtle flex items-center gap-3 p-3"
                  style={printerBrandSurfaceStyle(
                    newPrinterModel || null,
                    "compact",
                    resolvedTheme,
                  )}
                >
                  <PrinterModelPreview
                    model={newPrinterModel || "Printer"}
                    hasMultiMaterial={
                      clampInt(
                        parseNonNegativeInt(newAmsUnits, selectedModelProfile.defaultUnits),
                        0,
                        selectedModelProfile.maxUnits,
                      ) > 0
                    }
                    compact
                  />
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {describePrinterCapability(
                      t,
                      newPrinterModel || "",
                      clampInt(
                        parseNonNegativeInt(newAmsUnits, selectedModelProfile.defaultUnits),
                        0,
                        selectedModelProfile.maxUnits,
                      ) > 0,
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800/70"
                  onClick={closeAddPrinterModal}
                  disabled={busy}
                >
                  {t("common.close", "Close")}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300/30 transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white"
                  onClick={() => void handleAddPrinter()}
                  disabled={!tauri || busy || !newPrinterModel || !newPrinterName.trim()}
                >
                  {t("settings.addPrinter", "Add printer")}
                </button>
              </div>
            </div>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
