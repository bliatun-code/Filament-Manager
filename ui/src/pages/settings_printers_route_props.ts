import type { SettingsPrintersRouteProps } from "./settings_printers_route";
type SettingsPrintersTabProps = SettingsPrintersRouteProps["tab"];

type AsyncPrinterActionKeys = "onDeletePrinter" | "onSavePrinterReconfigure";

type BuildSettingsPrintersRoutePropsInput = Omit<
  SettingsPrintersTabProps,
  AsyncPrinterActionKeys
> & {
  onDeletePrinter: (
    ...args: Parameters<SettingsPrintersTabProps["onDeletePrinter"]>
  ) => Promise<void> | void;
  onSavePrinterReconfigure: () => Promise<void> | void;
};

export function buildSettingsPrintersRouteProps({
  onDeletePrinter,
  onSavePrinterReconfigure,
  ...tab
}: BuildSettingsPrintersRoutePropsInput): SettingsPrintersRouteProps {
  return {
    tab: {
      ...tab,
      onDeletePrinter: (...args) => void onDeletePrinter(...args),
      onSavePrinterReconfigure: () => void onSavePrinterReconfigure(),
    },
  };
}
