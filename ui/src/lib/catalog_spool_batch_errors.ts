import { appErrorCode, commandErrorText } from "./error_text";
import type { I18nContextValue } from "./i18n";

export function catalogSpoolBatchErrorText(error: unknown, fallback: string, t: I18nContextValue["t"]): string {
  switch (appErrorCode(error)) {
    case "inventory.batch.invalid":
      return t("errors.catalogSpoolBatchInvalid", "The batch was not saved. Check the selected filaments, weight, owner and location. Use at most 100 rolls.");
    case "inventory.batch.conflict":
      return t("errors.catalogSpoolBatchConflict", "This batch ID belongs to a different request or library. Check inventory before registering another batch.");
    case "inventory.batch.host_unsupported":
      return t("errors.catalogSpoolBatchHostUnsupported", "Upgrade the Host to register batches safely. No rolls were sent.");
    case "inventory.batch.storage_failed":
      return t("errors.catalogSpoolBatchStorageFailed", "The batch recovery record could not be saved or read. Registration is paused to prevent duplicate rolls.");
    default:
      return commandErrorText(error, fallback, t);
  }
}
