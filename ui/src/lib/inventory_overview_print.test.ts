import test from "node:test";
import assert from "node:assert/strict";

import { PDFDocument } from "pdf-lib";
import { buildInventoryLabelSheetPdfBase64 } from "./inventory_overview_print";
import {
  inventoryLabelSheetLayout,
  inventoryLabelSheetPaperProfile,
  type InventoryLabelSheetItem,
  type InventoryLabelSheetPaperId,
} from "./inventory_label_sheet_layout";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aSykAAAAASUVORK5CYII=";

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function labelItems(count: number): InventoryLabelSheetItem[] {
  return Array.from({ length: count }, (_, index) => ({
    reference: `spool-${index + 1}`,
    pngDataUrl: PNG_DATA_URL,
  }));
}

function assertNear(actual: number, expected: number, tolerance = 0.05): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

for (const paperId of ["a4", "letter"] as const) {
  test(`${paperId} label sheet uses a centered 3 by 10 grid without margin overflow`, () => {
    const layout = inventoryLabelSheetLayout(paperId);
    const rightMargin = layout.paper.widthMm - layout.offsetXmm - layout.contentWidthMm;
    const bottomMargin = layout.paper.heightMm - layout.offsetYmm - layout.contentHeightMm;

    assert.equal(layout.columns, 3);
    assert.equal(layout.rows, 10);
    assert.equal(layout.itemsPerPage, 30);
    assert.equal(layout.labelWidthMm, 60);
    assert.equal(layout.labelHeightMm, 24);
    assert.ok(layout.offsetXmm >= 8);
    assert.ok(layout.offsetYmm >= 8);
    assert.ok(rightMargin >= 8);
    assert.ok(bottomMargin >= 8);
    assertNear(layout.offsetXmm, rightMargin);
    assertNear(layout.offsetYmm, bottomMargin);
  });
}

test("buildInventoryLabelSheetPdfBase64 renders physical portrait A4 and Letter pages", async () => {
  for (const paperId of ["a4", "letter"] as InventoryLabelSheetPaperId[]) {
    const pdfBase64 = await buildInventoryLabelSheetPdfBase64(labelItems(1), paperId);
    const bytes = fromBase64(pdfBase64);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");

    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    const pageSize = pdf.getPage(0).getSize();
    const paper = inventoryLabelSheetPaperProfile(paperId);
    assertNear(pageSize.width, (paper.widthMm / 25.4) * 72);
    assertNear(pageSize.height, (paper.heightMm / 25.4) * 72);
    assert.ok(pageSize.height > pageSize.width);
  }
});

test("31 labels continue onto a second page for both paper formats", async () => {
  for (const paperId of ["a4", "letter"] as InventoryLabelSheetPaperId[]) {
    const pdfBase64 = await buildInventoryLabelSheetPdfBase64(labelItems(31), paperId);
    const pdf = await PDFDocument.load(fromBase64(pdfBase64));
    assert.equal(pdf.getPageCount(), 2);
  }
});

test("an empty label sheet still produces one printable page", async () => {
  const pdfBase64 = await buildInventoryLabelSheetPdfBase64([], "a4");
  const pdf = await PDFDocument.load(fromBase64(pdfBase64));
  assert.equal(pdf.getPageCount(), 1);
});

test("invalid label image data reports the affected spool", async () => {
  await assert.rejects(
    buildInventoryLabelSheetPdfBase64(
      [{ reference: "spool-broken", pngDataUrl: "data:text/plain;base64,bm9wZQ==" }],
      "a4",
    ),
    /spool-broken/,
  );
});
