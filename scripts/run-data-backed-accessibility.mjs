import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import {
  buildUiBrowserPerformanceFixture,
  resolveUiBrowserPerformanceInvoke,
} from "./ui-browser-performance-probe.mjs";
import {
  cleanupVisualQaDatabase,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

const requireFromUi = createRequire(new URL("../ui/package.json", import.meta.url));
const DEFAULT_TIMEOUT_MS = 15_000;
const WCAG_TAGS = Object.freeze([
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
]);

export const DATA_BACKED_ACCESSIBILITY_PAGES = Object.freeze([
  Object.freeze({ evidenceKey: "dashboard", heading: "Dashboard", label: "Dashboard" }),
  Object.freeze({ evidenceKey: "inventory", heading: "Spools", label: "Inventory" }),
  Object.freeze({ evidenceKey: "loans", heading: "Loans", label: "Loans" }),
  Object.freeze({ evidenceKey: "printers", heading: "Printers", label: "Printers" }),
  Object.freeze({ evidenceKey: "statistics", heading: "Statistics", label: "Statistics" }),
  Object.freeze({ evidenceKey: "settings", heading: "Settings", label: "Settings" }),
]);

function optionValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = argv.lastIndexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function parseDataBackedAccessibilityOptions(argv) {
  const timeoutRaw = optionValue(argv, "--timeout-ms");
  const timeoutMs = timeoutRaw == null ? DEFAULT_TIMEOUT_MS : Number(timeoutRaw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms requires a positive integer.");
  }
  return {
    headless: !argv.includes("--headful"),
    timeoutMs,
  };
}

export function formatAxeViolations(pageLabel, violations) {
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const target = node.target.join(" ");
      const summary = String(node.failureSummary ?? violation.help)
        .replace(/\s+/g, " ")
        .trim();
      return `${pageLabel}: ${violation.id} (${violation.impact ?? "unknown"}) at ${target}: ${summary}`;
    }),
  );
}

async function createUiViteServer(options) {
  const viteEntry = requireFromUi.resolve("vite");
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  return createServer(options);
}

async function installTauriFixtureBridge(page, fixture, calls) {
  await page.exposeFunction(
    "__bfmAccessibilityInvoke",
    async (command, payload) => {
      calls.push({ command, payload: payload ?? {} });
      return resolveUiBrowserPerformanceInvoke(fixture, command, payload);
    },
  );
  await page.addInitScript(() => {
    let callbackSequence = 0;
    const callbacks = new Map();
    const invoke = (command, payload) =>
      window.__bfmAccessibilityInvoke(command, payload);
    window.__TAURI__ = { invoke };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener() {},
    };
    window.__TAURI_INTERNALS__ = {
      invoke,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback(callback, once = false) {
        callbackSequence += 1;
        const id = callbackSequence;
        callbacks.set(id, { callback, once });
        window[`_${id}`] = (...args) => {
          const current = callbacks.get(id);
          if (!current) {
            return;
          }
          current.callback(...args);
          if (current.once) {
            callbacks.delete(id);
            delete window[`_${id}`];
          }
        };
        return id;
      },
      unregisterCallback(id) {
        callbacks.delete(id);
        delete window[`_${id}`];
      },
    };
  });
}

async function waitForPage(page, spec, fixture, timeoutMs) {
  await page
    .getByRole("heading", { exact: true, name: spec.heading })
    .waitFor({ state: "visible", timeout: timeoutMs });
  const evidence = fixture.evidence[spec.evidenceKey];
  if (evidence) {
    await page
      .getByText(String(evidence))
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
  await page.evaluate(
    () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolveFrame(undefined)),
        ),
      ),
  );
}

async function scanPage(page, spec) {
  const result = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  return {
    label: spec.label,
    passes: result.passes.length,
    violations: result.violations,
  };
}

