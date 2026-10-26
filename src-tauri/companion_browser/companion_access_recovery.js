import { t } from "./companion_i18n.js";
import { companionIcon } from "./companion_icons.js";
import { renderFilamentSpool } from "./companion_visuals.js";
const ENDPOINTS = {
  request: "/api/v1/auth/recovery/request",
  status: "/api/v1/auth/recovery/status",
  confirm: "/api/v1/auth/recovery/confirm",
  cancel: "/api/v1/auth/recovery/cancel",
};

export function suggestedDeviceName(userAgent = "") {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\/|FxiOS\//.test(userAgent) ? "Firefox" : /Chrome\/|CriOS\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const device = /iPhone/.test(userAgent) ? "iPhone" : /iPad/.test(userAgent) ? "iPad" : /Android/.test(userAgent) ? "Android" : /Macintosh/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : "";
  return `${browser} ${device}`.trim();
}

export function renderAccessRecovery({ recovery = {}, locale = "en", escapeHtml, busy = false }) {
  const e = escapeHtml;
  const tr = (key, fallback, params) => t(locale, `access.${key}`, fallback, params);
  const phase = recovery.status || "idle";
  const waiting = phase === "pending";
  const approved = phase === "approved";
  const terminal = { rejected: tr("rejected", "The request was declined."), expired: tr("expired", "The request expired. Request access again."), locked: tr("locked", "Three incorrect attempts. Request access again."), cancelled: tr("cancelled", "The request was cancelled.") }[phase];
  const disabled = busy || recovery.busy ? "disabled" : "";
  return `<div class="companion-shell"><div class="companion-frame pairing-frame">
    <section class="hero-card pairing-card access-recovery" aria-busy="${Boolean(recovery.busy)}">
      <header class="access-brand"><strong>Filament Manager</strong><span>Companion</span></header>
      <div class="access-illustration" aria-hidden="true">${waiting ? companionIcon("clock") : renderFilamentSpool("#407EDB")}</div>
      <h1 class="hero-title" aria-live="polite">${e(waiting ? tr("pendingTitle", "Request sent") : approved ? tr("codeTitle", "Enter the code from the Host") : tr("title", "Access needs to be renewed"))}</h1>
      <p class="hero-copy">${e(waiting ? tr("pendingBody", "Access must be approved in Filament Manager on the Host computer.") : approved ? tr("codeHint", "Six digits. The code is valid for five minutes.") : tr("body", "Ask the Host to approve this browser again."))}</p>
      ${terminal ? `<p class="status-line" role="status">${e(terminal)}</p>` : ""}
      ${!waiting ? `<form data-access-form="${approved ? "confirm" : "request"}" class="stack">
        <label class="search-field" for="access-${approved ? "code" : "name"}"><span>${e(approved ? tr("codeLabel", "One-time code") : tr("deviceName", "Device name"))}</span>
          ${approved ? `<input id="access-code" class="text-input access-code" name="access-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required value="${e(recovery.code || "")}" aria-describedby="access-feedback" ${disabled}>` : `<input id="access-name" class="text-input" name="access-name" type="text" autocomplete="off" maxlength="80" required value="${e(recovery.deviceName || "")}" aria-describedby="access-name-hint" ${disabled}>`}
        </label>
        ${approved ? "" : `<p id="access-name-hint" class="section-copy">${e(tr("nameHint", "The name only helps the Host recognize your device."))}</p>`}
        <button class="primary-button" type="submit" ${disabled}>${companionIcon(approved ? "key" : "plus")}${e(approved ? tr("confirm", "Confirm access") : tr("request", "Request access again"))}</button>
      </form>` : `<p class="access-waiting" role="status">${e(tr("waiting", "Waiting for the Host…"))}</p>`}
      <p id="access-feedback" class="status-line" role="status" aria-live="polite" data-tone="${recovery.error ? "error" : "default"}">${e(recovery.error || "")}</p>
      ${waiting || approved ? `<button type="button" class="ghost-button" data-access-action="cancel" ${disabled}>${companionIcon("close")}${e(tr("cancel", "Cancel request"))}</button>` : ""}
      <details class="access-fallback"><summary>${e(tr("otherWay", "Use a pairing link instead"))}</summary><p class="section-copy">${e(tr("fallback", "Open a new pairing link or scan its QR code from Library & web app on the Host."))}</p><button type="button" class="ghost-button" data-action="refresh" ${disabled}>${e(t(locale, "shell.refresh", "Refresh"))}</button></details>
    </section></div></div>`;
}

