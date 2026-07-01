import { useEffect, useState } from "react";
import {
  subscribeCatalogRefreshProgress,
  type CatalogRefreshProgressPayload,
} from "../lib/tauri_client";
import type { SettingsCatalogVendor } from "./settings_catalog_model";

function disposeCatalogRefreshProgressListener(unlisten: (() => void) | null) {
  try {
    unlisten?.();
  } catch {
    // Tauri can already have removed the listener while a late subscription resolves.
  }
}

export function useSettingsCatalogRefreshProgress({
  initialMessage,
  tauri,
}: {
  initialMessage: string;
  tauri: boolean;
}) {
  const [catalogRefreshVendor, setCatalogRefreshVendor] =
    useState<SettingsCatalogVendor>("Bambu");
  const [catalogRefreshProgressMessage, setCatalogRefreshProgressMessage] =
    useState(initialMessage);
  const [catalogRefreshPhase, setCatalogRefreshPhase] = useState("PREPARE");
  const [catalogRefreshStartedAt, setCatalogRefreshStartedAt] = useState<number | null>(null);
  const [catalogRefreshElapsedSeconds, setCatalogRefreshElapsedSeconds] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (!tauri) {
      return;
    }

    void subscribeCatalogRefreshProgress((payload: CatalogRefreshProgressPayload) => {
      if (disposed) {
        return;
      }
      setCatalogRefreshVendor(payload.vendor === "eSUN" ? "eSUN" : "Bambu");
      setCatalogRefreshPhase(payload.phase);
      setCatalogRefreshProgressMessage(payload.message);
    }).then((fn) => {
      if (disposed) {
        disposeCatalogRefreshProgressListener(fn);
        return;
      }
      unlisten = fn;
    }).catch(() => {});

    return () => {
      disposed = true;
      disposeCatalogRefreshProgressListener(unlisten);
    };
  }, [tauri]);

  useEffect(() => {
    if (catalogRefreshStartedAt === null) {
      setCatalogRefreshElapsedSeconds(0);
      return;
    }
    const tick = () => {
      setCatalogRefreshElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - catalogRefreshStartedAt) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [catalogRefreshStartedAt]);

  return {
    catalogRefreshElapsedSeconds,
    catalogRefreshPhase,
    catalogRefreshProgressMessage,
    catalogRefreshStartedAt,
    catalogRefreshVendor,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
  };
}
