import { generateQrDataUrl } from "../qr/qr_generator";

export type LabelPayload = {
  spoolId: string;
  filamentName: string;
  material: string;
  colorName: string;
  hexColor?: string | null;
  qrData: string;
};

export type LabelPrintRequest = {
  printerName?: string;
  copies?: number;
};

export async function buildLabelHtml(payload: LabelPayload): Promise<string> {
  const qrDataUrl = await generateQrDataUrl(payload.qrData, { size: 160 });
  const swatch = payload.hexColor ?? "#cbd5f5";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 12px; }
      .label { width: 300px; border: 1px solid #ddd; padding: 12px; }
      .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .title { font-size: 14px; font-weight: bold; margin-bottom: 6px; }
      .subtitle { font-size: 12px; color: #555; }
      .swatch { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #ccc; }
      img { display: block; }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="row">
        <div>
          <div class="title">${payload.filamentName}</div>
          <div class="subtitle">${payload.colorName} · ${payload.material}</div>
        </div>
        <div class="swatch" style="background:${swatch}"></div>
      </div>
      <div style="margin-top: 10px;">
        <img src="${qrDataUrl}" width="140" height="140" />
      </div>
      <div class="subtitle" style="margin-top: 6px;">${payload.spoolId}</div>
    </div>
  </body>
</html>`;
}

export async function printLabel(
  payload: LabelPayload,
  request: LabelPrintRequest = {},
): Promise<void> {
  const html = await buildLabelHtml(payload);
  const tauri = (window as any).__TAURI__;
  if (tauri?.invoke) {
    await tauri.invoke("print_label_html", {
      html,
      printerName: request.printerName ?? null,
      copies: request.copies ?? 1,
    });
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Unable to open print window");
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}
