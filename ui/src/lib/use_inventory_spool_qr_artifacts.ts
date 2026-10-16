import { useCallback, useEffect, useState } from "react";
import type { InventorySpool } from "./inventory_list_model";
import type { SpoolQrArtifacts } from "./spool_qr_artifacts";

type SpoolQrArtifactsModule = typeof import("./spool_qr_artifacts");

let spoolQrArtifactsModulePromise: Promise<SpoolQrArtifactsModule> | null = null;

function loadSpoolQrArtifactsModule(): Promise<SpoolQrArtifactsModule> {
  spoolQrArtifactsModulePromise ??= import("./spool_qr_artifacts").catch((error) => {
    spoolQrArtifactsModulePromise = null;
    throw error;
  });
  return spoolQrArtifactsModulePromise;
}

type InventorySpoolQrArtifactsInput = {
  clientHostBaseUrl: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
  clientReadOnly: boolean;
  selectedSpool: InventorySpool | null;
  showRollModal: boolean;
};

export function useInventorySpoolQrArtifacts({
  clientHostBaseUrl,
  clientLibraryId = null,
  clientTargetGeneration = null,
  clientReadOnly,
  selectedSpool,
  showRollModal,
}: InventorySpoolQrArtifactsInput) {
  const sourceKey = selectedSpool && showRollModal
    ? JSON.stringify([selectedSpool.id, clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration])
    : null;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
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
  }, [attempt, buildArtifacts, selectedSpool, showRollModal, sourceKey]);

  // Hide the previous spool or Host's image during the render that changes
  // authority, before the effect starts generating its replacement.
  const current = sourceKey !== null && rendered.sourceKey === sourceKey
    ? rendered
    : null;

  return {
    buildArtifacts,
    authorityKey: sourceKey,
    retry,
    companionShellUrl: current?.artifacts?.companionShellUrl ?? null,
    dataUrl: current?.artifacts?.qrDataUrl ?? null,
    loading: sourceKey !== null && (current?.loading ?? true),
    target: current?.artifacts?.qrTarget ?? null,
  };
}
