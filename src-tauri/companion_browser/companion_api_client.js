import { t } from "./companion_i18n.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_LAN_MODE = "trusted-lan";

export async function readJsonResponse(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = null;
  }
  const message =
    parsed && typeof parsed.message === "string"
      ? parsed.message
      : `Request failed with status ${response.status}`;
  return { parsed, message };
}

export function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export function cloneInitWithFreshSession(init = {}, csrfToken = "") {
  const nextInit = { ...init };
  const method = String(nextInit.method || "GET").toUpperCase();
  const headers = normalizeHeaders(nextInit.headers);
  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }
  nextInit.headers = headers;
  return nextInit;
}

export function createCompanionApiClient(options) {
  const session = options?.session;
  if (!session || typeof session !== "object") {
    throw new Error("Companion API client requires mutable session state.");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const setStatus = options?.setStatus ?? (() => {});
  const render = options?.render ?? (() => {});

  function updateSessionMode(parsed) {
    const authMode = String(parsed?.auth_mode || "").trim();
    const accessMode = String(parsed?.access_mode || "").trim();
    if (authMode) {
      session.authMode = authMode;
    }
    if (accessMode) {
      session.accessMode = accessMode;
    } else if (authMode === "pairing-session") {
      session.accessMode = TRUSTED_LAN_MODE;
    }
  }

  function applyAuthenticatedSession(parsed) {
    updateSessionMode(parsed);
    session.apiReady = true;
    session.pairingRequired = false;
    session.csrfToken = parsed?.csrf_token || "";
  }

  async function readSessionStatus() {
    const response = await fetchImpl("/api/v1/auth/session", {
      credentials: "same-origin",
    });
    const { parsed, message } = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(message);
    }

    updateSessionMode(parsed);
    session.apiReady = Boolean(parsed?.authenticated);
    session.csrfToken = parsed?.csrf_token || "";
    session.pairingRequired =
      session.authMode === "pairing-session" &&
      !parsed?.authenticated &&
      !parsed?.can_renew;
    return parsed;
  }

  async function pairSession(token) {
    const trimmed = String(token || "").trim();
    if (!trimmed) {
      throw new Error("pairing token is required");
    }

    const response = await fetchImpl("/api/v1/auth/pair", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ pairing_token: trimmed }),
    });
    const { parsed, message } = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(message);
    }

    applyAuthenticatedSession(parsed);
    session.accessMode = TRUSTED_LAN_MODE;
    session.authMode = "pairing-session";
    return parsed;
  }

  async function renewSession() {
    const response = await fetchImpl("/api/v1/auth/renew", {
      method: "POST",
      credentials: "same-origin",
    });
    const { parsed, message } = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(message);
    }

    applyAuthenticatedSession(parsed);
    session.accessMode = TRUSTED_LAN_MODE;
    session.authMode = "pairing-session";
    return parsed;
  }

  async function restoreSessionIfPossible() {
    if (session.reauthPromise) {
      return session.reauthPromise;
    }

    session.reauthPromise = (async () => {
      setStatus(
        t(session.locale || "en", "status.trustedLanRenewing", "Trusted-LAN session expired. Trying paired browser renewal..."),
        "default",
      );
      try {
        await renewSession();
        setStatus(t(session.locale || "en", "status.trustedLanRestored", "Trusted-LAN session restored."), "success");
        return true;
      } catch (error) {
        session.apiReady = false;
        session.csrfToken = "";
        session.pairingRequired = true;
        setStatus(
          error.message ||
            t(
              session.locale || "en",
              "status.trustedLanReopen",
              "Trusted-LAN session expired. Open a new pairing link from desktop Settings.",
            ),
          "error",
        );
        return false;
      } finally {
        session.reauthPromise = null;
        render();
      }
    })();

    return session.reauthPromise;
  }

  async function fetchJson(url, init = {}) {
    const response = await fetchImpl(url, {
      credentials: "same-origin",
      ...init,
    });
    const { parsed, message } = await readJsonResponse(response);
    if (response.ok) {
      return parsed;
    }

    const shouldRetry =
      url !== "/api/v1/auth/pair" &&
      url !== "/api/v1/auth/renew" &&
      (response.status === 401 || response.status === 403) &&
      (await restoreSessionIfPossible());
    if (shouldRetry) {
      const retryResponse = await fetchImpl(url, {
        credentials: "same-origin",
        ...cloneInitWithFreshSession(init, session.csrfToken),
      });
      const retryResult = await readJsonResponse(retryResponse);
      if (retryResponse.ok) {
        return retryResult.parsed;
      }
      throw new Error(retryResult.message);
    }

    throw new Error(message);
  }

  return {
    pairSession,
    renewSession,
    readSessionStatus,
    restoreSessionIfPossible,
    fetchJson,
  };
}
