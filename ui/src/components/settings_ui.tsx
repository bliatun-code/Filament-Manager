import type { ReactNode } from "react";
import { settingsSectionLabelClass } from "../lib/settings_ui_classes";
import { joinClassNames } from "./ui_class_names";

export function SettingsSectionPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClassNames("surface-subtle overflow-hidden p-0", className)}>
      {children}
    </div>
  );
}

export function SettingsSurfaceCard({
  children,
  className,
  description,
  descriptionClassName = "text-slate-600 dark:text-slate-300",
  eyebrow,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  eyebrow?: ReactNode;
}) {
  return (
    <section className={joinClassNames("surface-card", className)}>
      {eyebrow ? <div className="section-eyebrow">{eyebrow}</div> : null}
      {description ? (
        <div className={joinClassNames("text-sm leading-6", descriptionClassName)}>
          {description}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SettingsSectionHeader({
  children,
  description,
  descriptionClassName = "text-slate-600 dark:text-slate-400",
  eyebrow,
  metrics,
  status,
}: {
  children?: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  eyebrow: ReactNode;
  metrics?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="section-eyebrow">{eyebrow}</div>
          {description ? (
            <div className={joinClassNames("mt-2 text-sm", descriptionClassName)}>
              {description}
            </div>
          ) : null}
          {children}
        </div>
        {status}
      </div>
      {metrics ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{metrics}</div> : null}
    </div>
  );
}

export function SettingsSectionBody({
  children,
  className = "p-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function SettingsSectionControls({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClassNames(
        "rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsSectionEmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClassNames(
        "surface-subtle mt-4 border-dashed px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-300",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
