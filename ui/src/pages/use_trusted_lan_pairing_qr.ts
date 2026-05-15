import { useEffect, useState } from "react";

export function useTrustedLanPairingQr(pairingLink: string | null) {
  const [pairingQrDataUrl, setPairingQrDataUrl] = useState<string | null>(null);
  const [pairingQrBusy, setPairingQrBusy] = useState(false);
  const [pairingQrUnavailable, setPairingQrUnavailable] = useState(false);

  useEffect(() => {
    if (!pairingLink) {
      setPairingQrDataUrl(null);
      setPairingQrBusy(false);
      setPairingQrUnavailable(false);
      return;
    }

    let cancelled = false;
    setPairingQrDataUrl(null);
    setPairingQrBusy(true);
    setPairingQrUnavailable(false);

    void import("../lib/trusted_lan_pairing_qr")
      .then(({ buildTrustedLanPairingQrDataUrl }) =>
        buildTrustedLanPairingQrDataUrl(pairingLink),
      )
      .then((dataUrl) => {
        if (cancelled) {
          return;
        }
        setPairingQrDataUrl(dataUrl);
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setPairingQrUnavailable(true);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setPairingQrBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pairingLink]);

  return {
    pairingQrBusy,
    pairingQrDataUrl,
    pairingQrUnavailable,
  };
}
