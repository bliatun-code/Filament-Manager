import assert from "node:assert/strict";
import test from "node:test";

import {
  filterLoanableSpoolsBySearch,
  resolveContainedSelectionScrollTop,
} from "./loan_out_candidate_model";
import type { LoanableSpool } from "./loan_out_data_source";

const spools: LoanableSpool[] = [
  {
    id: "493767",
    vendor: "eSUN",
    material: "PLA-Matte",
    filamentName: "PLA Matte",
    colorName: "Peach Pink",
    status: "IN_STOCK",
    remainingGrams: 645,
    location: "Shelf 3",
  },
  {
    id: "248216",
    vendor: "Print With Smile",
    material: "ABS",
    filamentName: "ABS",
    colorName: "Matte Black",
    status: "IN_STOCK",
    remainingGrams: 630,
    location: null,
  },
];

test("loan candidate search covers identity, vendor, color, location and reference", () => {
  assert.deepEqual(filterLoanableSpoolsBySearch(spools, "peach pink"), [spools[0]]);
  assert.deepEqual(filterLoanableSpoolsBySearch(spools, "esun shelf 3"), [spools[0]]);
  assert.deepEqual(filterLoanableSpoolsBySearch(spools, "#493767"), [spools[0]]);
  assert.deepEqual(filterLoanableSpoolsBySearch(spools, "print black"), [spools[1]]);
  assert.equal(filterLoanableSpoolsBySearch(spools, "petg").length, 0);
  assert.equal(filterLoanableSpoolsBySearch(spools, "   "), spools);
});

test("contained selection scroll moves only enough to reveal a row", () => {
  assert.equal(
    resolveContainedSelectionScrollTop({
      containerTop: 100,
      containerBottom: 500,
      currentScrollTop: 0,
      rowTop: 700,
      rowBottom: 760,
    }),
    260,
  );
  assert.equal(
    resolveContainedSelectionScrollTop({
      containerTop: 100,
      containerBottom: 500,
      currentScrollTop: 400,
      rowTop: 40,
      rowBottom: 100,
    }),
    340,
  );
  assert.equal(
    resolveContainedSelectionScrollTop({
      containerTop: 100,
      containerBottom: 500,
      currentScrollTop: 200,
      rowTop: 180,
      rowBottom: 240,
    }),
    200,
  );
});
