import type { HTMLAttributes, ReactNode } from "react";
import {
  inventorySwatchCardStyle,
  inventorySwatchInsetStyle,
} from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import { joinClassNames } from "./ui_class_names";

type LoanSwatchCardVariant = "history" | "modal";

const loanSwatchCardClass: Record<LoanSwatchCardVariant, string> = {
  history:
    "rounded-xl border border-slate-300/80 p-3.5 shadow-sm shadow-slate-300/25 dark:border-slate-700/80 dark:shadow-none",
  modal:
    "rounded-2xl border border-slate-300/80 px-3.5 py-3 text-xs text-slate-700 shadow-sm shadow-slate-300/20 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-none",
};

const loanSwatchInsetCardClass: Record<LoanSwatchCardVariant, string> = {
  history: "rounded-xl border px-3 py-2.5",
  modal: "rounded-[1.05rem] border px-3.5 py-3",
};

type LoanSwatchCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  resolvedTheme: ResolvedTheme;
  swatchColor?: string | null;
  variant?: LoanSwatchCardVariant;
};

export function LoanSwatchCard({
  children,
  className,
  resolvedTheme,
  swatchColor,
  variant = "history",
  ...divProps
}: LoanSwatchCardProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(loanSwatchCardClass[variant], className)}
      style={inventorySwatchCardStyle(swatchColor, resolvedTheme)}
    >
      {children}
    </div>
  );
}

export function LoanSwatchInsetCard({
  children,
  className,
  resolvedTheme,
  swatchColor,
  variant = "history",
  ...divProps
}: LoanSwatchCardProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(loanSwatchInsetCardClass[variant], className)}
      style={inventorySwatchInsetStyle(swatchColor, resolvedTheme)}
    >
      {children}
    </div>
  );
}
