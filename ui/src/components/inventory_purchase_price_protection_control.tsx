import { useId } from "react";
import { useI18n } from "../lib/i18n";

type InventoryPurchasePriceProtectionControlProps = {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
};

export function InventoryPurchasePriceProtectionControl({
  checked,
  disabled,
  onChange,
}: InventoryPurchasePriceProtectionControlProps) {
  const { t } = useI18n();
  const hintId = useId();

  return (
    <div className="surface-subtle px-4 py-3">
      <label className="flex items-start gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
          aria-describedby={hintId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {t(
            "inventory.protectIndividualPriceFromGroupUpdates",
            "Protect individual price from group updates",
          )}
        </span>
      </label>
      <p
        id={hintId}
        className="ml-7 mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300"
      >
        {t(
          "inventory.protectIndividualPriceFromGroupUpdatesHint",
          "Manual price edits for this roll still work. Filament defaults will skip it during group updates.",
        )}
      </p>
    </div>
  );
}
