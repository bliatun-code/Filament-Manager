import { type ReactNode, useEffect } from "react";
import { useI18n } from "../lib/i18n";
import { AppModal } from "./app_modal";
import { ModalActionButton } from "./modal_action_button";
import { modalEyebrowClassName } from "./modal_chrome";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useResolvedTheme } from "../lib/theme_mode";

type SaveOnlyModalProps = {
  title: string;
  subtitle?: string;
  swatchColor?: string;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  saveDisabled?: boolean;
  zIndex?: number;
  children: ReactNode;
};

export function SaveOnlyModal({
  title,
  subtitle,
  swatchColor,
  onSave,
  saveLabel,
  saveDisabled = false,
  zIndex = 50,
  children,
}: SaveOnlyModalProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <AppModal
      zIndex={zIndex}
      panelClassName="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-0 shadow-2xl shadow-slate-300/18 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-black/38"
    >
      <>
        <div className="border-b border-slate-200/80 bg-slate-50/95 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-950/90">
          {swatchColor ? (
            <SwatchSelectionPreviewHeader
              eyebrow={t("common.save", "Save")}
              size="large"
              swatchColor={swatchColor}
            >
              <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {subtitle}
                </div>
              ) : null}
            </SwatchSelectionPreviewHeader>
          ) : (
            <div className="min-w-0">
              <div className={modalEyebrowClassName}>
                {t("common.save", "Save")}
              </div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {subtitle}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="bg-white/95 px-5 py-5 dark:bg-slate-900/90">{children}</div>

        <div className="border-t border-slate-200/80 bg-slate-50/95 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-950/90">
          <ModalActionButton
            type="button"
            fullWidth
            variant="solid"
            size="roomy"
            swatchColor={swatchColor}
            resolvedTheme={resolvedTheme}
            onClick={() => void onSave()}
            disabled={saveDisabled}
          >
            {saveLabel ?? t("common.save", "Save")}
          </ModalActionButton>
        </div>
      </>
    </AppModal>
  );
}
