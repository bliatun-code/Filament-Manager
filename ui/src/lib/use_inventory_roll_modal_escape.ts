import { useEffect } from "react";

export function useInventoryRollModalEscape({
  closeRollModal,
  showRollModal,
}: {
  closeRollModal: () => void;
  showRollModal: boolean;
}) {
  useEffect(() => {
    if (!showRollModal) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRollModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeRollModal, showRollModal]);
}
