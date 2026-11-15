export const MAX_WISHLIST_RECEIPT_QUANTITY: number;
export const WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY: string;
export function isConfirmedWishlistReceipt(value: unknown, quantity: number): boolean;

type Attempt = { requestId: string; retry: boolean };
type PendingReceipt = { requestId: string; payload: string; requiresReview: boolean; awaitingNative: boolean };
export function createWishlistReceiptAttempts(
  storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined,
): {
  get(scope: string): PendingReceipt | null | undefined;
  begin(
    scope: string,
    payload: string,
    hostSupportsRetries?: boolean,
    awaitingNative?: boolean,
  ): Attempt | { error: string };
  confirm(scope: string, requestId: string): void;
  reconcile(scope: string, requestId: string): boolean;
  reject(scope: string, attempt: Attempt, code: string | null | undefined, keyed?: boolean): void;
};
