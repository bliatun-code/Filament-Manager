import bambuLogo from "../assets/vendor_bambu.svg";
import esunLogo from "../assets/vendor_esun.svg";
import { useI18n } from "../lib/i18n";

type VendorBadgeProps = {
  vendor: string;
  compact?: boolean;
};

type VendorMeta = {
  label: string;
  labelKey?: string;
  logo?: string;
  classes: string;
};

function resolveVendorMeta(vendorRaw: string): VendorMeta {
  const vendor = vendorRaw.trim();
  const lower = vendor.toLowerCase();
  if (lower.includes("bambu")) {
    return {
      label: "Bambu",
      labelKey: "vendor.bambu",
      logo: bambuLogo,
      classes:
        "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100",
    };
  }
  if (lower.includes("esun")) {
    return {
      label: "eSUN",
      labelKey: "vendor.esun",
      logo: esunLogo,
      classes:
        "border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200",
    };
  }
  return {
    label: vendor || "Generic",
    classes:
      "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200",
  };
}

export function VendorBadge({ vendor, compact = false }: VendorBadgeProps) {
  const { t } = useI18n();
  const meta = resolveVendorMeta(vendor);
  const label = meta.labelKey ? t(meta.labelKey, meta.label) : meta.label;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.classes}`}
      title={`${t("wishlist.vendor", "Vendor")}: ${label}`}
    >
      {meta.logo ? (
        <img
          src={meta.logo}
          alt={label}
          className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} rounded-sm`}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
