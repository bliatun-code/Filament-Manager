import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build } from "vite";

const UI_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const IMAGE_SCAN_ENTRY = fileURLToPath(
  new URL("./bambu_filament_code_image_scan.ts", import.meta.url),
);
const CAMERA_SCAN_ENTRY = fileURLToPath(
  new URL("./bambu_filament_code_camera_scan.ts", import.meta.url),
);
const BOX_EAN = "6975337031338";
const EXPECTED_FILAMENT_CODE = "11101";
const CAMERA_ORIGIN = "https://camera.test";
const BOX_EAN_BITS =
  "10100010110010001011100101000010111101011101101010111001010000101100110100001010000101001000101";

let browserHarnessDocumentPromise: Promise<string> | null = null;

async function buildBrowserModuleScript(input: {
  entry: string;
  name: string;
}): Promise<string> {
  const buildResult = await build({
    root: UI_ROOT,
    configFile: false,
    logLevel: "error",
    build: {
      emptyOutDir: false,
      minify: false,
      write: false,
      lib: {
        entry: input.entry,
        formats: ["iife"],
        name: input.name,
      },
    },
  });
  const outputs = (Array.isArray(buildResult) ? buildResult : [buildResult])
    .flatMap((result) => ("output" in result ? result.output : []));
  const entryChunk = outputs.find(
    (output) => output.type === "chunk" && output.isEntry,
  );
  assert.ok(entryChunk && entryChunk.type === "chunk");
  return entryChunk.code.replaceAll("</script", "<\\/script");
}

async function buildBrowserHarnessDocument(): Promise<string> {
  browserHarnessDocumentPromise ??= Promise.all([
    buildBrowserModuleScript({
      entry: IMAGE_SCAN_ENTRY,
      name: "BambuFilamentImageScan",
    }),
    buildBrowserModuleScript({
      entry: CAMERA_SCAN_ENTRY,
      name: "BambuFilamentCameraScan",
    }),
  ]).then(
    ([imageScanScript, cameraScanScript]) => `<!doctype html>
      <html lang="en">
        <head><meta charset="UTF-8" /></head>
        <body>
          <script>${imageScanScript}</script>
          <script>${cameraScanScript}</script>
        </body>
      </html>`,
  );
  return browserHarnessDocumentPromise;
}

test(
  "browser image scan decodes an actual generated PNG through the production batch path",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(await buildBrowserHarnessDocument(), {
        waitUntil: "load",
      });
      const evidence = await page.evaluate(async ({ pattern }) => {
        const api = (
          window as typeof window & {
            BambuFilamentImageScan: {
              scanBambuFilamentCodesFromImage: (input: {
                currentInput: string;
                dependencies: { barcodeDetector: null };
                file: Blob;
              }) => Promise<unknown>;
            };
          }
        ).BambuFilamentImageScan;
        const moduleWidth = 5;
        const quietModules = 12;
        const width = (pattern.length + quietModules * 2) * moduleWidth;
        const height = 96;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas 2D is unavailable.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#000000";
        for (let moduleIndex = 0; moduleIndex < pattern.length; moduleIndex += 1) {
          if (pattern[moduleIndex] !== "1") {
            continue;
          }
          context.fillRect(
            (quietModules + moduleIndex) * moduleWidth,
            16,
            moduleWidth,
            66,
          );
        }

        const file = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("The browser could not encode the barcode PNG."));
            }
          }, "image/png");
        });
        const signature = Array.from(
          new Uint8Array(await file.slice(0, 8).arrayBuffer()),
        );
        const result = await api.scanBambuFilamentCodesFromImage({
          currentInput: "53400",
          file,
          dependencies: {
            barcodeDetector: null,
          },
        });
        return {
          fileSize: file.size,
          fileType: file.type,
          signature,
          result,
        };
      }, { pattern: BOX_EAN_BITS });

      assert.deepEqual(evidence, {
        fileSize: (evidence as { fileSize: number }).fileSize,
        fileType: "image/png",
        signature: [137, 80, 78, 71, 13, 10, 26, 10],
        result: {
          status: "ready",
          rawValues: [BOX_EAN],
          appendedLines: [EXPECTED_FILAMENT_CODE],
          append: {
            input: `53400\n${EXPECTED_FILAMENT_CODE}`,
            appendedLines: [EXPECTED_FILAMENT_CODE],
            appendedCodeLines: [EXPECTED_FILAMENT_CODE],
            appendedReviewLines: [],
            ignoredLines: [],
          },
        },
      });
      assert.ok(
        (evidence as { fileSize: number }).fileSize > 100,
        "The browser must encode non-empty PNG bytes before decoding.",
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "browser camera startup obtains a real MediaStream from a permission-scoped fake device",
  { timeout: 30_000 },
  async () => {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
    try {
      const context = await browser.newContext();
      await context.grantPermissions(["camera"], { origin: CAMERA_ORIGIN });
      await context.route(`${CAMERA_ORIGIN}/**`, async (route) => {
        await route.fulfill({
          body: await buildBrowserHarnessDocument(),
          contentType: "text/html",
        });
      });
      const page = await context.newPage();
      await page.goto(CAMERA_ORIGIN, { waitUntil: "load" });
      const evidence = await page.evaluate(async () => {
        const api = (
          window as typeof window & {
            BambuFilamentCameraScan: {
              bambuFilamentCodeCameraScanSupport: () => unknown;
              requestBambuFilamentCodeCameraStream: () => Promise<MediaStream | null>;
            };
          }
        ).BambuFilamentCameraScan;
        const support = api.bambuFilamentCodeCameraScanSupport();
        const stream = await api.requestBambuFilamentCodeCameraStream();
        if (!stream) {
          throw new Error("Camera stream was unavailable.");
        }
        const videoTracks = stream.getVideoTracks();
        const track = videoTracks[0];
        const result = {
          support,
          streamActive: stream.active,
          trackCount: videoTracks.length,
          trackKind: track?.kind ?? null,
          trackReadyState: track?.readyState ?? null,
          width: track?.getSettings().width ?? 0,
          height: track?.getSettings().height ?? 0,
        };
        stream.getTracks().forEach((currentTrack) => currentTrack.stop());
        return result;
      });

      assert.deepEqual(
        (evidence as { support: unknown }).support,
        { available: true, reason: null },
      );
      assert.equal((evidence as { streamActive: boolean }).streamActive, true);
      assert.equal((evidence as { trackCount: number }).trackCount, 1);
      assert.equal((evidence as { trackKind: string }).trackKind, "video");
      assert.equal(
        (evidence as { trackReadyState: string }).trackReadyState,
        "live",
      );
      assert.ok((evidence as { width: number }).width > 0);
      assert.ok((evidence as { height: number }).height > 0);
    } finally {
      await browser.close();
    }
  },
);
