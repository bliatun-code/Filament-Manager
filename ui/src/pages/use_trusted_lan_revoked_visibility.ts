import { useEffect } from "react";

type UseTrustedLanRevokedVisibilityInput = {
  revokedBrowserCount: number;
  setShowTrustedLanRevokedBrowsers: (show: boolean) => void;
};

export function useTrustedLanRevokedVisibility({
  revokedBrowserCount,
  setShowTrustedLanRevokedBrowsers,
}: UseTrustedLanRevokedVisibilityInput) {
  useEffect(() => {
    if (revokedBrowserCount === 0) {
      setShowTrustedLanRevokedBrowsers(false);
    }
  }, [revokedBrowserCount, setShowTrustedLanRevokedBrowsers]);
}
