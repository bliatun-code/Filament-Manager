import type { HTMLAttributes, ReactNode } from "react";
import { inventoryDetailLabelClassName } from "./inventory_detail_panel_class";
import { joinClassNames } from "./ui_class_names";

export const inventoryDetailFactCardClassName =
  "app-modal-inset-soft rounded-xl border px-3.5 py-3 shadow-sm dark:shadow-none";

export const inventoryDetailTintPanelClassName =
  "app-modal-inset-soft rounded-xl border";

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
