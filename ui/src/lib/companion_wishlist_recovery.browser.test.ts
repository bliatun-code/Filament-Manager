import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium, type Page } from "playwright";

const companionAssets = new URL("../../../src-tauri/companion_browser/", import.meta.url);
const receiptEndpoint = "/api/v1/wishlist/order-1/receive-idempotent";
const item = {
  id: "order-1",
  material: "PLA",
  filament_name: "Basic",
  color_name: "Recovery Blue",
  vendor: "Generic",
};

async function openOrder(page: Page) {
  await page.locator('[data-action="toggle-add-spool-form"]').click();
  const queue = page.locator('details[data-collapsible="wishlist-queue"]');
  if (await queue.getAttribute("open") === null) {
    await queue.locator(":scope > summary").click();
  }
  return queue.locator(".add-spool-wishlist-row").filter({ hasText: item.color_name });
}

test("Companion restores wishlist receipt controls after the Host reply is lost", async context => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const remaining of [1, 0]) {
      await context.test(remaining ? "partial receipt" : "full receipt", async () => {
        const page = await browser.newPage({ locale: "en-US" });
        const requests: unknown[] = [];
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        try {
          await page.route("http://localhost/**", async route => {
            const path = new URL(route.request().url()).pathname;
            if (path === "/api/v1/auth/session") {
              return route.fulfill({ json: { authenticated: true, csrf_token: "test-session" } });
            }
            if (path === "/api/v1/health") {
              return route.fulfill({ json: {
                ok: true,
                library_id: "fixture-library",
                capabilities: ["wishlist-receipt-idempotency-v1"],
              } });
            }
            if (path === "/api/v1/wishlist") {
              return route.fulfill({ json: [{
                ...item,
                status: requests.length && remaining === 0 ? "RECEIVED" : "ON_ORDER",
                quantity: requests.length ? remaining : 2 + remaining,
              }] });
            }
            if (path === receiptEndpoint) {
              requests.push(route.request().postDataJSON());
              if (requests.length === 1) return route.abort("failed");
              return route.fulfill({ json: {
                spool_ids: ["received-1", "received-2"],
                received_quantity: 2,
                remaining_quantity: remaining,
                status: remaining ? "ON_ORDER" : "RECEIVED",
              } });
            }
            if (path.startsWith("/api/v1/")) return route.fulfill({ json: [] });

            const asset = path === "/companion" ? "index.html" : path.split("/").at(-1) ?? "";
            const contentType = {
              html: "text/html; charset=utf-8",
              css: "text/css; charset=utf-8",
              js: "text/javascript; charset=utf-8",
            }[asset.split(".").at(-1) ?? ""];
            if (contentType) {
              return route.fulfill({ contentType, body: await readFile(new URL(asset, companionAssets)) });
            }
            return route.fulfill({ status: 404 });
          });
          await page.goto("http://localhost/companion");
          const originalOrder = await openOrder(page);
          const originalForm = originalOrder.locator('[data-action="wishlist-stock-form"]');
          await originalForm.locator('input[name="received-quantity"]').fill("2");
          await originalForm.locator('details[data-collapsible^="wishlist-receipt:"] > summary').click();
          await originalForm.locator('input[name="batch_code"]').fill("QA batch");
          await originalForm.locator('button[type="submit"]').click();
          await originalOrder.locator('[data-action="wishlist-receipt-retry"]').waitFor();

          await page.reload();
          const recoveredOrder = await openOrder(page);
          assert.match(await recoveredOrder.innerText(), new RegExp(`Qty ${remaining}`));
          const retry = recoveredOrder.locator('[data-action="wishlist-receipt-retry"]');
          const replay = page.waitForResponse(response => new URL(response.url()).pathname === receiptEndpoint);
          await retry.click();
          assert.equal((await replay).status(), 200);
          await retry.waitFor({ state: "hidden" });
          assert.deepEqual(requests, [requests[0], requests[0]]);
          assert.match(JSON.stringify(requests[0]), /"batch_code":"QA batch"/);
          assert.deepEqual(pageErrors, []);
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
