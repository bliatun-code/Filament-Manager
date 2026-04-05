import jsQR from "jsqr";

type ScanResult = {
  text: string;
  format: string;
};

type ScanError = {
  message: string;
};

export async function scanFromImageData(
  imageData: ImageData,
): Promise<ScanResult | ScanError | null> {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    const detector = new (window as unknown as { BarcodeDetector: any })
      .BarcodeDetector({ formats: ["qr_code"] });
    try {
      const results = await detector.detect(imageData);
      if (results.length === 0) {
        return null;
      }
      const first = results[0];
      return { text: first.rawValue ?? "", format: "qr_code" };
    } catch (error) {
      return { message: String(error) };
    }
  }

  const result = jsQR(imageData.data, imageData.width, imageData.height);
  if (!result) {
    return null;
  }
  return { text: result.data, format: "qr_code" };
}

export async function scanFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<ScanResult | ScanError | null> {
  const context = canvas.getContext("2d");
  if (!context) {
    return { message: "Canvas context unavailable" };
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return scanFromImageData(imageData);
}
