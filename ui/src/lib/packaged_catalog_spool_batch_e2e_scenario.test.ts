import assert from "node:assert/strict";
import test from "node:test";
import { runPackagedCatalogBatch, requirePackagedBatchReceipt } from "./packaged_catalog_spool_batch_e2e_scenario";

const receipt = { batch_id: "run-catalog-batch", spool_ids: [`spool_${"1".repeat(32)}`, `spool_${"2".repeat(32)}`] };
const revisions = { inventory: 3, catalog: 1, loans: 2, printers: 0, jobs: 0, wishlist: 0 };
const input = { runId: "run", libraryId: "library", spoolId: "spool", baseUrl: "http://127.0.0.1:1234", targetGeneration: 7,
  hostRows: [{ spool: { id: "spool", master_id: "master", status: "IN_STOCK" },
    master: { id: "master", material: "PLA", filament_name: "QA", color_name: "QA", default_weight: 1000, vendor: "QA" } }],
  priorReceipt: receipt };

test("batch recovery rejects changed receipt, Host revisions and Client shadow revisions", async () => {
  for (const failure of ["receipt", "host", "client"]) {
    let hostReads = 0; let clientReads = 0; let writes = 0;
    await assert.rejects(() => runPackagedCatalogBatch(input, {
      async createCatalogSpoolBatch() { writes += 1; return failure === "receipt"
        ? { ...receipt, spool_ids: [...receipt.spool_ids].reverse() } : receipt; },
      async fetchLibrarySyncDomainRevisions() { hostReads += 1; return { ...revisions,
        inventory: revisions.inventory + Number(failure === "host" && hostReads === 2) }; },
      async getLibraryDomainRevisions() { clientReads += 1; return { ...revisions,
        loans: revisions.loans + Number(failure === "client" && clientReads === 2) }; },
    }));
    assert.equal(writes, 1, "a failed assertion must never resubmit the batch");
  }
});

test("batch evidence requires two distinct generated identities and exact run ID", () => {
  for (const invalid of [{ ...receipt, batch_id: "other" },
    { ...receipt, spool_ids: [receipt.spool_ids[0], receipt.spool_ids[0]] },
    { ...receipt, spool_ids: ["private-route", receipt.spool_ids[1]] }]) {
    assert.throws(() => requirePackagedBatchReceipt(invalid, "run"), /receipt is invalid/);
  }
});
