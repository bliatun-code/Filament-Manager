import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build } from "vite";

const UI_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BROWSER_ENTRY = fileURLToPath(
  new URL("../../test-fixtures/filament_label_browser_entry.ts", import.meta.url),
);
const QR_PAYLOAD =
  "http://192.0.2.10:4278/companion?spool_qr=v1%3Aspool_1775592053186";

async function buildBrowserHarnessDocument(): Promise<string> {
  const buildResult = await build({
    root: UI_ROOT,
    configFile: false,
    logLevel: "error",
    build: {
      emptyOutDir: false,
      minify: false,
      write: false,
      lib: {
        entry: BROWSER_ENTRY,
        formats: ["iife"],
        name: "FilamentLabelBrowserFixture",
      },
    },
  });
  const outputs = (Array.isArray(buildResult) ? buildResult : [buildResult])
    .flatMap((result) => ("output" in result ? result.output : []));
  const entryChunk = outputs.find(
    (output) => output.type === "chunk" && output.isEntry,
  );
  assert.ok(entryChunk && entryChunk.type === "chunk");
  const script = entryChunk.code.replaceAll("</script", "<\\/script");
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="UTF-8" /></head>
      <body><script>${script}</script></body>
    </html>`;
}

test(
  "production P-Touch PNG keeps a real ZXing-decodable QR before A4 and Letter embedding",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(await buildBrowserHarnessDocument(), {
        waitUntil: "load",
      });
      const evidence = await page.evaluate(async (payload) => {
        const fixture = (
          window as typeof window & {
            FilamentLabelBrowserFixture: {
              renderDecodeAndEmbedPtouchLabel: (value: string) => Promise<unknown>;
            };
          }
        ).FilamentLabelBrowserFixture;
        return fixture.renderDecodeAndEmbedPtouchLabel(payload);
      }, QR_PAYLOAD);

      assert.deepEqual(evidence, {
        decodedPayload: QR_PAYLOAD,
        labelHeight: 283,
        labelWidth: 709,
        pdfs: [
          {
            id: "a4",
            byteLength: (evidence as { pdfs: Array<{ byteLength: number }> }).pdfs[0]
              ?.byteLength,
            signature: "%PDF",
          },
          {
            id: "letter",
            byteLength: (evidence as { pdfs: Array<{ byteLength: number }> }).pdfs[1]
              ?.byteLength,
            signature: "%PDF",
          },
        ],
        pngByteLength: (evidence as { pngByteLength: number }).pngByteLength,
        pngSignature: [137, 80, 78, 71, 13, 10, 26, 10],
      });
      assert.ok((evidence as { pngByteLength: number }).pngByteLength > 1_000);
      assert.ok(
        (
          evidence as { pdfs: Array<{ byteLength: number }> }
        ).pdfs.every((pdf) => pdf.byteLength > 1_000),
      );
    } finally {
      await browser.close();
    }
  },
);
