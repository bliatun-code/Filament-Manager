import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import {
  modalActionButtonClassName,
  type ModalActionButtonSize,
  type ModalActionButtonVariant,
} from "./modal_action_button_class";
import { inventorySwatchActionButtonStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

type ModalActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  resolvedTheme?: ResolvedTheme;
  size?: ModalActionButtonSize;
  swatchColor?: string | null;
  variant?: ModalActionButtonVariant;
};

export function ModalActionButton({
  children,
  className,
  fullWidth = false,
  resolvedTheme = "light",
  size = "default",
  style,
  swatchColor,
  type = "button",
  variant = "secondary",
  ...buttonProps
}: ModalActionButtonProps) {
  const swatchStyle = swatchColor
    ? inventorySwatchActionButtonStyle(swatchColor, resolvedTheme)
    : undefined;
  const mergedStyle: CSSProperties | undefined = swatchStyle
    ? { ...swatchStyle, ...style }
    : style;

  return (
    <button
      {...buttonProps}
      type={type}
      className={[
        fullWidth ? "w-full" : "",
        modalActionButtonClassName(variant, size),
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      {children}
    </button>
  );
}
