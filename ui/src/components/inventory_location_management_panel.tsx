import { useMemo, useState, type FormEvent } from "react";
import {
  inventoryLocationActionRows,
  normalizeInventoryLocationName,
  validInventoryLocationName,
  validateLocationMerge,
  type InventoryLocationActionState,
} from "../lib/inventory_location_model";
import type { InventoryLocationRow } from "../lib/tauri_location_client";
import { useI18n } from "../lib/i18n";
import { FeedbackBanner } from "./feedback_banner";
import { formInputChromeClassName } from "./form_control_class";
import { PageHeaderButton } from "./page_header_button";

const fieldLabelClassName =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400";
const destructiveButtonClassName =
  "inline-flex min-h-11 max-w-full items-center justify-center whitespace-normal rounded-lg border border-rose-300/80 bg-white px-3.5 py-2 text-center text-sm font-semibold text-rose-700 outline-none transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50 dark:border-rose-400/40 dark:bg-slate-900/70 dark:text-rose-200 dark:hover:bg-rose-500/10";

const activeLocationsHeadingId = "inventory-location-active-heading";
const mergeReviewButtonId = "inventory-location-review-merge";

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

type InventoryLocationArchiveConfirmationProps = {
  busy: boolean;
  locationName: string;
  onCancel: () => void;
  onConfirm: () => void;
  usageCount: number;
};

