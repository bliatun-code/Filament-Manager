import QRCode from "qrcode";

type QrEncoder = {
  toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
};

export async function buildTrustedLanPairingQrDataUrl(
  pairingUrl: string,
  qrEncoder: QrEncoder = QRCode,
): Promise<string> {
  const normalized = pairingUrl.trim();
  if (!normalized) {
    throw new Error("Trusted-LAN pairing URL is required to build a QR code.");
  }

  return qrEncoder.toDataURL(normalized, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: {
      dark: "#0f172a",
      light: "#ffffffff",
    },
  });
}
