import type { HTMLAttributes, ReactNode } from "react";
import { inventoryDetailLabelClassName } from "./inventory_detail_panel_class";
import { joinClassNames } from "./ui_class_names";

export const inventoryDetailFactCardClassName =
  "rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none";

export const inventoryDetailTintPanelClassName =
  "rounded-xl border border-slate-200 bg-slate-50";

type InventoryDetailTintPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type InventoryDetailFactCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  label: ReactNode;
};

export function InventoryDetailTintPanel({
  children,
  className,
  ...divProps
}: InventoryDetailTintPanelProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(inventoryDetailTintPanelClassName, className)}
    >
      {children}
    </div>
  );
}

export function InventoryDetailFactCard({
  children,
  className,
  label,
  ...divProps
}: InventoryDetailFactCardProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(inventoryDetailFactCardClassName, className)}
    >
      <div className={inventoryDetailLabelClassName}>{label}</div>
      {children}
    </div>
  );
}
