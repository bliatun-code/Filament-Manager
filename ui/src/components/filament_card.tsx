import { useI18n } from "../lib/i18n";
import { semanticChipClass } from "../lib/chip_styles";
import { VendorBadge } from "./vendor_badge";

export type FilamentCardData = {
  id: string;
  vendor?: string | null;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  status: "IN_STOCK" | "ASSIGNED" | "EMPTY" | "LOST";
  remainingGrams?: number | null;
  location?: string | null;
};

type FilamentCardProps = {
  spool: FilamentCardData;
  onSelect?: (spoolId: string) => void;
};

function formatRemaining(remainingGrams?: number | null): string {
  if (remainingGrams == null) {
    return "Unknown";
  }
  if (remainingGrams <= 0) {
    return "Empty";
  }
  return `${remainingGrams} g`;
}

function statusBadge(status: FilamentCardData["status"]): string {
  switch (status) {
    case "ASSIGNED":
      return semanticChipClass("success");
    case "IN_STOCK":
      return semanticChipClass("info");
    case "EMPTY":
      return semanticChipClass("neutral");
    case "LOST":
      return semanticChipClass("danger");
    default:
      return semanticChipClass("neutral");
  }
}

function toSwatchColor(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return "#cbd5f5";
}

export function FilamentCard({ spool, onSelect }: FilamentCardProps) {
  const { t } = useI18n();
  const swatchColor = toSwatchColor(spool.hexColor);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(spool.id)}
      className="surface-card-compact flex w-full items-center gap-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:hover:border-slate-500"
    >
      <div className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-900/60">
        <div
          className="h-full w-full rounded-lg border border-white/70 shadow-inner"
          style={{
            background: `linear-gradient(145deg, ${swatchColor} 0%, ${swatchColor}CC 58%, #0f172a33 100%)`,
          }}
        />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {spool.filamentName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {spool.colorName} · {spool.material}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {spool.vendor ? <VendorBadge vendor={spool.vendor} compact /> : null}
            <span className={statusBadge(spool.status)}>
              {spool.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{t("inventory.remaining", "Remaining")}</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {formatRemaining(spool.remainingGrams)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{t("inventory.location", "Location")}</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {spool.location ?? t("inventory.unassigned", "Unassigned")}
          </span>
        </div>
      </div>
    </button>
  );
}
