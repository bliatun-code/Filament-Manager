import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { TrustedLanPairedBrowser } from "../lib/tauri_client";

type UseTrustedLanPairedBrowserRefSyncOptions = {
  trustedLanPairedBrowsers: TrustedLanPairedBrowser[];
  trustedLanPairedBrowsersRef: MutableRefObject<TrustedLanPairedBrowser[]>;
};

export function useTrustedLanPairedBrowserRefSync({
  trustedLanPairedBrowsers,
  trustedLanPairedBrowsersRef,
}: UseTrustedLanPairedBrowserRefSyncOptions) {
  useEffect(() => {
    trustedLanPairedBrowsersRef.current = trustedLanPairedBrowsers;
  }, [trustedLanPairedBrowsers, trustedLanPairedBrowsersRef]);
}