export function InventoryLocationArchiveConfirmation({
  busy,
  locationName,
  onCancel,
  onConfirm,
  usageCount,
}: InventoryLocationArchiveConfirmationProps) {
  const { t } = useI18n();

  return (
    <FeedbackBanner tone="warning" compact className="mt-2">
      <div className="font-semibold">
        {t("inventory.locationArchiveConfirmTitle", "Archive {name}?", {
          name: locationName,
        })}
      </div>
      <p className="mt-1">
        {t(
          "inventory.locationArchiveConfirmDetail",
          "{count, plural, =0 {No rolls are connected to this location} one {# connected roll keeps this location} other {# connected rolls keep this location}}. The location disappears from new choices, but can be restored later.",
          { count: usageCount },
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PageHeaderButton
          responsive={false}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {t("inventory.locationArchiveConfirm", "Archive location")}
        </PageHeaderButton>
        <PageHeaderButton
          responsive={false}
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
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
  usageByLocationId: ReadonlyMap<string, number>;
};

function locationDomId(locationId: string): string {
  return encodeURIComponent(locationId);
}

function locationActionDomId(action: "archive" | "rename" | "restore", locationId: string): string {
  return `inventory-location-${action}-${locationDomId(locationId)}`;
}

function focusAfterRender(elementId: string): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    document.getElementById(elementId)?.focus();
  });
}

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
  usageByLocationId,
}: InventoryLocationManagementPanelProps) {
  const { t } = useI18n();
  const mutationsAvailable = canMutate && mutationsSupported && source === "LIVE";
  const actionRows = useMemo(
    () => inventoryLocationActionRows(rows, mutationsAvailable),
    [mutationsAvailable, rows],
  );
  const activeGeneric = actionRows.filter((row) => row.activeGeneric);
  const archivedGeneric = actionRows.filter((row) => !row.activeGeneric);
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameName, setRenameName] = useState("");
  const [archiveConfirmationId, setArchiveConfirmationId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mergeConfirmationVisible, setMergeConfirmationVisible] = useState(false);
  const normalizedNewName = normalizeInventoryLocationName(newName);
  const normalizedRename = normalizeInventoryLocationName(renameName);

  const resetRename = () => {
    setRenameId("");
    setRenameName("");
  };

  const renderLocationRow = (row: InventoryLocationActionState) => {
    const usageCount = usageByLocationId.get(row.id) ?? 0;
    const renameInputId = `inventory-location-rename-${locationDomId(row.id)}`;
    const renameActionId = locationActionDomId("rename", row.id);
    const archiveActionId = locationActionDomId("archive", row.id);
    const restoreActionId = locationActionDomId("restore", row.id);
    const restoreConflictId = `inventory-location-restore-conflict-${locationDomId(row.id)}`;
    const editing = renameId === row.id;
    return (
      <div
        key={row.id}
        className="rounded-lg border border-slate-200/80 px-3 py-2.5 dark:border-slate-700/80"
      >
        {editing ? (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!row.canRename || !validInventoryLocationName(renameName)) return;
              void onRename(row.id, normalizedRename).then((renamed) => {
                if (renamed) {
                  resetRename();
                  focusAfterRender(renameActionId);
                }
              });
            }}
          >
            <label
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
              htmlFor={renameInputId}
            >
              <span>
                {t("inventory.locationRenameNamed", "Rename {name}", { name: row.name })}
              </span>
              <input
                id={renameInputId}
                className={`mt-1 w-full ${formInputChromeClassName}`}
                maxLength={120}
                value={renameName}
                disabled={busy || !row.canRename}
                onChange={(event) => setRenameName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <PageHeaderButton
                responsive={false}
                type="submit"
                disabled={busy || !row.canRename || !validInventoryLocationName(renameName)}
              >
                {t("common.save", "Save")}
              </PageHeaderButton>
              <PageHeaderButton
                responsive={false}
                type="button"
                disabled={busy}
                onClick={() => {
                  resetRename();
                  focusAfterRender(renameActionId);
                }}
              >
                {t("common.cancel", "Cancel")}
              </PageHeaderButton>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                {row.name}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.locationUsageCount",
                  "{count, plural, =0 {No connected rolls} one {# connected roll} other {# connected rolls}}",
                  { count: usageCount },
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {row.canRename ? (
                <PageHeaderButton
                  id={renameActionId}
                  responsive={false}
                  type="button"
                  disabled={busy}
                  aria-label={t("inventory.locationRenameNamed", "Rename {name}", {
                    name: row.name,
                  })}
                  onClick={() => {
                    setArchiveConfirmationId("");
                    setRenameId(row.id);
                    setRenameName(row.name);
                  }}
                >
                  {t("common.rename", "Rename")}
                </PageHeaderButton>
              ) : null}
              {row.canArchive ? (
                <PageHeaderButton
                  id={archiveActionId}
                  responsive={false}
                  type="button"
                  disabled={busy}
                  aria-label={t("inventory.locationArchiveNamed", "Archive {name}", {
                    name: row.name,
                  })}
                  onClick={() => {
                    resetRename();
                    setArchiveConfirmationId(row.id);
                  }}
                >
                  {t("common.archive", "Archive")}
                </PageHeaderButton>
              ) : null}
              {row.canRestore ? (
                <PageHeaderButton
                  id={restoreActionId}
                  responsive={false}
                  type="button"
                  disabled={busy}
                  aria-label={t("inventory.locationRestoreNamed", "Restore {name}", {
                    name: row.name,
                  })}
                  onClick={() => {
                    void onRestore(row.id).then((restored) => {
                      if (restored) focusAfterRender(renameActionId);
                    });
                  }}
                >
                  {t("common.restore", "Restore")}
                </PageHeaderButton>
              ) : null}
              {row.restoreBlockedByNameConflict ? (
                <span
                  id={restoreConflictId}
                  className="max-w-64 self-center text-xs leading-5 text-amber-700 dark:text-amber-300"
                >
                  {t(
                    "inventory.locationRestoreNameConflict",
                    "Rename before restoring: an active location already uses this name.",
                  )}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {archiveConfirmationId === row.id ? (
          <InventoryLocationArchiveConfirmation
            busy={busy}
            locationName={row.name}
            usageCount={usageCount}
            onCancel={() => {
              setArchiveConfirmationId("");
              focusAfterRender(archiveActionId);
            }}
            onConfirm={() => {
              void onArchive(row.id).then((archived) => {
                if (archived) {
                  setArchiveConfirmationId("");
                  focusAfterRender(activeLocationsHeadingId);
                }
              });
            }}
          />
        ) : null}
      </div>
    );
  };

  return (
    <section className="surface-card p-5" aria-labelledby="inventory-location-management-heading">
      <h2 id="inventory-location-management-heading" className="sr-only">
        {t("inventory.locationManagementTitle", "Manage locations")}
      </h2>
      {source === "LEGACY_HOST" || (source === "LIVE" && !mutationsSupported) ? (
        <FeedbackBanner tone="warning" className="mb-4">
          {t(
            "inventory.locationsLegacyHost",
            "This Host predates location objects. Existing placement names remain visible, but upgrade the Host before changing locations.",
          )}
        </FeedbackBanner>
      ) : source !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mb-4">
          {t(
            "inventory.locationsOffline",
            "Showing saved location data. Reconnect to the Host before changing locations.",
          )}
        </FeedbackBanner>
      ) : !canMutate ? (
        <FeedbackBanner tone="neutral" className="mb-4">
          {t(
            "inventory.locationsHostManaged",
            "Pair this client with the Host to manage library locations.",
          )}
        </FeedbackBanner>
      ) : null}

      <form
        className="surface-subtle p-3"
        aria-labelledby="inventory-location-create-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutationsAvailable || !validInventoryLocationName(newName)) return;
          void onCreate(normalizedNewName).then((created) => {
            if (created) setNewName("");
          });
        }}
      >
        <h3 id="inventory-location-create-heading" className={fieldLabelClassName}>
          {t("inventory.locationCreate", "Create location")}
        </h3>
        <label className="sr-only" htmlFor="inventory-location-new-name">
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

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={activeLocationsHeadingId}
            className={fieldLabelClassName}
            tabIndex={-1}
          >
            {t("inventory.locationActiveTitle", "Active storage locations")}
          </h3>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            {loading
              ? t("common.loading", "Loading…")
              : t(
                  "inventory.locationActiveCount",
                  "{count, plural, one {# active location} other {# active locations}}",
                  { count: activeGeneric.length },
                )}
          </span>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {activeGeneric.map(renderLocationRow)}
          {!loading && activeGeneric.length === 0 ? (
            <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 lg:col-span-2">
              {t(
                "inventory.locationsEmpty",
                "No saved locations yet. Create one above or type a new location while registering a roll.",
              )}
            </p>
          ) : null}
        </div>
      </div>

      {archivedGeneric.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-slate-200 bg-white/50 dark:border-slate-700 dark:bg-slate-950/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <h3 className="min-w-0 text-sm font-semibold">
              {t("inventory.locationPreviousTitle", "Previous locations")}
              <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.locationCount",
                  "{count, plural, one {# location} other {# locations}}",
                  { count: archivedGeneric.length },
                )}
              </span>
            </h3>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="border-t border-slate-200 px-3 pb-3 dark:border-slate-700">
            <p className="px-1 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {t(
                "inventory.locationArchiveHelp",
                "Archived locations disappear from new choices. Connected rolls keep the same location ID, and restoring makes that exact location available again.",
              )}
            </p>
            <div className="grid gap-2 lg:grid-cols-2">
              {archivedGeneric.map(renderLocationRow)}
            </div>
          </div>
        </details>
      ) : null}

      {activeGeneric.length >= 2 ? (
        <details
          className="group mt-4 rounded-xl border border-slate-200 bg-white/50 dark:border-slate-700 dark:bg-slate-950/20"
          onToggle={(event) => {
            if (!event.currentTarget.open) setMergeConfirmationVisible(false);
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <h3 className="text-sm font-semibold">
              {t("inventory.locationMergeAdvanced", "Advanced: merge locations")}
            </h3>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <form
            className="border-t border-slate-200 p-4 dark:border-slate-700"
            aria-label={t("inventory.locationMergeAdvanced", "Advanced: merge locations")}
            onSubmit={(event) => {
              event.preventDefault();
              if (!mutationsAvailable || !validateLocationMerge(actionRows, sourceId, targetId)) return;
              setMergeConfirmationVisible(true);
            }}
          >
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                "inventory.locationMergeHelp",
                "All current, home and child references move to the target. The source is archived and every affected roll gets a history event.",
              )}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select
                className={`w-full ${formInputChromeClassName}`}
                aria-label={t("inventory.locationMergeSource", "Source location")}
                value={sourceId}
                disabled={busy || !mutationsAvailable}
                onChange={(event) => {
                  setSourceId(event.target.value);
                  setMergeConfirmationVisible(false);
                }}
              >
                <option value="">{t("inventory.locationMergeSource", "Source location")}</option>
                {activeGeneric.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <select
                className={`w-full ${formInputChromeClassName}`}
                aria-label={t("inventory.locationMergeTarget", "Target location")}
                value={targetId}
                disabled={busy || !mutationsAvailable}
                onChange={(event) => {
                  setTargetId(event.target.value);
                  setMergeConfirmationVisible(false);
                }}
              >
                <option value="">{t("inventory.locationMergeTarget", "Target location")}</option>
                {activeGeneric.filter((row) => row.id !== sourceId).map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
              <button
                id={mergeReviewButtonId}
                className={destructiveButtonClassName}
                type="submit"
                disabled={busy || !mutationsAvailable || !validateLocationMerge(actionRows, sourceId, targetId)}
              >
                {t("inventory.locationReviewMerge", "Review merge")}
              </button>
            </div>
            {mergeConfirmationVisible && validateLocationMerge(actionRows, sourceId, targetId) ? (
              <InventoryLocationMergeConfirmation
                busy={busy}
                sourceName={activeGeneric.find((row) => row.id === sourceId)?.name ?? sourceId}
                targetName={activeGeneric.find((row) => row.id === targetId)?.name ?? targetId}
                onCancel={() => {
                  setMergeConfirmationVisible(false);
                  focusAfterRender(mergeReviewButtonId);
                }}
                onConfirm={() => {
                  void onMerge(sourceId, targetId).then((merged) => {
                    if (merged) {
                      const mergedTargetId = targetId;
                      setMergeConfirmationVisible(false);
                      setSourceId("");
                      setTargetId("");
                      focusAfterRender(locationActionDomId("rename", mergedTargetId));
                    }
                  });
                }}
              />
            ) : null}
          </form>
        </details>
      ) : null}
    </section>
  );
}
