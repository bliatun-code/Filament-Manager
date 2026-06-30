import type {
  SettingsBambuLiveDiagnosticMetricCard,
  SettingsBambuLiveSignalQualityBucket,
} from "../pages/settings_bambu_live_diagnostics_model";
import { settingsTinyLabelClass } from "../lib/settings_ui_classes";

type SettingsBambuLiveDiagnosticsSummaryProps = {
  metrics: SettingsBambuLiveDiagnosticMetricCard[];
  printerId: string;
  signalQualityBuckets: SettingsBambuLiveSignalQualityBucket[];
};

export function SettingsBambuLiveDiagnosticsSummary({
  metrics,
  printerId,
  signalQualityBuckets,
}: SettingsBambuLiveDiagnosticsSummaryProps) {
  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={`${printerId}-${metric.key}`}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60"
          >
            <div className={settingsTinyLabelClass}>
              {metric.label}
            </div>
            <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      {signalQualityBuckets.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
          {signalQualityBuckets.map((bucket) => (
            <div
              key={`${printerId}-${bucket.label}`}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60"
            >
              <div className={settingsTinyLabelClass}>
                {bucket.label}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                {bucket.description}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {bucket.fields.slice(0, 6).map((field) => (
                  <span
                    key={`${printerId}-${bucket.label}-${field.path}`}
                    className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300"
                    title={field.path}
                  >
                    {field.path}
                  </span>
                ))}
                {bucket.fields.length > 6 ? (
                  <span className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
                    +{bucket.fields.length - 6}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
