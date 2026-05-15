import type { Dispatch, SetStateAction } from "react";

type UseSettingsBambuLiveToggleActionsOptions = {
  ensureDiagnosticSession: (printerId: string) => void;
  setExpandedBambuDetailsPrinterId: Dispatch<SetStateAction<string | null>>;
  toggleBambuLiveCapture: (printerId: string, captureActive: boolean) => void;
};

export function useSettingsBambuLiveToggleActions({
  ensureDiagnosticSession,
  setExpandedBambuDetailsPrinterId,
  toggleBambuLiveCapture,
}: UseSettingsBambuLiveToggleActionsOptions) {
  function handleToggleBambuLiveDetails(printerId: string) {
    setExpandedBambuDetailsPrinterId((currentExpanded) => {
      const nextExpanded = currentExpanded === printerId ? null : printerId;
      if (nextExpanded !== printerId) {
        return nextExpanded;
      }
      ensureDiagnosticSession(printerId);

      return nextExpanded;
    });
  }

  function handleToggleBambuLiveCapture(printerId: string, captureActive: boolean) {
    toggleBambuLiveCapture(printerId, captureActive);
  }

  return {
    handleToggleBambuLiveCapture,
    handleToggleBambuLiveDetails,
  };
}
