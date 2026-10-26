import printerBase from "../assets/printer_base.svg";
import printerWithAms from "../assets/printer_with_ams.svg";
import { useI18n } from "../lib/i18n";
import { printerImageUrl, printerImageBounds } from "../lib/printer_images";

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
  const officialImage = printerImageUrl(model, hasMultiMaterial);
  const src = officialImage ?? (hasMultiMaterial ? printerWithAms : printerBase);
  const bounds = printerImageBounds(model,hasMultiMaterial);
  const label=hasMultiMaterial
    ? t("printers.previewWithMultiMaterial", "{model} with multi-material", { model })
    : t("printers.previewSingleMaterial", "{model} single-material", { model });
  const heightClass = compact ? "h-14" : "h-20";
  return (
    <div className={`printer-model-preview ${officialImage ? "printer-model-preview-official" : ""}`}>
      {bounds ? <svg viewBox={bounds.viewBox} role="img" aria-label={label} className={`${heightClass} w-full`} preserveAspectRatio="xMidYMid meet"><image href={src} width={bounds.width} height={bounds.height} /></svg> : <img
        src={src}
        alt={
          hasMultiMaterial
            ? t("printers.previewWithMultiMaterial", "{model} with multi-material", { model })
            : t("printers.previewSingleMaterial", "{model} single-material", { model })
        }
        className={`${heightClass} w-auto object-contain`}
        loading="lazy"
        decoding="async"
      />}
    </div>
  );
}
