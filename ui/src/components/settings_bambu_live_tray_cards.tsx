import type { SettingsBambuLiveDiagnosticTrayCard } from "../pages/settings_bambu_live_diagnostics_model";
import { settingsTinyLabelClass } from "../lib/settings_ui_classes";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import { settingsBambuLiveTrayTechnicalDetailsId } from "./settings_bambu_live_dom_ids";

type SettingsBambuLiveTrayCardsProps = {
  moreCandidatesLabel: string;
  printerId: string;
  technicalDetailsHint: string;
  technicalDetailsLabel: string;
  trays: SettingsBambuLiveDiagnosticTrayCard[];
};

export function SettingsBambuLiveTrayCards({
  moreCandidatesLabel,
  printerId,
  technicalDetailsHint,
  technicalDetailsLabel,
  trays,
}: SettingsBambuLiveTrayCardsProps) {
  if (trays.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {trays.map((tray) => {
        const metadataItems = [
          tray.observedRfidLabel,
          tray.amsWeightLabel,
          tray.presetSignalLabel,
          tray.nozzleRangeLabel,
          tray.candidateCountText,
        ].filter(Boolean);
        const hasTechnicalDetails =
          metadataItems.length > 0 || tray.showCandidateCards || Boolean(tray.matchNote);
        const technicalDetailsId = settingsBambuLiveTrayTechnicalDetailsId(
          printerId,
          tray.key,
        );
        const technicalDetailsHintId = `${technicalDetailsId}-hint`;

        return (
          <div
            key={`${printerId}-${tray.key}`}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-950/50"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {tray.slotLabel}
              </div>
              {tray.hasReview ? (
                <span
                  title={tray.reviewTitle}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-1 text-[11px] font-bold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  !
                </span>
              ) : null}
            </div>
            <div className={`mt-1 ${settingsTinyLabelClass}`}>
              {tray.mqttTrayLabel}
            </div>
            <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
              {tray.statusText}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {tray.detailText}
            </div>
            <div className="mt-2 rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <InventorySwatchChip
                  className="h-3.5 w-3.5 rounded-sm"
                  swatchColor={tray.matchSwatchColor}
                  tone="tiny"
                />
                <span>{tray.matchLabel}</span>
              </div>
              <div className="mt-1">{tray.matchDescription}</div>
            </div>
            {hasTechnicalDetails ? (
              <details
                id={technicalDetailsId}
                className="mt-2 rounded-md border border-slate-200/80 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/50"
              >
                <summary
                  className="cursor-pointer px-2 py-1.5 text-[11px] text-slate-600 marker:text-slate-400 hover:text-slate-900 dark:text-slate-300 dark:marker:text-slate-500 dark:hover:text-slate-100"
                  aria-label={`${technicalDetailsLabel}: ${tray.slotLabel}`}
                  aria-describedby={technicalDetailsHintId}
                >
                  <span className="font-semibold">{technicalDetailsLabel}</span>
                </summary>
                <div className="border-t border-slate-200/80 px-2 py-2 dark:border-slate-700">
                  <div
                    id={technicalDetailsHintId}
                    className="mb-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400"
                  >
                    {technicalDetailsHint}
                  </div>
                  {metadataItems.length > 0 ? (
                    <div className="break-all text-[10px] text-slate-500 dark:text-slate-400">
                      {metadataItems.join(" · ")}
                    </div>
                  ) : null}
                  {tray.showCandidateCards ? (
                    <div className="mt-2 space-y-1.5">
                      {tray.candidates.map((candidate) => (
                        <div
                          key={candidate.key}
                          className="flex items-center gap-2 rounded border border-slate-200/80 bg-white/70 px-2 py-1 dark:border-slate-700 dark:bg-slate-950/40"
                        >
                          <InventorySwatchChip
                            className="h-3 w-3 rounded-sm"
                            swatchColor={candidate.swatchColor}
                            tone="tiny"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] font-medium text-slate-700 dark:text-slate-200">
                              {candidate.title}
                            </div>
                            <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                              {candidate.subtitle}
                            </div>
                          </div>
                        </div>
                      ))}
                      {tray.hasMoreCandidates ? (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {moreCandidatesLabel}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {tray.matchNote ? (
                    <div className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                      {tray.matchNote}
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
