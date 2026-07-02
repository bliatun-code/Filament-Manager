import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  pageHeaderButtonClassName,
  type PageHeaderButtonVariant,
} from "./page_header_button_class";
import { joinClassNames } from "./ui_class_names";

type PageHeaderButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  responsive?: boolean;
  variant?: PageHeaderButtonVariant;
};

export function PageHeaderButton({
  children,
  className,
  responsive = true,
  type = "button",
  variant = "secondary",
  ...buttonProps
}: PageHeaderButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={joinClassNames(
        pageHeaderButtonClassName(variant),
        responsive ? "w-full min-[920px]:w-auto" : "",
        className,
      )}
    >
      {children}
    </button>
  );
}
