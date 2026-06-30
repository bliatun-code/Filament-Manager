import { settingsSectionLabelClass } from "../lib/settings_ui_classes";

export function SettingsMetricTile({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-300/70 bg-white/58 px-4 py-3 dark:border-slate-700/72 dark:bg-slate-950/30 ${className}`.trim()}
    >
      <div className={settingsSectionLabelClass}>{label}</div>
      <div className="mt-2 break-words text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hint}</div>
      ) : null}
    </div>
  );
}
