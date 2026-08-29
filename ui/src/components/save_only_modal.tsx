import { type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { AppModal } from "./app_modal";
import { ModalActionButton } from "./modal_action_button";
import { ModalFooter, modalEyebrowClassName } from "./modal_chrome";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";

type SaveOnlyModalProps = {
  title: string;
  subtitle?: string;
  swatchColor?: string;
  cancelDisabled?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
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
  cancelDisabled = false,
  cancelLabel,
  onCancel,
  onSave,
  saveLabel,
  saveDisabled = false,
  zIndex = 50,
  children,
}: SaveOnlyModalProps) {
  const { t } = useI18n();
  const activeCancelHandler = onCancel && !cancelDisabled ? onCancel : undefined;

  return (
    <AppModal
      ariaLabel={title}
      closeOnBackdrop={Boolean(activeCancelHandler)}
      onBackdropClose={activeCancelHandler}
      zIndex={zIndex}
      panelClassName="app-modal-panel max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border p-0 backdrop-blur-xl"
    >
      <>
        <div className="app-modal-header border-b px-5 py-4">
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

        <div className="px-5 py-5">{children}</div>

        <ModalFooter
          className={`app-modal-footer-surface px-5 py-4 ${
            onCancel ? "grid grid-cols-2 gap-3" : ""
          }`}
        >
          {onCancel ? (
            <ModalActionButton
              type="button"
              fullWidth
              variant="secondary"
              size="roomy"
              onClick={onCancel}
              disabled={cancelDisabled}
            >
              {cancelLabel ?? t("common.cancel", "Cancel")}
            </ModalActionButton>
          ) : null}
          <ModalActionButton
            type="button"
            fullWidth
            variant="solid"
            size="roomy"
            onClick={() => void onSave()}
            disabled={saveDisabled}
          >
            {saveLabel ?? t("common.save", "Save")}
          </ModalActionButton>
        </ModalFooter>
      </>
    </AppModal>
  );
}
