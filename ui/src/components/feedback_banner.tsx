import type { ReactNode } from "react";

export type FeedbackTone = "neutral" | "warning" | "danger" | "success";

const toneClassName: Record<FeedbackTone, string> = {
  neutral:
    "border-slate-200/85 bg-white/72 text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/55 dark:text-slate-200",
  warning:
    "border-amber-200/85 bg-amber-50/92 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/14 dark:text-amber-100",
  danger:
    "border-rose-200/85 bg-rose-50/92 text-rose-900 dark:border-rose-400/40 dark:bg-rose-500/14 dark:text-rose-100",
  success:
    "border-emerald-200/85 bg-emerald-50/92 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/14 dark:text-emerald-100",
};

type FeedbackBannerProps = {
  tone: FeedbackTone;
  children: ReactNode;
  className?: string;
  compact?: boolean;
};

export function FeedbackBanner({
  tone,
  children,
  className,
  compact = false,
}: FeedbackBannerProps) {
  const densityClassName = compact
    ? "rounded-lg px-3.5 py-3 text-xs leading-5"
    : "rounded-lg px-4 py-3.5 text-sm leading-6";

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={[
        "border",
        densityClassName,
        toneClassName[tone],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
