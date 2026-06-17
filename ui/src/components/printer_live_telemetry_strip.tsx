import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import type { PrinterLiveTelemetry } from "../lib/printer_live_telemetry";

type PrinterLiveTelemetryStripProps = {
  telemetry: PrinterLiveTelemetry;
};

function NozzleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M6.5 3.5h7l-.75 6.25L10 13.5 7.25 9.75 6.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path d="M8.4 15.2h3.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M7.2 17h5.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}

function BedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="M4 12.5h12" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M5.5 15h9" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path
        d="M6.5 4.2c-1 1.1-1 2.2 0 3.3M10 4.2c-1 1.1-1 2.2 0 3.3M13.5 4.2c-1 1.1-1 2.2 0 3.3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path
        d="M10 2.75c2.9 3.35 4.4 5.75 4.4 8.1a4.4 4.4 0 0 1-8.8 0C5.6 8.5 7.1 6.1 10 2.75Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path d="M7.8 11.15c.2 1.25 1.05 2 2.25 2.12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function PrinterPulseIcon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 rounded-full ${
        active
          ? "bg-emerald-500/90 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] dark:bg-emerald-300/90"
          : "bg-slate-400/70 dark:bg-slate-500"
      }`}
    />
  );
}

function TelemetrySegment({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="inline-flex min-h-7 items-center gap-1.5 border-l border-slate-300/70 pl-3 first:border-l-0 first:pl-0 dark:border-white/10">
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function PrinterLiveTelemetryStrip({ telemetry }: PrinterLiveTelemetryStripProps) {
  const { t } = useI18n();
  const printing = telemetry.state === "printing";
  const progressDetails = [telemetry.progressLabel, telemetry.remainingLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] leading-none text-slate-600 dark:text-slate-300">
      <TelemetrySegment
        icon={<PrinterPulseIcon active={printing} />}
        label={t("printers.liveTelemetryState", "Printer state")}
      >
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {telemetry.stateLabel}
        </span>
        {progressDetails ? (
          <span className="ml-1.5 text-slate-500 dark:text-slate-400">{progressDetails}</span>
        ) : null}
      </TelemetrySegment>

      {telemetry.nozzleTempLabel ? (
        <TelemetrySegment
          icon={<NozzleIcon />}
          label={t("printers.liveTelemetryNozzle", "Nozzle")}
        >
          <span className="uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {t("printers.liveTelemetryNozzle", "Nozzle")}
          </span>
          <span className="ml-1 font-semibold text-slate-800 dark:text-slate-100">
            {telemetry.nozzleTempLabel}
          </span>
        </TelemetrySegment>
      ) : null}

      {telemetry.bedTempLabel ? (
        <TelemetrySegment icon={<BedIcon />} label={t("printers.liveTelemetryBed", "Bed")}>
          <span className="uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {t("printers.liveTelemetryBed", "Bed")}
          </span>
          <span className="ml-1 font-semibold text-slate-800 dark:text-slate-100">
            {telemetry.bedTempLabel}
          </span>
        </TelemetrySegment>
      ) : null}

      {telemetry.humidity ? (
        <TelemetrySegment
          icon={<DropletIcon />}
          label={t("printers.liveTelemetryAmsHumidity", "AMS humidity")}
        >
          <span className="uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {t("printers.liveTelemetryAmsHumidityShort", "AMS")}
          </span>
          <span className="ml-1 font-semibold text-slate-800 dark:text-slate-100">
            {telemetry.humidity.letter}
          </span>
          <span className="ml-1 text-slate-500 dark:text-slate-400">
            {telemetry.humidity.toneLabel}
          </span>
          <span className="ml-1.5 inline-flex items-center gap-0.5" aria-label={telemetry.humidity.label}>
            {telemetry.humidity.scale.map((step) => (
              <span
                key={step.letter}
                className={`h-1 w-3 rounded-full ${
                  step.active
                    ? "bg-slate-600/70 dark:bg-slate-200/80"
                    : "bg-slate-300/55 dark:bg-slate-700"
                }`}
              />
            ))}
          </span>
          {telemetry.amsTempLabel ? (
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">
              {telemetry.amsTempLabel}
            </span>
          ) : null}
        </TelemetrySegment>
      ) : null}
    </div>
  );
}
