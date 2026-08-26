import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCustomStatisticsPeriod,
  createStatisticsPeriodPickerState,
  openCustomStatisticsPeriod,
  resolveStatisticsPeriodPreset,
  selectStatisticsPeriodPreset,
  updateCustomStatisticsPeriod,
} from "./statistics_period_model";

function withTimezone<T>(timezone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

test("preset periods resolve inclusive local dates into one half-open UTC contract", () => {
  withTimezone("UTC", () => {
    const now = new Date("2026-08-21T14:30:00Z");
    assert.deepEqual(resolveStatisticsPeriodPreset("30_DAYS", now), {
      startDate: "2026-07-23",
      endDate: "2026-08-21",
      period: {
        start_at_utc: "2026-07-23T00:00:00Z",
        end_at_utc: "2026-08-22T00:00:00Z",
      },
    });
    assert.deepEqual(resolveStatisticsPeriodPreset("90_DAYS", now), {
      startDate: "2026-05-24",
      endDate: "2026-08-21",
      period: {
        start_at_utc: "2026-05-24T00:00:00Z",
        end_at_utc: "2026-08-22T00:00:00Z",
      },
    });
    assert.deepEqual(resolveStatisticsPeriodPreset("12_MONTHS", now), {
      startDate: "2025-08-22",
      endDate: "2026-08-21",
      period: {
        start_at_utc: "2025-08-22T00:00:00Z",
        end_at_utc: "2026-08-22T00:00:00Z",
      },
    });
  });
});

test("custom inclusive dates preserve DST-short and DST-long local days", () => {
  withTimezone("America/New_York", () => {
    let state = openCustomStatisticsPeriod(
      createStatisticsPeriodPickerState(new Date("2026-03-08T17:00:00Z")),
    );
    state = updateCustomStatisticsPeriod(state, "start", "2026-03-08");
    state = updateCustomStatisticsPeriod(state, "end", "2026-03-08");
    state = applyCustomStatisticsPeriod(state);
    assert.equal(state.validationError, null);
    assert.deepEqual(state.period, {
      start_at_utc: "2026-03-08T05:00:00Z",
      end_at_utc: "2026-03-09T04:00:00Z",
    });

    state = updateCustomStatisticsPeriod(state, "start", "2026-11-01");
    state = updateCustomStatisticsPeriod(state, "end", "2026-11-01");
    state = applyCustomStatisticsPeriod(state);
    assert.deepEqual(state.period, {
      start_at_utc: "2026-11-01T04:00:00Z",
      end_at_utc: "2026-11-02T05:00:00Z",
    });
  });
});

test("invalid custom drafts never replace the last applied period", () => {
  withTimezone("UTC", () => {
    const initial = createStatisticsPeriodPickerState(new Date("2026-08-21T12:00:00Z"));
    let state = openCustomStatisticsPeriod(initial);
    state = updateCustomStatisticsPeriod(state, "start", "2026-02-30");
    state = updateCustomStatisticsPeriod(state, "end", "2026-03-01");
    state = applyCustomStatisticsPeriod(state);
    assert.equal(state.validationError, "INVALID_DATE");
    assert.deepEqual(state.period, initial.period);
    assert.equal(state.appliedPreset, "30_DAYS");

    state = updateCustomStatisticsPeriod(state, "start", "2026-08-22");
    state = updateCustomStatisticsPeriod(state, "end", "2026-08-21");
    state = applyCustomStatisticsPeriod(state);
    assert.equal(state.validationError, "END_BEFORE_START");
    assert.deepEqual(state.period, initial.period);
  });
});

test("preset selection applies immediately after an invalid custom draft", () => {
  withTimezone("UTC", () => {
    const initial = createStatisticsPeriodPickerState(new Date("2026-08-21T12:00:00Z"));
    const invalid = applyCustomStatisticsPeriod(
      updateCustomStatisticsPeriod(openCustomStatisticsPeriod(initial), "end", ""),
    );
    assert.equal(invalid.validationError, "MISSING_DATE");

    const selected = selectStatisticsPeriodPreset(
      invalid,
      "90_DAYS",
      new Date("2026-08-21T12:00:00Z"),
    );
    assert.equal(selected.appliedPreset, "90_DAYS");
    assert.equal(selected.customEditorOpen, false);
    assert.equal(selected.validationError, null);
    assert.equal(selected.startDate, "2026-05-24");
  });
});
