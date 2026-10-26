import { useI18n } from "../lib/i18n";
import { useEffect, useRef } from "react";
import { useCompanionAccessRequests } from "../lib/companion_access_requests";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

export function SettingsCompanionAccessRequests() {
  const {t,locale}=useI18n();
  const state=useCompanionAccessRequests();
  const panel = useRef<HTMLElement>(null);
  const reviewRequested=state?.reviewRequested;
  const setReviewRequested=state?.setReviewRequested;
  useEffect(()=>{
    if(!reviewRequested || !panel.current) return;
    panel.current.scrollIntoView({block:"nearest",behavior:"smooth"});
    panel.current.focus({preventScroll:true});
    setReviewRequested?.(false);
  },[reviewRequested,setReviewRequested]);
  if(!state || (!state.requests.length && !state.failed)) return null;
  return <section ref={panel} tabIndex={-1} id="companion-access-requests" aria-labelledby="companion-access-requests-title" className="settings-library-section scroll-mt-24">
    <h3 id="companion-access-requests-title" className="font-semibold">{t("access.hostTitle", "Browser access requests")}</h3>
    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("access.trust", "The name is supplied by the device. Only approve devices you recognize.")}</p>
    {state.failed ? <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{t("access.actionFailed", "The request changed or the service is unavailable. Try again.")}</p> : null}
    <ul className="mt-4 grid gap-3">
      {state.requests.map(request=><li key={request.id} className="surface-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="font-semibold"><bdi>{request.device_name}</bdi></h4><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{request.browser_hint} · <time dateTime={new Date(request.requested_at_ms).toISOString()}>{new Date(request.requested_at_ms).toLocaleTimeString(locale)}</time></p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={state.busy} className={settingsActionButtonClass()} onClick={()=>void state.decide(request.id,false)}>{t("access.reject", "Decline")}</button>
            {request.status==="pending" ? <button type="button" disabled={state.busy} className={settingsActionButtonClass("accent")} onClick={()=>void state.decide(request.id,true)}>{t("access.approve", "Allow access")}</button> : null}
          </div>
        </div>
        {request.confirmation_code ? <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700" role="status" aria-live="polite">
          <p className="text-sm">{t("access.shareCode", "Give this code to the person using the requesting device.")}</p>
          <p className="my-3 font-mono text-3xl font-semibold tracking-[.3em]" aria-label={`${t("access.codeLabel", "One-time code")}: ${request.confirmation_code.split("").join(" ")}`}>{request.confirmation_code}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("access.codeHint", "Six digits. The code is valid for five minutes.")}<br />{t("settings.trustedLanPairingExpiresAt", "Expires at")}: <time dateTime={new Date(request.expires_at_ms).toISOString()}>{new Date(request.expires_at_ms).toLocaleTimeString(locale)}</time></p>
        </div> : null}
      </li>)}
    </ul>
  </section>;
}
