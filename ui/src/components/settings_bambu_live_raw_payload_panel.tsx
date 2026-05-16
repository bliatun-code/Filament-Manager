import { copyTextToClipboard } from "../lib/clipboard";
import { toErrorMessage } from "../lib/error_text";
import { useI18n } from "../lib/i18n";
import { formatDiagnosticJson } from "../lib/settings_utils";

type SettingsBambuLiveRawPayloadPanelProps = {
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  rawPayload: unknown;
};

export function SettingsBambuLiveRawPayloadPanel({
  onCopyError,
  onCopySuccess,
  rawPayload,
}: SettingsBambuLiveRawPayloadPanelProps) {
  const { t } = useI18n();

  async function handleCopyRawPayload() {
    try {
      await copyTextToClipboard(formatDiagnosticJson(rawPayload));
      onCopySuccess(
        t("settings.bambuLiveRawPayloadCopied", "Raw live payload copied."),
      );
    } catch (copyError) {
      console.error(copyError);
      onCopyError(
        toErrorMessage(
          copyError,
          t(
            "settings.error.copyBambuLiveRawPayload",
            "Failed to copy raw live payload.",
          ),
        ),
      );
    }
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {t("settings.bambuLiveRawPayload", "Latest raw live payload")}
        </div>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          onClick={() => void handleCopyRawPayload()}
          disabled={!rawPayload}
        >
          {t("settings.bambuLiveCopyRawPayload", "Copy payload")}
        </button>
      </div>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-3 text-[11px] leading-5 text-emerald-200 dark:border-slate-700">
{formatDiagnosticJson(rawPayload)}
      </pre>
    </>
  );
}
