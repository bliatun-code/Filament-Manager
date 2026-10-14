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

test(
  "branded screen and monochrome tape QRs remain ZXing-decodable under modest camera sampling",
  { timeout: 60_000 },
  async () => {
    const payloads = [
      "http://192.168.1.50:4278/companion?spool_qr=v1%3AQR-22",
      QR_PAYLOAD,
      "https://filament-manager-0123456789abcdef01234567.local:4278/companion?spool_qr=v1%3Aspool_01234567-89ab-cdef-0123-456789abcdef",
    ];
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(await buildBrowserHarnessDocument(), { waitUntil: "load" });
      const evidence = await page.evaluate(async (values) => {
        const fixture = (
          window as typeof window & {
            FilamentLabelBrowserFixture: {
              decodeBrandedQrMatrix: (payloads: string[]) => Promise<Array<{
                payload: string;
                scenarios: Array<{
                  id: string;
                  decodedPayload: string | null;
                  error?: string;
                  plainDecodedPayload: string | null;
                  recoveredPayload?: string | null;
                  plainRecoveredPayload?: string | null;
                  recoveryView?: string;
                }>;
                coloredPixels: number;
                monochromePixels: number;
              }>>;
            };
          }
        ).FilamentLabelBrowserFixture;
        return fixture.decodeBrandedQrMatrix(values);
      }, payloads);
      assert.equal(evidence.length, payloads.length);
      for (const entry of evidence) {
        assert.ok(entry.coloredPixels > 100, "screen output retains the colored spool logo");
        assert.equal(entry.monochromePixels, 0, "tape output uses no color");
        assert.equal(entry.scenarios.length, 28);
        for (const scenario of entry.scenarios) {
          const message = `${scenario.id} for ${entry.payload}: ${scenario.error ?? ""}`;
          if (scenario.id.endsWith("138px-screen")) {
            assert.equal(scenario.decodedPayload, entry.payload, `actual screen size: ${message}`);
          }
          if (scenario.plainDecodedPayload !== null) {
            assert.equal(scenario.plainDecodedPayload, entry.payload, `plain control: ${message}`);
          }
          if (scenario.decodedPayload !== null) {
            assert.equal(scenario.decodedPayload, entry.payload, message);
          } else {
            assert.equal(scenario.plainDecodedPayload, null, `logo caused a new decoder miss: ${message}`);
            assert.ok(["scale-0.8", "scale-1.2", "tilt-2"].includes(scenario.recoveryView ?? ""), message);
            assert.equal(scenario.recoveredPayload, entry.payload, message);
            assert.equal(scenario.plainRecoveredPayload, entry.payload, message);
          }
        }
      }
    } finally {
      await browser.close();
    }
  },
);

test(
  "A4 and US Letter PDFs preserve the colored branded QR and its decodable payload",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(await buildBrowserHarnessDocument(), { waitUntil: "load" });
      const evidence = await page.evaluate(async (payload) => {
        const fixture = (
          window as typeof window & {
            FilamentLabelBrowserFixture: {
              decodeColorLabelSheetImages: (value: string) => Promise<Array<{
                paper: "a4" | "letter";
                decodedPayload: string;
                coloredPixels: number;
              }>>;
            };
          }
        ).FilamentLabelBrowserFixture;
        return fixture.decodeColorLabelSheetImages(payload);
      }, QR_PAYLOAD);
      assert.deepEqual(evidence.map(({ paper }) => paper), ["a4", "letter"]);
      for (const entry of evidence) {
        assert.equal(entry.decodedPayload, QR_PAYLOAD);
        assert.ok(entry.coloredPixels > 100, `${entry.paper} retains the color logo in its actual image stream`);
      }
    } finally {
      await browser.close();
    }
  },
);
