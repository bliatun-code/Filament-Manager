import { useMemo, useState } from "react";
import {
  inventoryLocationActionRows,
  normalizeInventoryLocationName,
  validInventoryLocationName,
  validateLocationMerge,
} from "../lib/inventory_location_model";
import type { InventoryLocationRow } from "../lib/tauri_location_client";
import { useI18n } from "../lib/i18n";
import { FeedbackBanner } from "./feedback_banner";
import { formInputChromeClassName } from "./form_control_class";
import { PageHeaderButton } from "./page_header_button";

const fieldLabelClassName =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400";
const tableHeaderClassName =
  "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const tableCellClassName =
  "border-t border-slate-200/80 px-3 py-3 align-middle text-sm text-slate-700 dark:border-slate-700/80 dark:text-slate-200";
const destructiveButtonClassName =
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-rose-300/80 bg-white px-3.5 py-2 text-sm font-semibold text-rose-700 outline-none transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50 dark:border-rose-400/40 dark:bg-slate-900/70 dark:text-rose-200 dark:hover:bg-rose-500/10";

type InventoryLocationMergeConfirmationProps = {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  sourceName: string;
  targetName: string;
};

export function InventoryLocationMergeConfirmation({
  busy,
  onCancel,
  onConfirm,
  sourceName,
  targetName,
}: InventoryLocationMergeConfirmationProps) {
  const { t } = useI18n();

  return (
    <FeedbackBanner tone="danger" className="mt-3">
      <div className="font-semibold">
        {t(
          "inventory.locationMergeConfirmTitle",
          "Merge {source} into {target}?",
          { source: sourceName, target: targetName },
        )}
      </div>
      <p className="mt-1">
        {t(
          "inventory.locationMergeConfirmDetail",
          "Every current, home and child reference moves to the target and the source is archived. This cannot be automatically undone.",
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={destructiveButtonClassName}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {t("inventory.locationMergeConfirm", "Confirm merge & archive")}
        </button>
        <PageHeaderButton responsive={false} type="button" disabled={busy} onClick={onCancel}>
          {t("common.cancel", "Cancel")}
        </PageHeaderButton>
      </div>
    </FeedbackBanner>
  );
}

type InventoryLocationManagementPanelProps = {
  busy: boolean;
  canMutate: boolean;
  loading: boolean;
  mutationsSupported: boolean;
  onArchive: (locationId: string) => Promise<boolean>;
  onCreate: (name: string) => Promise<boolean>;
  onMerge: (sourceId: string, targetId: string) => Promise<boolean>;
  onRename: (locationId: string, name: string) => Promise<boolean>;
  onRestore: (locationId: string) => Promise<boolean>;
  rows: InventoryLocationRow[];
  source: "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE";
};

export function InventoryLocationManagementPanel({
  busy,
  canMutate,
  loading,
  mutationsSupported,
  onArchive,
  onCreate,
  onMerge,
  onRename,
  onRestore,
  rows,
  source,
}: InventoryLocationManagementPanelProps) {
  const { t } = useI18n();
  const mutationsAvailable = canMutate && mutationsSupported && source === "LIVE";
  const actionRows = useMemo(
    () => inventoryLocationActionRows(rows, mutationsAvailable),
    [mutationsAvailable, rows],
  );
  const activeGeneric = actionRows.filter((row) => row.activeGeneric);
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameName, setRenameName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mergeConfirmationVisible, setMergeConfirmationVisible] = useState(false);
  const normalizedNewName = normalizeInventoryLocationName(newName);
  const normalizedRename = normalizeInventoryLocationName(renameName);

  return (
    <section className="surface-card p-5" aria-labelledby="inventory-location-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="inventory-location-heading" className="text-lg font-semibold text-slate-950 dark:text-white">
            {t("inventory.locationsTitle", "Locations")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            {t(
              "inventory.locationsHelp",
              "Names can change while immutable IDs keep roll placement and history stable.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
          {loading
            ? t("common.loading", "Loading…")
            : t("inventory.locationCount", "{count} locations", { count: rows.length })}
        </span>
      </div>

      {source === "LEGACY_HOST" || (source === "LIVE" && !mutationsSupported) ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "inventory.locationsLegacyHost",
            "This Host predates location objects. Existing placement names remain visible, but upgrade the Host before changing locations.",
          )}
        </FeedbackBanner>
      ) : source !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "inventory.locationsOffline",
            "Showing saved location data. Reconnect to the Host before changing locations.",
          )}
        </FeedbackBanner>
      ) : !canMutate ? (
        <FeedbackBanner tone="neutral" className="mt-4">
          {t(
            "inventory.locationsHostManaged",
            "Pair this client with the Host to manage library locations.",
          )}
        </FeedbackBanner>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <form
          className="surface-subtle p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!mutationsAvailable || !validInventoryLocationName(newName)) return;
            void onCreate(normalizedNewName).then((created) => {
              if (created) setNewName("");
            });
          }}
        >
          <label className={fieldLabelClassName} htmlFor="inventory-location-new-name">
            {t("inventory.locationCreate", "Create location")}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="inventory-location-new-name"
              className={`min-w-0 flex-1 ${formInputChromeClassName}`}
              maxLength={120}
              value={newName}
              disabled={busy || !mutationsAvailable}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("inventory.locationNamePlaceholder", "Example: Dry box 2")}
            />
            <PageHeaderButton
              className="shrink-0"
              responsive={false}
              variant="primary"
              type="submit"
              disabled={busy || !mutationsAvailable || !validInventoryLocationName(newName)}
            >
              {t("common.create", "Create")}
            </PageHeaderButton>
          </div>
        </form>

        <form
          className="surface-subtle p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!mutationsAvailable || !renameId || !validInventoryLocationName(renameName)) return;
            void onRename(renameId, normalizedRename).then((renamed) => {
              if (renamed) {
                setRenameId("");
                setRenameName("");
              }
            });
          }}
        >
          <label className={fieldLabelClassName} htmlFor="inventory-location-rename-select">
            {t("inventory.locationRename", "Rename location")}
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <select
              id="inventory-location-rename-select"
              className={`w-full ${formInputChromeClassName}`}
              value={renameId}
              disabled={busy || !mutationsAvailable}
              onChange={(event) => {
                const id = event.target.value;
                setRenameId(id);
                setRenameName(actionRows.find((row) => row.id === id)?.name ?? "");
              }}
            >
              <option value="">{t("inventory.locationChoose", "Choose location")}</option>
              {actionRows.filter((row) => row.canRename).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            <input
              className={`w-full ${formInputChromeClassName}`}
              aria-label={t("inventory.locationNewName", "New name")}
              maxLength={120}
              value={renameName}
              disabled={busy || !renameId || !mutationsAvailable}
              onChange={(event) => setRenameName(event.target.value)}
            />
            <PageHeaderButton
              responsive={false}
              type="submit"
              disabled={busy || !renameId || !validInventoryLocationName(renameName) || !mutationsAvailable}
            >
              {t("common.rename", "Rename")}
            </PageHeaderButton>
          </div>
        </form>
      </div>

      <form
        className="surface-subtle mt-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutationsAvailable || !validateLocationMerge(rows, sourceId, targetId)) return;
          setMergeConfirmationVisible(true);
        }}
      >
        <div className={fieldLabelClassName}>{t("inventory.locationMerge", "Merge locations")}</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "inventory.locationMergeHelp",
            "All current, home and child references move to the target. The source is archived and every affected roll gets a history event.",
          )}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select className={`w-full ${formInputChromeClassName}`} aria-label={t("inventory.locationMergeSource", "Source location")} value={sourceId} disabled={busy || !mutationsAvailable} onChange={(event) => {
            setSourceId(event.target.value);
            setMergeConfirmationVisible(false);
          }}>
            <option value="">{t("inventory.locationMergeSource", "Source location")}</option>
            {activeGeneric.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <select className={`w-full ${formInputChromeClassName}`} aria-label={t("inventory.locationMergeTarget", "Target location")} value={targetId} disabled={busy || !mutationsAvailable} onChange={(event) => {
            setTargetId(event.target.value);
            setMergeConfirmationVisible(false);
          }}>
            <option value="">{t("inventory.locationMergeTarget", "Target location")}</option>
            {activeGeneric.filter((row) => row.id !== sourceId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button className={destructiveButtonClassName} type="submit" disabled={busy || !mutationsAvailable || !validateLocationMerge(rows, sourceId, targetId)}>
            {t("inventory.locationReviewMerge", "Review merge")}
          </button>
        </div>
        {mergeConfirmationVisible && validateLocationMerge(rows, sourceId, targetId) ? (
          <InventoryLocationMergeConfirmation
            busy={busy}
            sourceName={activeGeneric.find((row) => row.id === sourceId)?.name ?? sourceId}
            targetName={activeGeneric.find((row) => row.id === targetId)?.name ?? targetId}
            onCancel={() => setMergeConfirmationVisible(false)}
            onConfirm={() => {
              setMergeConfirmationVisible(false);
              void onMerge(sourceId, targetId).then((merged) => {
                if (merged) {
                  setSourceId("");
                  setTargetId("");
                }
              });
            }}
          />
        ) : null}
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className={tableHeaderClassName}>{t("inventory.location", "Location")}</th>
              <th scope="col" className={tableHeaderClassName}>{t("inventory.locationType", "Type")}</th>
              <th scope="col" className={tableHeaderClassName}>{t("common.status", "Status")}</th>
              <th scope="col" className={`${tableHeaderClassName} text-right`}>{t("common.actions", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {actionRows.map((row) => (
              <tr key={row.id}>
                <td className={tableCellClassName}>
                  <div className="font-medium text-slate-950 dark:text-white">{row.name}</div>
                  <code className="text-xs text-slate-500">{row.id}</code>
                </td>
                <td className={tableCellClassName}>{row.systemOwned ? t("inventory.locationSystemOwned", "System-owned") : t("inventory.locationGeneric", "Storage")}</td>
                <td className={tableCellClassName}>{row.archived_at ? t("common.archived", "Archived") : t("common.active", "Active")}</td>
                <td className={tableCellClassName}>
                  <div className="flex justify-end gap-2">
                    {row.canArchive ? (
                      <PageHeaderButton responsive={false} type="button" disabled={busy} onClick={() => void onArchive(row.id)}>
                        {t("common.archive", "Archive")}
                      </PageHeaderButton>
                    ) : null}
                    {row.canRestore ? (
                      <PageHeaderButton responsive={false} type="button" disabled={busy} onClick={() => void onRestore(row.id)}>
                        {t("common.restore", "Restore")}
                      </PageHeaderButton>
                    ) : null}
                    {row.systemOwned ? <span className="text-xs text-slate-500">{t("inventory.locationSystemProtected", "Managed by printer or loan workflow")}</span> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && actionRows.length === 0 ? (
              <tr><td colSpan={4} className={`${tableCellClassName} py-8 text-center text-slate-500`}>{t("inventory.locationsEmpty", "No saved locations yet. Create one above or type a new location while registering a roll.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
