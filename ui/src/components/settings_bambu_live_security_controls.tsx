import { semanticChipClass, type SemanticChipTone } from "../lib/chip_styles";
import type {
  BambuAccessCodeAction,
  BambuTlsTrustAction,
  BambuTlsTrustState,
} from "../lib/tauri_client";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";

type SettingsBambuLiveSecurityControlsProps = {
  accessCode: string;
  accessCodeAction: BambuAccessCodeAction;
  accessCodeConfigured: boolean;
  accessCodeInputId: string;
  canCheckIdentity: boolean;
  disabled: boolean;
  liveEnabled: boolean;
  noteId: string;
  readOnlyHostManaged: boolean;
  tlsCertificateFingerprint: string | null;
  tlsIdentityReady: boolean;
  tlsTrustAction: BambuTlsTrustAction;
  tlsTrustState: BambuTlsTrustState;
  t: (key: string, fallback?: string) => string;
  onAccessCodeActionChange: (value: BambuAccessCodeAction) => void;
  onAccessCodeChange: (value: string) => void;
  onCheckIdentity: () => void;
  onTlsTrustActionChange: (value: BambuTlsTrustAction) => void;
};

function trustTone(
  state: BambuTlsTrustState,
  action: BambuTlsTrustAction,
): SemanticChipTone {
  if (action !== "KEEP") {
    return "warning";
  }
  if (state === "TRUSTED") {
    return "success";
  }
  return state === "CHANGED" ? "danger" : "warning";
}

