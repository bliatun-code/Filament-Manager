import test from "node:test";
import assert from "node:assert/strict";

import { PDFDocument } from "pdf-lib";
import { buildInventoryOverviewPrintPdfBase64 } from "./inventory_overview_print";

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

test("buildInventoryOverviewPrintPdfBase64 renders a valid landscape A4 PDF with grouped rows", async () => {
  const pdfBase64 = await buildInventoryOverviewPrintPdfBase64(
    [
      {
        reference: "spool_1",
        vendor: "Bambu",
        material: "ABS",
        filamentName: "Basic",
        colorName: "Azure",
        homeLocation: "Shelf 1",
        swatchHex: "#3B82F6",
        qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aSykAAAAASUVORK5CYII=",
      },
      {
        reference: "spool_2",
        vendor: "eSUN",
        material: "PETG",
        filamentName: "PETG+",
        colorName: "Blue",
        homeLocation: "Shelf 2",
        swatchHex: "#2563EB",
        qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aSykAAAAASUVORK5CYII=",
      },
    ],
    {
      title: "Inventory",
      generatedAt: "Generated",
      empty: "No stock",
      groupMaterial: "Material group",
      vendor: "Vendor",
      material: "Material",
      filament: "Filament",
      homeLocation: "Home location",
      reference: "Reference",
    },
  );

  assert.ok(pdfBase64.length > 0);

  const bytes = fromBase64(pdfBase64);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");

  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 1);

  const first = pdf.getPage(0).getSize();
  assert.ok(first.width > first.height);
  assert.ok(Math.abs(first.width - 841.89) < 2);
  assert.ok(Math.abs(first.height - 595.28) < 2);
});

test("buildInventoryOverviewPrintPdfBase64 renders an empty-state PDF when no rows are supplied", async () => {
  const pdfBase64 = await buildInventoryOverviewPrintPdfBase64([], {
    title: "Inventory",
    generatedAt: "Generated",
    empty: "No stock",
    groupMaterial: "Material group",
    vendor: "Vendor",
    material: "Material",
    filament: "Filament",
    homeLocation: "Home location",
    reference: "Reference",
  });

  const bytes = fromBase64(pdfBase64);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});
