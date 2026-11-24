import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const row = (id: string) => ({
  spool: { id, status: "IN_STOCK" },
  master: { material: "PLA", filament_name: id, color_name: "Red", vendor: "eSUN" },
});
const pageOf = (ids: string[], total: number, rev = 1) => ({
  rows: ids.map(row), total, current_match: null, revisions: [rev, 1, 1],
});

test("printer picker pages and searches the full library, discarding obsolete queries and generations", async context => {
  const bundle = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL("../../test-fixtures/printer_picker.tsx", import.meta.url)),
        formats: ["iife"], name: "Picker",
      },
    },
  });
  const entry = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(o => o.output).find(o => o.type === "chunk" && o.isEntry);
  assert.ok(entry?.type === "chunk");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let release!: (value: ReturnType<typeof pageOf>) => void;
    let pauseSearch = false;
    let revision = 1;
    let unsupported = false;
    let fullReads = 0;
    const calls: Array<[number, string, number]> = [];
    await page.exposeFunction("readPage", async (generation: number, query: { search: string; offset: number }) => {
      calls.push([generation, query.search, query.offset]);
      if (unsupported) return null;
      if (query.search && pauseSearch) return new Promise(resolve => { release = resolve; });
      if (query.search) return pageOf([query.search], 1, revision);
      return pageOf(Array.from({ length: 120 }, (_, i) => `gen-${generation}-rev-${revision}-roll-${query.offset + i + 1}`), 10000, revision);
    });
    await page.exposeFunction("fullRows", () => {
      fullReads++;
      return [row("saved-roll")];
    });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: entry.code });
    const open = page.getByRole("button", { name: /Select roll/ }).first();
    await open.click();
    const dialog = page.getByRole("dialog");
    const search = dialog.getByRole("textbox");
    const more = dialog.getByRole("button", { name: /Show more/ });
    await more.waitFor();
    assert.match(await more.innerText(), /120 \/ 10000/);
    await more.click();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent?.includes("gen-1-rev-1-roll-240"));
    revision = 2;
    await more.click();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent?.includes("gen-1-rev-2-roll-120"));
    assert.doesNotMatch(await dialog.innerText(), /gen-1-rev-1/);
    pauseSearch = true;
    await search.fill("old-search");
    await context.waitFor(() => assert.ok(calls.some(([, search]) => search === "old-search")));
    const staleSearch = release;
    pauseSearch = false;
    await search.fill("roll-10000");
    await dialog.getByRole("button", { name: /roll-10000/ }).waitFor();
    staleSearch(pageOf(["wrong-search"], 1));
    await dialog.getByRole("button", { name: /roll-10000/ }).click();
    assert.equal(await page.locator("output").innerText(), "roll-10000");
    await open.click();
    pauseSearch = true;
    await search.fill("changing-host");
    await context.waitFor(() => assert.ok(calls.some(([g, search]) => g === 1 && search === "changing-host")));
    const staleHost = release;
    await page.getByRole("button", { name: "Switch Host" }).click();
    pauseSearch = false;
    await page.getByRole("button", { name: "Switch Host" }).click();
    await context.waitFor(() => assert.ok(calls.some(([g, search]) => g === 3 && search === "changing-host")));
    await dialog.getByRole("button", { name: /changing-host/ }).waitFor();
    staleHost(pageOf(["wrong-host"], 1));
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent?.includes("changing-host"));
    assert.doesNotMatch(await dialog.innerText(), /wrong-host|wrong-search/);
    unsupported = true;
    await search.fill("saved");
    await dialog.getByRole("button", { name: /saved-roll/ }).waitFor();
    assert.equal(fullReads, 1);
    assert.deepEqual(calls.slice(0, 4).map(c => c[2]), [0, 120, 240, 0]);
  } finally {
    await browser.close();
  }
});
