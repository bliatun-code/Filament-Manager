import { useCallback, useState } from "react";

export function useInventorySpoolSelection() {
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [showRollModal, setShowRollModal] = useState(false);
  const [showRfidCaptureModal, setShowRfidCaptureModal] = useState(false);

  const openRollModal = useCallback((spoolId: string) => {
    setSelectedSpoolId(spoolId);
    setShowRollModal(true);
  }, []);

  const closeRollModal = useCallback(() => {
    setShowRollModal(false);
  }, []);

  const openRfidCaptureModal = useCallback(() => {
    setShowRfidCaptureModal(true);
  }, []);

  const closeRfidCaptureModal = useCallback(() => {
    setShowRfidCaptureModal(false);
  }, []);

  return {
    closeRfidCaptureModal,
    closeRollModal,
    openRfidCaptureModal,
    openRollModal,
    selectedSpoolId,
    setSelectedSpoolId,
    setShowRfidCaptureModal,
    setShowRollModal,
    showRfidCaptureModal,
    showRollModal,
  };
}
