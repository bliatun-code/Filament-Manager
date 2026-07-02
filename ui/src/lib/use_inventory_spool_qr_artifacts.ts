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
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [companionShellUrl, setCompanionShellUrl] = useState<string | null>(null);

  const buildArtifacts = useCallback(async (spool: InventorySpool): Promise<SpoolQrArtifacts> => {
    const { buildSpoolQrArtifacts } = await loadSpoolQrArtifactsModule();
    return buildSpoolQrArtifacts({
      spoolId: spool.id,
      clientReadOnly,
      clientHostBaseUrl,
    });
  }, [clientHostBaseUrl, clientReadOnly]);

  useEffect(() => {
    if (!selectedSpool || !showRollModal) {
      setDataUrl(null);
      setLoading(false);
      setTarget(null);
      setCompanionShellUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void buildArtifacts(selectedSpool)
      .then(({ qrDataUrl, qrTarget, companionShellUrl: nextCompanionShellUrl }) => {
        if (cancelled) {
          return;
        }
        setDataUrl(qrDataUrl);
        setTarget(qrTarget);
        setCompanionShellUrl(nextCompanionShellUrl);
        setLoading(false);
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setDataUrl(null);
        setTarget(null);
        setCompanionShellUrl(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildArtifacts, selectedSpool, showRollModal]);

  return {
    buildArtifacts,
    companionShellUrl,
    dataUrl,
    loading,
    target,
  };
}
