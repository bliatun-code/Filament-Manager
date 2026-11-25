import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { formatInventoryOwnershipSummary, formatInventoryStatusLabel, formatRollReference, type InventoryLocationFilter } from "../lib/inventory_list_model";
import { createLocationSpoolReader, LocationSpoolTargetChanged, type LinkedSpoolPage } from "../lib/location_spool_data_source";
import type { LocationSpoolTarget } from "../lib/tauri_location_client";
import { formatGrams } from "../lib/weight_display";
import { FeedbackBanner } from "./feedback_banner";
import { formInputChromeClassName } from "./form_control_class";
import { PageHeaderButton } from "./page_header_button";

type Props = {
  location: InventoryLocationFilter;
  target: LocationSpoolTarget;
  onBack: () => void;
  onTargetChanged: () => void;
  onOpenInventory: (search: string, spoolId?: string) => void;
};

export function InventoryLocationSpoolsPanel({ location, target, onBack, onTargetChanged, onOpenInventory }: Props) {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const [session, setSession] = useState(() => ({ read: createLocationSpoolReader(target, location.id), revision: 0 }));
  const refresh = () => setSession(previous => ({
    read: createLocationSpoolReader(target, location.id), revision: previous.revision + 1,
  }));
  useLayoutEffect(() => { heading.current?.focus(); }, []);

  return (
    <section id="inventory-location-spools" aria-labelledby="inventory-location-spools-heading" className="surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="inventory-location-spools-heading" ref={heading} tabIndex={-1} className="text-lg font-semibold">
          {location.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <PageHeaderButton responsive={false} onClick={onBack}>{t("common.back", "Back")}</PageHeaderButton>
          <PageHeaderButton responsive={false} onClick={refresh}>
            {t("common.refresh", "Refresh")}
          </PageHeaderButton>
          <PageHeaderButton responsive={false} onClick={() => onOpenInventory(search)}>
            {t("dashboard.openInventory", "Open inventory")}
          </PageHeaderButton>
        </div>
      </div>
      <input
        type="search" className={`mt-4 w-full ${formInputChromeClassName}`}
        aria-label={t("inventory.searchPlaceholder", "Search by material, color, owner, location or QR")}
        placeholder={t("inventory.searchPlaceholder", "Search by material, color, owner, location or QR")}
        value={search} onChange={event => setSearch(event.currentTarget.value)}
      />
      <LocationSpoolResults key={JSON.stringify([search.trim(), session.revision])}
        read={session.read} search={search.trim()} onTargetChanged={onTargetChanged}
        onOpenRoll={id => onOpenInventory(search, id)} />
    </section>
  );
}

type ResultsProps = {
  read: ReturnType<typeof createLocationSpoolReader>;
  search: string;
  onTargetChanged: () => void;
  onOpenRoll: (id: string) => void;
};

function sameSnapshot(left: LinkedSpoolPage, right: LinkedSpoolPage) {
  return left.source === right.source && left.capturedAt === right.capturedAt &&
    left.total === right.total && left.matches === right.matches &&
    left.revisions.length === right.revisions.length &&
    left.revisions.every((value, index) => value === right.revisions[index]);
}

function LocationSpoolResults({ read, search, onTargetChanged, onOpenRoll }: ResultsProps) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState<LinkedSpoolPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  useLayoutEffect(() => () => { generation.current++; }, []);

  const load = useCallback(async (previous?: LinkedSpoolPage) => {
    const request = ++generation.current;
    setLoading(true);
    setFailed(false);
    try {
      let next = await read(search, previous?.rows.length ?? 0);
      if (request !== generation.current) return;
      if (previous && !sameSnapshot(previous, next)) {
        // Never append a newer revision, or mix offline and live pages.
        next = await read(search, 0);
      } else if (previous) {
        next = { ...next, rows: [...previous.rows, ...next.rows] };
      }
      if (request === generation.current) setPage(next);
    } catch (error) {
      if (request !== generation.current) return;
      if (error instanceof LocationSpoolTargetChanged) onTargetChanged();
      else {
        setPage(null);
        setFailed(true);
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [read, search, onTargetChanged]);

  useEffect(() => {
    if (!search) { void load(); return; }
    const timer = setTimeout(() => { void load(); }, 120);
    return () => clearTimeout(timer);
  }, [load, search]);

  const available = page && page.source !== "OFFLINE" ? page : null;
  return (
    <div className="mt-3" data-location-spool-total={available?.total} data-location-spool-matches={available?.matches}>
      {failed ? <FeedbackBanner tone="danger">{t("inventory.error.loadInventory", "Failed to load inventory.")}</FeedbackBanner> : null}
      {page?.source === "OFFLINE" ? (
        <FeedbackBanner tone="warning">{t("inventory.clientReadOnlyOffline", "Host is unavailable and no cached inventory snapshot is available yet.")}</FeedbackBanner>
      ) : null}
      {page?.source === "CACHED" ? (
        <FeedbackBanner tone="warning">{t("inventory.clientReadOnlyCached", "Host is unavailable. Showing the last cached inventory snapshot.")}</FeedbackBanner>
      ) : null}
      {available ? <>
        <p className="my-2 text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
          {search ? t("inventory.catalogMatchCount", "{count, plural, one {# match} other {# matches}}", { count: available.matches })
            : t("inventory.locationUsageCount", "{count, plural, =0 {No connected rolls} one {# connected roll} other {# connected rolls}}", { count: available.total })}
        </p>
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {available.rows.map(row => (
            <li key={row.id}>
              <button type="button" data-location-spool-id={row.id} onClick={() => onOpenRoll(row.id)}
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded px-2 py-2 text-left hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800">
                <span>
                  <span className="block font-semibold">{formatFilamentDisplayTitle(row.material, row.filamentName, row.colorName)}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{row.vendor} · {formatRollReference(row)}</span>
                </span>
                <span className="text-right text-sm">
                  <span className="block">{formatInventoryStatusLabel(t, row.status)} · {formatGrams(row.remainingGrams, "dash", locale)}</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {[row.location, row.ownershipType === "BORROWED_IN" && formatInventoryOwnershipSummary(t, row)].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {available.rows.length < available.matches ? (
          <PageHeaderButton responsive={false} disabled={loading} onClick={() => void load(available)}>
            {t("inventory.showMoreHistory", "Show more")}
          </PageHeaderButton>
        ) : null}
      </> : null}
      {loading ? <p role="status" className="mt-2 text-sm">{t("inventory.loading", "Loading spools...")}</p> : null}
    </div>
  );
}
