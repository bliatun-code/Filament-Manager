export const MAX_WISHLIST_RECEIPT_QUANTITY = 100;
export const WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY = "wishlist-receipt-idempotency-v1";

/** @param {unknown} value @param {number} quantity */
export function isConfirmedWishlistReceipt(value, quantity) {
  const result = /** @type {{spool_ids?: unknown, received_quantity?: unknown, remaining_quantity?: unknown} | null} */ (value);
  return Array.isArray(result?.spool_ids) && result.spool_ids.length === quantity &&
    result.received_quantity === quantity && typeof result.remaining_quantity === "number" &&
    Number.isInteger(result.remaining_quantity) && result.remaining_quantity >= 0;
}

const STORAGE_PREFIX = "filament-manager.pending-wishlist-receipt:";
const definitiveRejections = new Set([
  "wishlist.receive.quantity_invalid",
  "wishlist.receive.quantity_too_large",
  "wishlist.receive.quantity_exceeds_remaining",
  "wishlist.receive.already_received",
  "wishlist.receive.request_id_invalid",
  "wishlist.receive.location_host_unsupported",
  "purchase_metadata.price_invalid",
  "purchase_metadata.currency_invalid",
  "purchase_metadata.currency_required",
  "purchase_metadata.price_required",
  "purchase_metadata.date_invalid",
  "purchase_metadata.batch_code_too_long",
  "purchase_metadata.supplier_reference_too_long",
  "purchase_metadata.type_invalid",
]);

function randomReceiptId() {
  // randomUUID is unavailable in a browser using trusted-LAN HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @typedef {{requestId: string, payload: string, requiresReview: boolean, awaitingNative: boolean}} PendingReceipt */

/** @param {() => Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined} storage */
export function createWishlistReceiptAttempts(storage = () => globalThis.sessionStorage) {
  /** @type {Map<string, PendingReceipt | null>} */
  const pending = new Map();
  const sending = new Set();

  /** @param {string} scope */
  function get(scope) {
    if (pending.has(scope)) return pending.get(scope);
    try {
      const value = JSON.parse(storage()?.getItem(STORAGE_PREFIX + scope) ?? "null");
      if (typeof value?.requestId === "string" && typeof value.payload === "string" &&
          typeof value.requiresReview === "boolean" && typeof value.awaitingNative === "boolean") {
        return /** @type {PendingReceipt} */ (value);
      }
    } catch {
      // The in-memory record still protects this page when storage is unavailable.
    }
    return null;
  }

  /**
   * @param {string} scope
   * @param {PendingReceipt | null} value
   */
  function save(scope, value) {
    pending.set(scope, value);
    try {
      const target = storage();
      if (value) target?.setItem(STORAGE_PREFIX + scope, JSON.stringify(value));
      else target?.removeItem(STORAGE_PREFIX + scope);
    } catch {
      // Keep the page-local state if the platform disables browser storage.
    }
  }

  return {
    get,
    /**
     * @param {string} scope
     * @param {string} payload
     * @param {boolean} hostSupportsRetries
     * @param {boolean} awaitingNative
     * @returns {{error: string} | {requestId: string, retry: boolean}}
     */
    begin(scope, payload, hostSupportsRetries = true, awaitingNative = false) {
      const previous = get(scope);
      if (previous) {
        if (previous.requiresReview || previous.awaitingNative) {
          return { error: "wishlist.receive.outcome_unknown_legacy_host" };
        }
        if (!hostSupportsRetries) {
          save(scope, { ...previous, requiresReview: true });
          return { error: "wishlist.receive.retry_host_unsupported" };
        }
        if (payload !== previous.payload) return { error: "wishlist.receive.pending_changed" };
        sending.add(previous.requestId);
        return { requestId: previous.requestId, retry: true };
      }
      const requestId = randomReceiptId();
      sending.add(requestId);
      save(scope, { requestId, payload, requiresReview: !hostSupportsRetries, awaitingNative });
      return { requestId, retry: false };
    },
    /** @param {string} scope @param {string} requestId */
    confirm(scope, requestId) {
      sending.delete(requestId);
      if (get(scope)?.requestId === requestId) save(scope, null);
    },
    /** @param {string} scope @param {string} requestId */
    reconcile(scope, requestId) {
      const current = get(scope);
      if (current?.requestId !== requestId || sending.has(requestId) ||
          (!current.requiresReview && !current.awaitingNative)) return false;
      save(scope, null);
      return true;
    },
    /**
     * @param {string} scope
     * @param {{requestId: string, retry: boolean}} attempt
     * @param {string | null | undefined} code
     * @param {boolean} keyed
     */
    reject(scope, attempt, code, keyed = true) {
      sending.delete(attempt.requestId);
      const current = get(scope);
      if (!current || current.requestId !== attempt.requestId) return;
      if (definitiveRejections.has(code ?? "") || code?.startsWith("inventory.location.") ||
          (!attempt.retry && ["common.invalid_request", "common.unauthorized",
            "common.not_found", "common.forbidden", "wishlist.receive.not_sent"].includes(code ?? ""))) {
        save(scope, null);
      } else if (!keyed || code === "wishlist.receive.outcome_unknown_legacy_host" ||
          code === "wishlist.receive.retry_host_unsupported" || code === "wishlist.receive.request_conflict" ||
          (attempt.retry && code === "common.not_found")) {
        save(scope, { ...current, requiresReview: true, awaitingNative: false });
      } else if (current.awaitingNative && code === "wishlist.receive.outcome_unknown") {
        save(scope, { ...current, awaitingNative: false });
      }
    },
  };
}