export function SettingsBambuLiveSecurityControls({
  accessCode,
  accessCodeAction,
  accessCodeConfigured,
  accessCodeInputId,
  canCheckIdentity,
  disabled,
  liveEnabled,
  noteId,
  readOnlyHostManaged,
  tlsCertificateFingerprint,
  tlsIdentityReady,
  tlsTrustAction,
  tlsTrustState,
  t,
  onAccessCodeActionChange,
  onAccessCodeChange,
  onCheckIdentity,
  onTlsTrustActionChange,
}: SettingsBambuLiveSecurityControlsProps) {
  const hasPendingReplacement = accessCodeAction === "REPLACE";
  const hasPendingRemoval = accessCodeAction === "CLEAR";
  const accessCodeStatus = hasPendingRemoval
    ? t(
        "settings.bambuLiveAccessCodeClearPending",
        "The saved access code will be removed when you save. Live connections will pause until you enter a new code.",
      )
    : hasPendingReplacement
      ? accessCodeConfigured
        ? t(
            "settings.bambuLiveAccessCodeReplacePending",
            "The saved access code will be replaced when you save.",
          )
        : t(
            "settings.bambuLiveAccessCodeSavePending",
            "The access code will be saved securely when you save.",
          )
      : accessCodeConfigured
        ? t("settings.bambuLiveAccessCodeSaved", "Access code saved securely")
        : t("settings.bambuLiveAccessCodeMissing", "No access code saved");
  const trustLabel =
    tlsTrustAction === "TRUST_CURRENT"
      ? t("settings.bambuTlsTrustPending", "Trust pending")
      : tlsTrustAction === "CLEAR"
        ? t("settings.bambuTlsClearPending", "Trust removal pending")
        : tlsTrustState === "TRUSTED"
          ? t("settings.bambuTlsTrustTrusted", "Trusted")
          : tlsTrustState === "CHANGED"
            ? t("settings.bambuTlsTrustChanged", "Identity changed")
            : t("settings.bambuTlsTrustUnpaired", "Not trusted yet");
  const trustHint =
    tlsTrustAction === "TRUST_CURRENT"
      ? t(
          "settings.bambuTlsTrustPendingHint",
          "This printer identity will be trusted when you save.",
        )
      : tlsTrustAction === "CLEAR"
        ? t(
            "settings.bambuTlsClearPendingHint",
            "Trust will be removed when you save. Live connections will stay blocked until you trust the printer again.",
          )
        : tlsTrustState === "TRUSTED"
          ? t(
              "settings.bambuTlsTrustTrustedHint",
              "The printer certificate matches the saved identity.",
            )
          : tlsTrustState === "CHANGED"
            ? t(
                "settings.bambuTlsTrustChangedHint",
                "The printer identity changed. The connection stopped before the access code was sent.",
              )
            : t(
                "settings.bambuTlsTrustUnpairedHint",
                "The access code will not be sent until you explicitly trust this printer identity.",
              );
  const canTrustCurrent =
    tlsIdentityReady &&
    tlsTrustAction !== "TRUST_CURRENT" &&
    tlsTrustState !== "TRUSTED";

  function handleAccessCodeChange(value: string) {
    onAccessCodeChange(value);
    onAccessCodeActionChange(value.trim() ? "REPLACE" : "KEEP");
  }

  function keepSavedAccessCode() {
    onAccessCodeChange("");
    onAccessCodeActionChange("KEEP");
  }

  function removeSavedAccessCode() {
    onAccessCodeChange("");
    onAccessCodeActionChange("CLEAR");
  }

  return (
    <div
      className="mt-3 grid grid-cols-1 gap-3 min-[860px]:grid-cols-2"
      data-desktop-visual-qa-target="settings-bambu-live-security"
    >
      <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-950/35">
        <span className={`${settingsSectionLabelClass} block`}>
          {t("settings.bambuLiveAccessCode", "Access code")}
        </span>
        {readOnlyHostManaged ? (
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {accessCodeConfigured
              ? t(
                  "settings.bambuLiveAccessCodeHostConfigured",
                  "An access code is saved on the host desktop.",
                )
              : t(
                  "settings.bambuLiveAccessCodeHostMissing",
                  "No access code is saved on the host desktop.",
                )}
          </p>
        ) : (
          <>
            <label className="sr-only" htmlFor={accessCodeInputId}>
              {t("settings.bambuLiveAccessCode", "Access code")}
            </label>
            <input
              id={accessCodeInputId}
              type="password"
              value={accessCode}
              onChange={(event) => handleAccessCodeChange(event.target.value)}
              aria-describedby={noteId}
              className={`${settingsFormControlClass} mt-2`}
              placeholder={
                accessCodeConfigured && accessCodeAction === "KEEP"
                  ? t(
                      "settings.bambuLiveAccessCodeSavedPlaceholder",
                      "Saved securely — enter a new code to replace",
                    )
                  : t("settings.bambuLiveAccessCode", "Access code")
              }
              autoCapitalize="none"
              autoComplete="new-password"
              disabled={disabled}
              required={
                accessCodeAction === "REPLACE" ||
                (liveEnabled &&
                  !accessCodeConfigured &&
                  accessCodeAction === "KEEP")
              }
              spellCheck={false}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span
                role="status"
                className="text-xs leading-5 text-slate-600 dark:text-slate-300"
              >
                {accessCodeStatus}
              </span>
              {accessCodeConfigured ? (
                <div className="flex flex-wrap gap-2">
                  {accessCodeAction !== "KEEP" ? (
                    <button
                      type="button"
                      className={settingsActionButtonClass("neutral", "compact")}
                      onClick={keepSavedAccessCode}
                      disabled={disabled}
                    >
                      {t("settings.bambuLiveAccessCodeKeep", "Keep saved code")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={settingsActionButtonClass("dangerQuiet", "compact")}
                      onClick={removeSavedAccessCode}
                      disabled={disabled}
                    >
                      {t("settings.bambuLiveAccessCodeClear", "Remove saved code")}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div
        role={tlsTrustState === "CHANGED" && tlsTrustAction === "KEEP" ? "alert" : "status"}
        className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-950/35"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={settingsSectionLabelClass}>
            {t("settings.bambuTlsTrustTitle", "Printer identity")}
          </div>
          <span className={semanticChipClass(trustTone(tlsTrustState, tlsTrustAction))}>
            {trustLabel}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {trustHint}
        </p>
        {tlsCertificateFingerprint ? (
          <div className="mt-2">
            <div className={settingsSectionLabelClass}>
              {t("settings.bambuTlsFingerprint", "Certificate fingerprint")}
            </div>
            <code className="mt-1 block break-all text-xs text-slate-700 dark:text-slate-200">
              {tlsCertificateFingerprint}
            </code>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t(
              "settings.bambuTlsFingerprintUnavailable",
              "Save or check the printer connection to read its identity.",
            )}
          </p>
        )}
        {!readOnlyHostManaged ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={settingsActionButtonClass(
                tlsIdentityReady ? "neutral" : "primary",
                "compact",
              )}
              onClick={onCheckIdentity}
              disabled={disabled || !canCheckIdentity}
            >
              {t("settings.bambuTlsCheckCurrent", "Check identity")}
            </button>
            {canTrustCurrent ? (
              <button
                type="button"
                className={settingsActionButtonClass(
                  tlsTrustState === "CHANGED" ? "warning" : "primary",
                  "compact",
                )}
                onClick={() => onTlsTrustActionChange("TRUST_CURRENT")}
                disabled={disabled}
              >
                {tlsTrustState === "CHANGED"
                  ? t("settings.bambuTlsRetrustCurrent", "Trust new identity")
                  : t("settings.bambuTlsTrustCurrent", "Trust this identity")}
              </button>
            ) : null}
            {tlsTrustState === "TRUSTED" && tlsTrustAction === "KEEP" ? (
              <button
                type="button"
                className={settingsActionButtonClass("dangerQuiet", "compact")}
                onClick={() => onTlsTrustActionChange("CLEAR")}
                disabled={disabled}
              >
                {t("settings.bambuTlsForget", "Forget trusted identity")}
              </button>
            ) : null}
            {tlsTrustAction !== "KEEP" ? (
              <button
                type="button"
                className={settingsActionButtonClass("neutral", "compact")}
                onClick={() => onTlsTrustActionChange("KEEP")}
                disabled={disabled}
              >
                {t("settings.bambuTlsUndoTrustChange", "Undo trust change")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
