import QRCode from "qrcode";

type QrEncoder = {
  toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
};

export type FilamentLabelHtmlInput = {
  vendor: string;
  material: string;
  filamentName: string;
  colorName?: string | null;
  reference: string;
  qrPayload: string;
  qrDataUrl: string;
  labels: {
    vendor: string;
    material: string;
    filament: string;
    color: string;
    reference: string;
    qrPayload: string;
  };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function buildFilamentLabelQrDataUrl(
  payload: string,
  qrEncoder: QrEncoder = QRCode,
): Promise<string> {
  const normalized = payload.trim();
  if (!normalized) {
    throw new Error("QR payload is required to render label QR.");
  }
  return qrEncoder.toDataURL(normalized, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 512,
    color: {
      dark: "#0f172a",
      light: "#ffffffff",
    },
  });
}

export function buildFilamentLabelHtml(input: FilamentLabelHtmlInput): string {
  const filamentTitle = [input.colorName, input.filamentName].filter(Boolean)[0] || input.filamentName;
  return `
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #0f172a;">
    <div style="display: grid; grid-template-columns: 196px 1fr; gap: 16px; align-items: start; max-width: 760px;">
      <img src="${escapeHtml(input.qrDataUrl)}" alt="Filament QR" style="width: 196px; height: 196px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; image-rendering: pixelated; object-fit: contain;" />
      <div>
        <div style="font-size: 24px; font-weight: 700; margin-bottom: 6px;">${escapeHtml(filamentTitle || input.filamentName)}</div>
        <div style="font-size: 12px; line-height: 1.35;">
          <div><strong>${escapeHtml(input.labels.vendor)}:</strong> ${escapeHtml(input.vendor)}</div>
          <div><strong>${escapeHtml(input.labels.filament)}:</strong> ${escapeHtml(input.filamentName)}</div>
          ${
            input.colorName
              ? `<div><strong>${escapeHtml(input.labels.color)}:</strong> ${escapeHtml(input.colorName)}</div>`
              : ""
          }
        </div>
      </div>
    </div>
  </body>
</html>
  `.trim();
}
