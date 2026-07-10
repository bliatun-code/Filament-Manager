import { settingsActionButtonClass } from "../lib/settings_ui_classes";

type SettingsPrinterObservedDetailsToggleProps = {
  controlsId: string;
  disabled: boolean;
  expanded: boolean;
  hideLabel: string;
  onToggle: () => void;
  showLabel: string;
};

export function SettingsPrinterObservedDetailsToggle({
  controlsId,
  disabled,
  expanded,
  hideLabel,
  onToggle,
  showLabel,
}: SettingsPrinterObservedDetailsToggleProps) {
  return (
    <button
      type="button"
      className={settingsActionButtonClass("neutral", "compact")}
      onClick={onToggle}
      disabled={disabled}
      aria-controls={controlsId}
      aria-expanded={expanded}
    >
      {expanded ? hideLabel : showLabel}
    </button>
  );
}
