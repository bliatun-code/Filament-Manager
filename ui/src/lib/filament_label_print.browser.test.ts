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
  "http://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_1775592053186";

function customLabelBrowserEntrySource(): string {
  return `
    export async function renderDecodeCustomLabel(payload, dimensions) {
      const qrDataUrl = await buildFilamentLabelQrDataUrl(payload);
      const labelPngDataUrl = await buildFilamentLabelPngDataUrl(
        {
          vendor: "Éléments Génériques et partenaires",
          material: "PLA-CF",
          filamentName: "Précision renforcée très longue série spéciale",
          colorName: "Brûlé d’été violet extrêmement détaillé (40402)",
          reference: "spool_1780069566047",
          qrDataUrl,
        },
        dimensions,
      );
      const image = await loadImage(labelPngDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D is unavailable.");
      }
      context.drawImage(image, 0, 0);
      return {
        decodedPayload: new BrowserQRCodeReader().decodeFromCanvas(canvas).getText(),
        labelHeight: image.naturalHeight,
        labelWidth: image.naturalWidth,
        pngByteLength: atob(labelPngDataUrl.slice(labelPngDataUrl.indexOf(",") + 1)).length,
      };
    }
  `;
}

async function buildBrowserHarnessDocument(): Promise<string> {
  const buildResult = await build({
    root: UI_ROOT,
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "filament-label-browser-test-extensions",
        transform(source, id) {
          return id.split("?", 1)[0] === BROWSER_ENTRY
            ? `${source}\n${customLabelBrowserEntrySource()}`
            : null;
        },
      },
    ],
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

test(
  "minimum and maximum custom PNGs keep the long production URL ZXing-decodable",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(await buildBrowserHarnessDocument(), {
        waitUntil: "load",
      });
      const evidence = await page.evaluate(async ({ payload }) => {
        const fixture = (
          window as typeof window & {
            FilamentLabelBrowserFixture: {
              renderDecodeCustomLabel: (
                value: string,
                dimensions: { widthMm: number; heightMm: number },
              ) => Promise<unknown>;
            };
          }
        ).FilamentLabelBrowserFixture;
        return Promise.all([
          fixture.renderDecodeCustomLabel(payload, { widthMm: 45, heightMm: 24 }),
          fixture.renderDecodeCustomLabel(payload, { widthMm: 150, heightMm: 80 }),
        ]);
      }, { payload: QR_PAYLOAD });

      assert.deepEqual(evidence, [
        {
          decodedPayload: QR_PAYLOAD,
          labelHeight: 283,
          labelWidth: 531,
          pngByteLength: (evidence as Array<{ pngByteLength: number }>)[0]
            ?.pngByteLength,
        },
        {
          decodedPayload: QR_PAYLOAD,
          labelHeight: 945,
          labelWidth: 1772,
          pngByteLength: (evidence as Array<{ pngByteLength: number }>)[1]
            ?.pngByteLength,
        },
      ]);
      assert.ok(
        (evidence as Array<{ pngByteLength: number }>).every(
          ({ pngByteLength }) => pngByteLength > 1_000,
        ),
      );
    } finally {
      await browser.close();
    }
  },
);
