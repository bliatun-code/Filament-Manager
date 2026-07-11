import printerBase from "../assets/printer_base.svg";
import printerWithAms from "../assets/printer_with_ams.svg";
import { useI18n } from "../lib/i18n";

type PrinterModelPreviewProps = {
  model: string;
  hasMultiMaterial: boolean;
  compact?: boolean;
};

export function PrinterModelPreview({
  model,
  hasMultiMaterial,
  compact = false,
}: PrinterModelPreviewProps) {
  const { t } = useI18n();
  const src = hasMultiMaterial ? printerWithAms : printerBase;
  const heightClass = compact ? "h-14" : "h-20";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900/60">
      <img
        src={src}
        alt={
          hasMultiMaterial
            ? t("printers.previewWithMultiMaterial", "{model} with multi-material").replace(
                "{model}",
                model,
              )
            : t("printers.previewSingleMaterial", "{model} single-material").replace(
                "{model}",
                model,
              )
        }
        className={`${heightClass} w-auto object-contain`}
      />
    </div>
  );
}