export async function runDataBackedAccessibilityAnalysis(options) {
  const generatedFixture = createVisualQaFixture();
  let preparedDatabase = null;
  let server = null;
  let browser = null;
  let primaryError = null;
  try {
    preparedDatabase = await prepareVisualQaDatabase({
      profile: "base",
      sourcePath: generatedFixture.outputPath,
    });
    const fixture = buildUiBrowserPerformanceFixture(preparedDatabase.targetPath);
    assert.ok(
      fixture.spoolRows.length > 0 &&
        fixture.printerRows.length > 0 &&
        fixture.loanRows.length > 0,
      "The accessibility analysis requires sanitized inventory, printer and loan data.",
    );

    server = await createUiViteServer({
      configFile: resolve("ui", "vite.config.ts"),
      logLevel: "error",
      root: resolve("ui"),
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Vite did not expose a local accessibility-analysis port.");
    }

    browser = await chromium.launch({ headless: options.headless });
    const context = await browser.newContext({
      colorScheme: "light",
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const calls = [];
      const browserErrors = [];
      const page = await context.newPage();
      page.on("pageerror", (error) => browserErrors.push(error));
      page.on("console", (message) => {
        if (message.type() === "error") {
          browserErrors.push(new Error(message.text()));
        }
      });
      await installTauriFixtureBridge(page, fixture, calls);
      await page.goto(`http://127.0.0.1:${address.port}/?bfm_locale=en`, {
        waitUntil: "domcontentloaded",
      });

      const scans = [];
      for (const [index, spec] of DATA_BACKED_ACCESSIBILITY_PAGES.entries()) {
        if (index > 0) {
          await page
            .getByRole("button", { exact: true, name: spec.label })
            .click();
        }
        try {
          await waitForPage(page, spec, fixture, options.timeoutMs);
        } catch (error) {
          const visibleText = (await page.locator("body").innerText())
            .replace(/\s+/g, " ")
            .slice(0, 1_000);
          throw new Error(
            `${spec.label} did not reach its data-backed ready state. ` +
              `Commands: ${calls.map(({ command }) => command).join(", ") || "(none)"}. ` +
              `Visible UI: ${visibleText || "(empty)"}`,
            { cause: error },
          );
        }
        scans.push(await scanPage(page, spec));
      }

      if (browserErrors.length > 0) {
        throw new AggregateError(
          browserErrors,
          `Data-backed accessibility pages raised ${browserErrors.length} browser error(s).`,
        );
      }
      const errors = scans.flatMap((scan) =>
        formatAxeViolations(scan.label, scan.violations),
      );
      return {
        errors,
        fixture: {
          loans: fixture.loanRows.length,
          printers: fixture.printerRows.length,
          spools: fixture.spoolRows.length,
        },
        pages: scans.map(({ label, passes, violations }) => ({
          label,
          passes,
          violations: violations.length,
        })),
      };
    } finally {
      await context.close();
    }
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (server) {
      try {
        await server.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const path of [
      preparedDatabase?.live ? null : preparedDatabase?.targetPath,
      generatedFixture.outputPath,
    ]) {
      if (!path) {
        continue;
      }
      try {
        cleanupVisualQaDatabase(path);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (primaryError && cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        `${primaryError instanceof Error ? primaryError.message : String(primaryError)}\n` +
          "Data-backed accessibility cleanup also failed.",
        { cause: primaryError },
      );
    }
    if (!primaryError && cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Data-backed accessibility cleanup failed.",
      );
    }
  }
  if (primaryError) {
    throw primaryError;
  }
  throw new Error("Data-backed accessibility analysis did not produce a result.");
}

async function main() {
  const result = await runDataBackedAccessibilityAnalysis(
    parseDataBackedAccessibilityOptions(process.argv.slice(2)),
  );
  const lines = [
    `Data-backed accessibility analysis (${result.fixture.spools} spools, ${result.fixture.printers} printers, ${result.fixture.loans} loans):`,
    ...result.pages.map(
      (page) =>
        `  ${page.label}: ${page.passes} axe rules passed, ${page.violations} violation(s)`,
    ),
  ];
  if (result.errors.length > 0) {
    lines.push(
      "  Violations:",
      ...result.errors.map((error) => `    - ${error}`),
    );
    process.exitCode = 1;
  } else {
    lines.push("  Result: all data-backed main pages passed.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
