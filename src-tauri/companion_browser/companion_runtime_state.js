export function companionOverlayStatus(state) {
  const context = state.statusOverlayContext;
  const matches = context && (state.detailOpen
    ? context.detailSpoolId === state.selectedSpoolId
    : state.activeTaskSheet && context.taskSheet === state.activeTaskSheet);
  const detailFeedback = state.detailOpen && state.detailFeedback?.spoolId === state.selectedSpoolId
    ? state.detailFeedback.message : "";
  if (detailFeedback && (!matches || state.statusTone === "success" || !state.statusMessage ||
    (!state.busy && state.statusTone === "default"))) {
    return { message: detailFeedback, tone: "success", busy: false };
  }
  return matches ? { message: state.statusMessage, tone: state.statusTone, busy: state.busy } : null;
}

export function createCompanionRuntimeState(options) {
  const { render, state } = options;
  const announceStatus = options?.announceStatus ?? (() => false);
  const setTimeoutRef = options?.setTimeoutRef ?? setTimeout;
  const clearTimeoutRef = options?.clearTimeoutRef ?? clearTimeout;
  const statusDurationMs = Number.isFinite(options?.statusDurationMs) ? options.statusDurationMs : 8000;
  let statusTimeoutId = null;

  function clearStatusTimeout() {
    if (statusTimeoutId == null) {
      return;
    }
    clearTimeoutRef(statusTimeoutId);
    statusTimeoutId = null;
  }

  function setStatus(message, tone = "default") {
    clearStatusTimeout();
    state.statusMessage = message;
    state.statusTone = tone;
    state.statusOverlayContext = state.detailOpen
      ? { detailSpoolId: state.selectedSpoolId }
      : state.activeTaskSheet ? { taskSheet: state.activeTaskSheet } : null;
    announceStatus(message, tone);
    render();
    if (tone === "success" && String(message || "").trim()) {
      statusTimeoutId = setTimeoutRef(() => {
        statusTimeoutId = null;
        if (state.statusMessage === message && state.statusTone === tone) {
          state.statusMessage = "";
          state.statusTone = "default";
          render();
        }
      }, statusDurationMs);
    }
  }

  function setBusy(nextBusy) {
    state.busy = nextBusy;
    render();
  }

  function setDetailFeedback(spoolId, message) {
    const normalizedSpoolId = String(spoolId || "").trim();
    const normalizedMessage = String(message || "").trim();
    if (!normalizedSpoolId || !normalizedMessage) {
      state.detailFeedback = null;
      return;
    }
    state.detailFeedback = {
      spoolId: normalizedSpoolId,
      message: normalizedMessage,
    };
  }

  function clearDetailFeedback(spoolId = "") {
    const normalizedSpoolId = String(spoolId || "").trim();
    if (!normalizedSpoolId) {
      state.detailFeedback = null;
      return;
    }
    if (state.detailFeedback?.spoolId === normalizedSpoolId) {
      state.detailFeedback = null;
    }
  }

  return {
    setStatus,
    setBusy,
    setDetailFeedback,
    clearDetailFeedback,
  };
}
