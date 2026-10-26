import { Droplet, Heater, Thermometer } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import type { PrinterLiveTelemetry } from "../lib/printer_live_telemetry";

type PrinterLiveTelemetryStripProps = {
  telemetry: PrinterLiveTelemetry;
};

function NozzleIcon() { return <Thermometer size={16} strokeWidth={1.7} aria-hidden="true" />; }
function BedIcon() { return <Heater size={16} strokeWidth={1.7} aria-hidden="true" />; }
function DropletIcon() { return <Droplet size={16} strokeWidth={1.7} aria-hidden="true" />; }

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
    <div className="inline-flex min-h-7 items-center gap-1.5 border-l border-slate-300/70 pl-2 first:border-l-0 first:pl-0 dark:border-white/10">
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
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] leading-none text-slate-600 dark:text-slate-300">
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
          <span className="uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            {t("printers.liveTelemetryNozzle", "Nozzle")}
          </span>
          <span className="ml-1 font-semibold text-slate-800 dark:text-slate-100">
            {telemetry.nozzleTempLabel}
          </span>
        </TelemetrySegment>
      ) : null}

      {telemetry.bedTempLabel ? (
        <TelemetrySegment icon={<BedIcon />} label={t("printers.liveTelemetryBed", "Bed")}>
          <span className="uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
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
          <span className="uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            {t("printers.liveTelemetryAmsHumidityShort", "AMS")}
          </span>
          <span className="ml-1 font-semibold text-slate-800 dark:text-slate-100">
            {telemetry.humidity.letter}
          </span>
          <span className="ml-1 text-slate-500 dark:text-slate-400">
            {telemetry.humidity.toneLabel}
          </span>
          <span aria-hidden="true" className="ml-1.5 inline-flex items-center gap-0.5">
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
