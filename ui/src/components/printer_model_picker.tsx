import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { describePrinterCapability, listSupportedPrinterModels, resolvePrinterModelProfile } from "../lib/printer_profiles";
import { PrinterModelPreview } from "./printer_model_preview";

type Props = {
  value: string;
  onChange: (model: string) => void;
  models?: string[];
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  allowCustom?: boolean;
};

export function PrinterModelPicker({ value, onChange, models = listSupportedPrinterModels(), disabled, id, describedBy, allowCustom = false }: Props) {
  const { t } = useI18n();
  const instanceId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [open, setOpen] = useState(false);
  const resultsId = `${instanceId}-results`;
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);
  const label = t("settings.selectPrinterModel", "Select printer model");
  const filtered = models.filter((model) =>
    model.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (brand === "all" || (brand === "other" ? !/^(Bambu Lab|Prusa) /i.test(model) : model.startsWith(brand))),
  );
  return <div className="printer-model-picker">
    <button ref={triggerRef} id={id ?? instanceId} type="button" disabled={disabled} aria-label={label} aria-describedby={describedBy}
      aria-expanded={open} aria-controls={resultsId} className="printer-model-picker-trigger app-form-control app-control-focus"
      onClick={() => setOpen(!open)}>
      {value ? <PrinterModelPreview model={value} hasMultiMaterial={false} compact /> : null}
      <span>{value || label}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open ? <div id={resultsId} className="printer-model-picker-panel" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }}>
      <label className="printer-model-search app-form-control">
        <Search size={17} aria-hidden="true" />
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("settings.searchPrinterModels", "Search printer models")}
          placeholder={t("settings.searchPrinterModels", "Search printer models")} disabled={disabled} />
      </label>
      <div className="printer-model-brands" role="group" aria-label={t("settings.printerBrand", "Manufacturer")}>
        {[["all", t("settings.printerModelsAll", "All")], ["Bambu Lab", "Bambu Lab"], ["Prusa", "Prusa"], ["other", t("settings.printerModelsOther", "Other")]].map(([key, text]) =>
          <button type="button" key={key} aria-pressed={brand === key} disabled={disabled} className="app-soft-control app-control-focus" onClick={() => setBrand(key)}>{text}</button>)}
      </div>
      <div className="printer-model-results" role="group" aria-label={label}>
        {filtered.map((model) => <button key={model} type="button" aria-pressed={model === value} disabled={disabled}
          className="printer-model-option app-control-focus" onClick={() => { onChange(model); setOpen(false); triggerRef.current?.focus(); }}>
          <PrinterModelPreview model={model} hasMultiMaterial={false} compact />
          <span><strong>{model}</strong><small>{describePrinterCapability(t, model, resolvePrinterModelProfile(model).defaultUnits > 0)}</small></span>
          {model === value ? <Check size={17} aria-hidden="true" /> : null}
        </button>)}
      </div>
      {!filtered.length ? <p className="printer-model-no-results" role="status">{t("settings.printerModelsNoResults", "No results")}</p> : null}
      {allowCustom ? <label className="printer-model-custom">{t("settings.customPrinterModel", "Custom model name")}
        <input className="app-form-control app-control-focus" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      </label> : null}
    </div> : null}
  </div>;
}
