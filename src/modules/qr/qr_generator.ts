type QrOptions = {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
};

export async function generateQrDataUrl(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  const { size = 240, margin = 2, errorCorrectionLevel = "M" } = options;
  const qr = await import("qrcode");
  return qr.toDataURL(payload, {
    width: size,
    margin,
    errorCorrectionLevel,
  });
}

export async function generateQrSvg(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  const { margin = 2, errorCorrectionLevel = "M" } = options;
  const qr = await import("qrcode");
  return qr.toString(payload, {
    type: "svg",
    margin,
    errorCorrectionLevel,
  });
}
