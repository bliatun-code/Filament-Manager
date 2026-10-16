import { useEffect, useState } from "react";
import {
  subscribeCatalogRefreshProgress,
  type CatalogRefreshProgressPayload,
} from "../lib/tauri_client";
import {
  getActiveCatalogRefreshOperation,
  updateCatalogRefreshOperation,
  type CatalogRefreshOperationKind,
} from "../lib/catalog_refresh_operation";
import type { SettingsCatalogVendor } from "./settings_catalog_model";

function disposeCatalogRefreshProgressListener(unlisten: (() => void) | null) {
  try {
    unlisten?.();
  } catch {
    // Tauri can already have removed the listener while a late subscription resolves.
  }
}

export function useSettingsCatalogRefreshProgress({
  tauri,
}: {
  tauri: boolean;
}) {
  const operationOnMount = getActiveCatalogRefreshOperation();
  const [catalogRefreshVendor, setCatalogRefreshVendor] =
    useState<SettingsCatalogVendor>(operationOnMount?.vendor ?? "Bambu");
  const [catalogRefreshKind, setCatalogRefreshKind] =
    useState<CatalogRefreshOperationKind>(operationOnMount?.kind ?? "REFRESH");
  const [catalogRefreshUnavailable, setCatalogRefreshUnavailable] = useState(false);
  const [catalogRefreshMaterial, setCatalogRefreshMaterial] = useState<string | null>(null);
  const [catalogRefreshPhase, setCatalogRefreshPhase] = useState(
    operationOnMount?.phase ?? "PREPARE",
  );
  const [catalogRefreshStartedAt, setCatalogRefreshStartedAt] = useState<
    number | null
  >(operationOnMount?.startedAt ?? null);
  const [catalogRefreshElapsedSeconds, setCatalogRefreshElapsedSeconds] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (!tauri) {
      return;
    }

    void subscribeCatalogRefreshProgress((payload: CatalogRefreshProgressPayload) => {
      const operation = getActiveCatalogRefreshOperation();
      if (disposed || operation?.kind !== "AUDIT" || payload.vendor !== operation.vendor) {
        return;
      }
      setCatalogRefreshVendor(payload.vendor === "eSUN" ? "eSUN" : "Bambu");
      setCatalogRefreshPhase(payload.phase);
      updateCatalogRefreshOperation(operation.id, { phase: payload.phase });
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
    catalogRefreshKind,
    catalogRefreshUnavailable,
    catalogRefreshMaterial,
    catalogRefreshStartedAt,
    catalogRefreshVendor,
    setCatalogRefreshPhase,
    setCatalogRefreshKind,
    setCatalogRefreshUnavailable,
    setCatalogRefreshMaterial,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
  };
}
