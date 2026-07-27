import type { DashboardOnboardingState } from "../lib/dashboard_onboarding";
import { useI18n } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

type DashboardOnboardingChecklistProps = {
  onAddSpool: () => void;
  onDismiss: () => void;
  onOpenBackup: () => void;
  onOpenCompanion: () => void;
  onOpenImport: () => void;
  onOpenPrinters: () => void;
  state: DashboardOnboardingState;
};

export function DashboardOnboardingChecklist({
  onAddSpool,
  onDismiss,
  onOpenBackup,
  onOpenCompanion,
  onOpenImport,
  onOpenPrinters,
  state,
}: DashboardOnboardingChecklistProps) {
  const { t } = useI18n();
  const taskCopy = {
    INVENTORY: {
      body: t(
        "dashboard.onboardingInventoryBody",
        "Start with one spool, or import an existing inventory or backup.",
      ),
      title: t("dashboard.onboardingInventoryTitle", "Add or import inventory"),
    },
    PRINTER: {
      body: t(
        "dashboard.onboardingPrinterBody",
        "Add any supported printer. Bambu Live can be enabled when available.",
      ),
      title: t("dashboard.onboardingPrinterTitle", "Set up a printer"),
    },
    COMPANION: {
      body: t(
        "dashboard.onboardingCompanionBody",
        "Enable browser access on a trusted network, or pair this desktop with a host.",
      ),
      title: t("dashboard.onboardingCompanionTitle", "Set up browser access"),
    },
    BACKUP: {
      body: t(
        "dashboard.onboardingBackupBody",
        "Create a full backup after your library is ready.",
      ),
      title: t("dashboard.backup", "Backup"),
    },
  } as const;

  return (
    <section className="surface-card mt-6" aria-labelledby="dashboard-onboarding-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="section-eyebrow">
            {t("dashboard.onboardingEyebrow", "Getting started")}
          </div>
          <h2
            id="dashboard-onboarding-title"
            className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50"
          >
            {t("dashboard.onboardingTitle", "Finish setup")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              "dashboard.onboardingDescription",
              "Use the steps that fit your setup. Printer and browser access are optional.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className="rounded-full border border-sky-300/65 bg-sky-50/75 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-200"
            aria-live="polite"
          >
            {t(
              "dashboard.onboardingProgress",
              "{completed} of {total} complete",
              { completed: state.completedCount, total: state.totalCount },
            )}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className={settingsActionButtonClass()}
          >
            {t("dashboard.onboardingDismiss", "Dismiss checklist")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 xl:grid-cols-4">
        {state.tasks.map((task) => {
          const copy = taskCopy[task.id];
          return (
            <div
              key={task.id}
              className={`rounded-xl border px-4 py-4 ${
                task.complete
                  ? "border-emerald-200/85 bg-emerald-50/58 dark:border-emerald-400/25 dark:bg-emerald-500/[0.08]"
                  : "border-slate-200/90 bg-white/70 dark:border-slate-700/80 dark:bg-slate-950/35"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {copy.title}
                </div>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {task.complete
                    ? t("dashboard.onboardingComplete", "Complete")
                    : task.optional
                      ? t("dashboard.onboardingOptional", "Optional")
                      : t("dashboard.onboardingPending", "To do")}
                </span>
              </div>
              <p className="mt-2 min-h-12 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {copy.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {task.id === "INVENTORY" ? (
                  <>
                    <button
                      type="button"
                      onClick={onAddSpool}
                      className={settingsActionButtonClass("accent")}
                    >
                      {t("inventory.addSpoolAction", "Add spool")}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenImport}
                      className={settingsActionButtonClass()}
                    >
                      {t("settings.importDataFile", "Import backup/data file")}
                    </button>
                  </>
                ) : null}
                {task.id === "PRINTER" ? (
                  <button
                    type="button"
                    onClick={onOpenPrinters}
                    className={settingsActionButtonClass()}
                  >
                    {t("nav.printers", "Printers")}
                  </button>
                ) : null}
                {task.id === "COMPANION" ? (
                  <button
                    type="button"
                    onClick={onOpenCompanion}
                    className={settingsActionButtonClass()}
                  >
                    {t("dashboard.openCompanionSettings", "Open companion settings")}
                  </button>
                ) : null}
                {task.id === "BACKUP" ? (
                  <button
                    type="button"
                    onClick={onOpenBackup}
                    className={settingsActionButtonClass()}
                  >
                    {t("settings.backupTitle", "Backup")}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
