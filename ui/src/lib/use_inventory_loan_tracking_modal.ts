import { useCallback, useState } from "react";
import type { useI18n } from "./i18n";
import type { InventorySpool } from "./inventory_list_model";

type InventoryLoanTrackingModalInput = {
  canUseClientHostWrite: () => boolean;
  clientReadOnly: boolean;
  ensureLocalWriteAllowed: () => boolean;
  loanTrackingCandidates: InventorySpool[];
  reloadActiveLoans: () => Promise<void>;
  reloadPrinterOverview: () => Promise<void>;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  reloadSpools: () => Promise<void>;
  selectedSpool: InventorySpool | null;
  setInfoMessage: (message: string | null) => void;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryLoanTrackingModal({
  canUseClientHostWrite,
  clientReadOnly,
  ensureLocalWriteAllowed,
  loanTrackingCandidates,
  reloadActiveLoans,
  reloadPrinterOverview,
  reloadSpoolDetail,
  reloadSpools,
  selectedSpool,
  setInfoMessage,
  t,
}: InventoryLoanTrackingModalInput) {
  const [showLoanTrackingModal, setShowLoanTrackingModal] = useState(false);
  const [loanTrackingSpoolId, setLoanTrackingSpoolId] = useState<string | null>(null);

  const closeLoanTrackingModal = useCallback(() => {
    setShowLoanTrackingModal(false);
    setLoanTrackingSpoolId(null);
  }, []);

  const openLoanTrackingModal = useCallback(() => {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const preferredSpool =
      selectedSpool && loanTrackingCandidates.some((spool) => spool.id === selectedSpool.id)
        ? selectedSpool
        : loanTrackingCandidates[0] ?? null;
    setLoanTrackingSpoolId(preferredSpool?.id ?? null);
    setShowLoanTrackingModal(true);
  }, [
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    loanTrackingCandidates,
    selectedSpool,
  ]);

  const handleLoanCreated = useCallback(
    async ({ spoolId }: { spoolId: string }) => {
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
      await reloadSpoolDetail(spoolId);
      setInfoMessage(t("inventory.loanCreated", "Loan created."));
    },
    [
      reloadActiveLoans,
      reloadPrinterOverview,
      reloadSpoolDetail,
      reloadSpools,
      setInfoMessage,
      t,
    ],
  );

  return {
    closeLoanTrackingModal,
    handleLoanCreated,
    loanTrackingSpoolId,
    openLoanTrackingModal,
    showLoanTrackingModal,
  };
}