export function createAccessRecoveryController({ state, render, onAuthenticated, fetchImpl = fetch, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const recovery = state.accessRecovery ||= { status: "idle", deviceName: suggestedDeviceName(globalThis.navigator?.userAgent || ""), code: "", error: "", busy: false };
  let timer = null;
  let polling = false;
  let generation = 0;
  async function call(action, payload) {
    const response = await fetchImpl(ENDPOINTS[action], { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-bfm-access-request": "1" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const data = await response.json();
    if (!response.ok) { const error = new Error(t(state.locale || "en", "errors.unavailable", "The service is temporarily unavailable.")); error.status = response.status; throw error; }
    return data;
  }
  function schedule() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!state.apiReady && ["pending", "approved"].includes(recovery.status)) timer = setTimer(() => { void restore(); }, 5000);
  }
  function apply(data) {
    recovery.status = ["pending", "approved", "rejected", "expired", "locked", "cancelled", "completed"].includes(data?.status) ? data.status : "expired";
    recovery.attemptsRemaining = data?.attempts_remaining;
  }
  async function restore() {
    if (state.apiReady || recovery.busy || polling) return;
    polling = true;
    const current = generation;
    try { const data = await call("status"); if (current === generation && !state.apiReady) { const changed = data.status !== recovery.status; apply(data); if (changed || recovery.errorKind !== "code") recovery.error = ""; render(); } }
    catch (error) {
      if (current === generation && !state.apiReady) {
        if (error.status === 401) { if (["pending", "approved"].includes(recovery.status)) recovery.status = "expired"; }
        else { recovery.error = t(state.locale || "en", "errors.unavailable", "The service is temporarily unavailable."); recovery.errorKind = "network"; }
        render();
      }
    } finally { polling = false; schedule(); }
  }
  async function submit(action, value) {
    if (recovery.busy || state.apiReady) return;
    generation++; recovery.busy = true; recovery.error = ""; recovery.errorKind = ""; render();
    try {
      const data = await call(action === "confirm" ? "confirm" : "request", action === "confirm" ? { code: value } : { device_name: value });
      if (data?.ok && action === "confirm") { recovery.code = ""; recovery.status = "completed"; await onAuthenticated(data); }
      else { apply(data); if (action === "confirm" && data.status === "approved") { recovery.code = ""; recovery.errorKind = "code"; recovery.error = t(state.locale || "en", "access.badCode", "Incorrect code. {count} attempts remain.", { count: data.attempts_remaining }); } }
    } catch (error) { recovery.error = error.message; if (error.status === 401) { recovery.status = "expired"; recovery.error = ""; } }
    finally { recovery.busy = false; render(); schedule(); }
  }
  async function cancel() {
    if (recovery.busy) return;
    generation++; recovery.busy = true; render();
    try { apply(await call("cancel")); recovery.code = ""; recovery.error = ""; }
    catch (error) { recovery.error = error.message; if(error.status===401) {recovery.status="expired";recovery.error="";} }
    finally { recovery.busy = false; render(); schedule(); }
  }
  function install(root) {
    root.addEventListener("input", event => { if (event.target.name === "access-name") recovery.deviceName = event.target.value; if (event.target.name === "access-code") recovery.code = event.target.value; });
    root.addEventListener("submit", event => {
      const action = event.target?.getAttribute?.("data-access-form"); if (!action) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const data = new FormData(event.target); void submit(action, String(data.get(action === "confirm" ? "access-code" : "access-name") || "").trim());
    }, true);
    root.addEventListener("click", event => { if (event.target.closest?.('[data-access-action="cancel"]')) void cancel(); });
  }
  return { restore, submit, cancel, install };
}
