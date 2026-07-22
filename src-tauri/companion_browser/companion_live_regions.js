export const COMPANION_POLITE_LIVE_REGION_ID = "companion-live-region-polite";
export const COMPANION_ASSERTIVE_LIVE_REGION_ID = "companion-live-region-assertive";

function normalizeMessage(message) {
  return String(message ?? "").trim();
}

export function createCompanionLiveRegionAnnouncer(options = {}) {
  const documentRef = options.documentRef;

  function regionForPriority(priority) {
    const regionId =
      priority === "assertive"
        ? COMPANION_ASSERTIVE_LIVE_REGION_ID
        : COMPANION_POLITE_LIVE_REGION_ID;
    return documentRef?.getElementById?.(regionId) || null;
  }

  function announce(message, priority = "polite") {
    const normalizedMessage = normalizeMessage(message);
    if (!normalizedMessage) {
      return false;
    }
    const region = regionForPriority(priority);
    if (!region) {
      return false;
    }
    if (region.textContent === normalizedMessage) {
      region.textContent = "";
    }
    region.textContent = normalizedMessage;
    return true;
  }

  function announceRuntimeStatus(message, tone = "default") {
    return announce(message, tone === "error" ? "assertive" : "polite");
  }

  return {
    announce,
    announceRuntimeStatus,
  };
}
