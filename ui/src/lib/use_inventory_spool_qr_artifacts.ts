import { useCallback, useEffect, useState } from "react";
import type { InventorySpool } from "./inventory_list_model";
import type { SpoolQrArtifacts } from "./spool_qr_artifacts";

type SpoolQrArtifactsModule = typeof import("./spool_qr_artifacts");

let spoolQrArtifactsModulePromise: Promise<SpoolQrArtifactsModule> | null = null;

function loadSpoolQrArtifactsModule(): Promise<SpoolQrArtifactsModule> {
  spoolQrArtifactsModulePromise ??= import("./spool_qr_artifacts");
  return spoolQrArtifactsModulePromise;
}

type InventorySpoolQrArtifactsInput = {
  clientHostBaseUrl: string | null;
  clientReadOnly: boolean;
  selectedSpool: InventorySpool | null;
  showRollModal: boolean;
};

export function useInventorySpoolQrArtifacts({
  clientHostBaseUrl,
  clientReadOnly,
  selectedSpool,
  showRollModal,
}: InventorySpoolQrArtifactsInput) {
  const sourceKey = selectedSpool && showRollModal
    ? JSON.stringify([selectedSpool.id, clientReadOnly, clientHostBaseUrl])
    : null;
  const [rendered, setRendered] = useState<{
    sourceKey: string | null;
    loading: boolean;
    artifacts: SpoolQrArtifacts | null;
  }>({ sourceKey: null, loading: false, artifacts: null });

  const buildArtifacts = useCallback(async (spool: InventorySpool): Promise<SpoolQrArtifacts> => {
    const { buildSpoolQrArtifacts } = await loadSpoolQrArtifactsModule();
    return buildSpoolQrArtifacts({
      spoolId: spool.id,
      clientReadOnly,
      clientHostBaseUrl,
    });
  }, [clientHostBaseUrl, clientReadOnly]);

  useEffect(() => {
    if (!selectedSpool || !showRollModal || sourceKey === null) {
      setRendered({ sourceKey: null, loading: false, artifacts: null });
      return;
    }

    let cancelled = false;
    setRendered({ sourceKey, loading: true, artifacts: null });

    void buildArtifacts(selectedSpool)
      .then((artifacts) => {
        if (cancelled) {
          return;
        }
        setRendered({ sourceKey, loading: false, artifacts });
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setRendered({ sourceKey, loading: false, artifacts: null });
      });

    return () => {
      cancelled = true;
    };
  }, [buildArtifacts, selectedSpool, showRollModal, sourceKey]);

  // Hide the previous spool or Host's image during the render that changes
  // authority, before the effect starts generating its replacement.
  const current = sourceKey !== null && rendered.sourceKey === sourceKey
    ? rendered
    : null;

  return {
    buildArtifacts,
    companionShellUrl: current?.artifacts?.companionShellUrl ?? null,
    dataUrl: current?.artifacts?.qrDataUrl ?? null,
    loading: sourceKey !== null && (current?.loading ?? true),
    target: current?.artifacts?.qrTarget ?? null,
  };
}
