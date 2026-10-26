import { useI18n } from "../lib/i18n";
import { useCompanionAccessRequests } from "../lib/companion_access_requests";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

export function CompanionAccessRequestBanner({ onOpen }: { onOpen:()=>void }) {
  const { t }=useI18n();
  const state=useCompanionAccessRequests();
  const count=state?.requests.filter(r=>r.status==="pending").length || 0;
  if(!count) return null;
  return <aside className="surface-card mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
    <p role="status" aria-live="polite">{t("access.banner", "Browser access requests: {count}", {count})}</p>
    <button type="button" className={settingsActionButtonClass("accent")} onClick={onOpen}>{t("access.open", "View requests")}</button>
  </aside>;
}
