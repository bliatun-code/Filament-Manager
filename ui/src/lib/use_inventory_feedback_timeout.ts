import { useEffect, type Dispatch, type SetStateAction } from "react";

type InventoryFeedbackTimeoutInput = {
  infoMessage: string | null;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setRecentlyAddedSpoolId: Dispatch<SetStateAction<string | null>>;
};

export function useInventoryFeedbackTimeout({
  infoMessage,
  setInfoMessage,
  setRecentlyAddedSpoolId,
}: InventoryFeedbackTimeoutInput) {
  useEffect(() => {
    if (!infoMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setInfoMessage(null);
      setRecentlyAddedSpoolId(null);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [infoMessage, setInfoMessage, setRecentlyAddedSpoolId]);
}
