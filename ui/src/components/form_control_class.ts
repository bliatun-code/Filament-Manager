import {
  appControlFocusClassName,
  appFormControlClassName,
  joinClassNames,
} from "./ui_class_names";

export const formInputChromeClassName =
  joinClassNames(
    "rounded-xl border px-3 py-2 text-sm outline-none transition",
    appFormControlClassName,
    appControlFocusClassName,
  );

export const modalFormInputClassName =
  `mt-1.5 w-full text-slate-800 ${formInputChromeClassName}`;

export const inventoryFormControlClassName =
  joinClassNames(
    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    appFormControlClassName,
    appControlFocusClassName,
  );
