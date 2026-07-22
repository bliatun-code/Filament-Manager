import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

export const APP_MODAL_ACCESSIBILITY_DIALOG_NAME = "AppModal accessibility test";
export const APP_MODAL_ACCESSIBILITY_VIEWPORT = { width: 1280, height: 720 };
export const APP_MODAL_ACCESSIBILITY_ZOOM_VIEWPORT = {
  width: APP_MODAL_ACCESSIBILITY_VIEWPORT.width / 2,
  height: APP_MODAL_ACCESSIBILITY_VIEWPORT.height / 2,
};

function activeTestId(page) {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

async function waitForActiveTestId(page, testId) {
  await page.waitForFunction(
    (expectedTestId) =>
      document.activeElement?.getAttribute("data-testid") === expectedTestId,
    testId,
  );
}

export function assertZoomMetrics(metrics) {
  assert.equal(metrics.zoomScale, 2, "The layout viewport must represent 200% browser zoom.");
  assert.ok(metrics.dialogLeft >= -1, "The dialog must not overflow the left viewport edge.");
  assert.ok(
    metrics.dialogRight <= metrics.viewportWidth + 1,
    "The dialog must not overflow the right viewport edge.",
  );
  assert.ok(
    metrics.documentScrollWidth <= metrics.viewportWidth + 1,
    "The document must not gain horizontal scrolling at 200% zoom.",
  );
  assert.match(metrics.dialogOverflowY, /^(auto|scroll)$/);
  assert.ok(
    metrics.dialogScrollHeight > metrics.dialogClientHeight,
    "Long modal content must scroll inside the dialog at 200% zoom.",
  );
}

function assetSourceText(asset) {
  return typeof asset.source === "string"
    ? asset.source
    : new TextDecoder().decode(asset.source);
}

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const UI_ROOT = resolve(REPOSITORY_ROOT, "ui");
const requireFromUi = createRequire(new URL("../ui/package.json", import.meta.url));

export async function buildAppModalAccessibilityHarnessDocument() {
  const viteEntry = pathToFileURL(requireFromUi.resolve("vite")).href;
  const reactPluginEntry = pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href;
  const [{ build }, { default: react }] = await Promise.all([
    import(viteEntry),
    import(reactPluginEntry),
  ]);
  const buildResult = await build({
    root: UI_ROOT,
    configFile: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    logLevel: "error",
    plugins: [react()],
    build: {
      cssCodeSplit: false,
      emptyOutDir: false,
      minify: false,
      write: false,
      lib: {
        entry: resolve(
          UI_ROOT,
          "src",
          "accessibility",
          "app_modal_accessibility_entry.tsx",
        ),
        formats: ["iife"],
        name: "AppModalAccessibilityHarness",
      },
    },
  });
  const outputs = (Array.isArray(buildResult) ? buildResult : [buildResult]).flatMap(
    (result) => result.output,
  );
  const entryChunk = outputs.find((output) => output.type === "chunk" && output.isEntry);
  if (!entryChunk || entryChunk.type !== "chunk") {
    throw new Error("Vite did not produce the AppModal accessibility entry chunk.");
  }
  const css = outputs
    .filter((output) => output.type === "asset" && output.fileName.endsWith(".css"))
    .map(assetSourceText)
    .join("\n");
  const safeCss = css.replaceAll("</style", "<\\/style");
  const safeScript = entryChunk.code.replaceAll("</script", "<\\/script");

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AppModal accessibility harness</title>
        <style>${safeCss}</style>
      </head>
      <body>
        <div id="root"></div>
        <script>${safeScript}</script>
      </body>
    </html>`;
}

function appModalAccessibilityLifecycleError(primaryError, cleanupErrors) {
  if (primaryError && cleanupErrors.length > 0) {
    return new AggregateError(
      [primaryError, ...cleanupErrors],
      `${primaryError instanceof Error ? primaryError.message : String(primaryError)}\nAppModal accessibility browser cleanup also failed: ${cleanupErrors
        .map((error) => (error instanceof Error ? error.message : String(error)))
        .join("; ")}`,
      { cause: primaryError },
    );
  }
  if (primaryError) {
    return primaryError;
  }
  if (cleanupErrors.length === 1) {
    return cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    return new AggregateError(
      cleanupErrors,
      "AppModal accessibility browser cleanup failed",
    );
  }
  return null;
}

export async function runAppModalAccessibilityTest(options = {}) {
  const buildHarnessDocument =
    options.buildHarnessDocument ?? buildAppModalAccessibilityHarnessDocument;
  const harnessDocument = await buildHarnessDocument();
  let browser = null;
  let context = null;
  let primaryError = null;
  const browserErrors = [];

  try {
    browser = await (options.chromium ?? chromium).launch({ headless: true });
    context = await browser.newContext({
      colorScheme: "light",
      viewport: APP_MODAL_ACCESSIBILITY_VIEWPORT,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });

    await page.setContent(harnessDocument, { waitUntil: "load" });
    try {
      await page.getByTestId("modal-opener").waitFor({ state: "visible", timeout: 5_000 });
    } catch (error) {
      const bodySample = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
      throw new Error(
        `AppModal accessibility harness did not render. Browser errors: ${browserErrors.join("; ") || "none"}. Body: ${bodySample || "<empty>"}`,
        { cause: error },
      );
    }

    const opener = page.getByTestId("modal-opener");
    await opener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", {
      name: APP_MODAL_ACCESSIBILITY_DIALOG_NAME,
    });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.count(), 1, "The modal must expose one named dialog.");

    await waitForActiveTestId(page, "initial-action");
    assert.equal(await activeTestId(page), "initial-action", "The first action must receive focus.");

    await page.keyboard.press("Tab");
    assert.equal(
      await activeTestId(page),
      "details-summary",
      "The native summary must participate in the modal tab order.",
    );

    await page.keyboard.press("Tab");
    assert.equal(await activeTestId(page), "last-action");
    await page.keyboard.press("Tab");
    assert.equal(await activeTestId(page), "initial-action", "Tab must wrap to the first action.");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await activeTestId(page), "last-action", "Shift+Tab must wrap to the last action.");

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await waitForActiveTestId(page, "modal-opener");
    assert.equal(await activeTestId(page), "modal-opener", "Closing must return focus to the opener.");

    await page.setViewportSize(APP_MODAL_ACCESSIBILITY_ZOOM_VIEWPORT);
    await opener.click();
    await dialog.waitFor({ state: "visible" });
    await waitForActiveTestId(page, "initial-action");

    const zoomMetrics = await dialog.evaluate((element, initialViewportWidth) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        dialogClientHeight: element.clientHeight,
        dialogLeft: rect.left,
        dialogOverflowY: style.overflowY,
        dialogRight: rect.right,
        dialogScrollHeight: element.scrollHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        zoomScale: initialViewportWidth / window.innerWidth,
      };
    }, APP_MODAL_ACCESSIBILITY_VIEWPORT.width);
    assertZoomMetrics(zoomMetrics);

    const lastAction = page.getByTestId("last-action");
    await lastAction.scrollIntoViewIfNeeded();
    await lastAction.focus();
    const lastActionRect = await lastAction.boundingBox();
    assert.ok(lastActionRect, "The final modal action must remain rendered at 200% zoom.");
    assert.ok(lastActionRect.y >= -1, "The final modal action must be reachable by scrolling.");
    assert.ok(
      lastActionRect.y + lastActionRect.height <=
        APP_MODAL_ACCESSIBILITY_ZOOM_VIEWPORT.height + 1,
      "The final modal action must fit in the viewport after scrolling.",
    );

    assert.deepEqual(browserErrors, [], "The accessibility harness must not emit browser errors.");
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (context) {
    try {
      await context.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  const finalError = appModalAccessibilityLifecycleError(
    primaryError,
    cleanupErrors,
  );
  if (finalError) {
    throw finalError;
  }
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  runAppModalAccessibilityTest()
    .then(() => {
      console.log("AppModal accessibility checks passed.");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}
