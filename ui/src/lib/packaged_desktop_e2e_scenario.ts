import {
  createManualSpool,
  listSpools,
  updateSpoolWeight,
} from "./tauri_inventory_client";
import {
  lendSpool,
  listSpoolLoans,
  returnSpoolLoan,
} from "./tauri_loan_client";
import {
  exportFullBackupJson,
  validateFullBackupJson,
} from "./tauri_maintenance_client";
import {
  assignPrinterSlot,
  createPrinter,
  listPrinterOverview,
} from "./tauri_printer_client";
import {
  completePackagedDesktopE2e,
  type PackagedDesktopE2eCompletion,
  type PackagedDesktopE2eConfiguration,
} from "./tauri_packaged_desktop_e2e_client";

export type {
  PackagedDesktopE2eCompletion,
  PackagedDesktopE2eConfiguration,
} from "./tauri_packaged_desktop_e2e_client";

type ScenarioDependencies = {
  createManualSpool: typeof createManualSpool;
  listSpools: typeof listSpools;
  updateSpoolWeight: typeof updateSpoolWeight;
  lendSpool: typeof lendSpool;
  listSpoolLoans: typeof listSpoolLoans;
  returnSpoolLoan: typeof returnSpoolLoan;
  createPrinter: typeof createPrinter;
  assignPrinterSlot: typeof assignPrinterSlot;
  listPrinterOverview: typeof listPrinterOverview;
  exportFullBackupJson: typeof exportFullBackupJson;
  validateFullBackupJson: typeof validateFullBackupJson;
  sha256: (content: string) => Promise<string>;
  complete: (input: PackagedDesktopE2eCompletion) => Promise<void>;
};

type BackupRoot = {
  format?: unknown;
  tables?: unknown;
};

type BackupRow = Record<string, unknown>;

export class PackagedDesktopE2eScenarioError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "PackagedDesktopE2eScenarioError";
    this.step = step;
  }
}

async function sha256(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const defaultDependencies: ScenarioDependencies = {
  createManualSpool,
  listSpools,
  updateSpoolWeight,
  lendSpool,
  listSpoolLoans,
  returnSpoolLoan,
  createPrinter,
  assignPrinterSlot,
  listPrinterOverview,
  exportFullBackupJson,
  validateFullBackupJson,
  sha256,
  complete: completePackagedDesktopE2e,
};

function scenarioFailure(step: string, message: string): never {
  throw new PackagedDesktopE2eScenarioError(step, message);
}

function expectExactNumber(
  step: string,
  label: string,
  actual: number | null | undefined,
  expected: number,
) {
  if (actual !== expected) {
    scenarioFailure(step, `${label} expected ${expected}, found ${String(actual)}`);
  }
}

async function readAndValidatePersistedState(
  config: PackagedDesktopE2eConfiguration,
  dependencies: ScenarioDependencies,
  step: string,
) {
  const [spools, loans, printers] = await Promise.all([
    dependencies.listSpools(500, 0),
    dependencies.listSpoolLoans(500, true, "OUTBOUND"),
    dependencies.listPrinterOverview(),
  ]);
  const spool = spools.find(({ spool: candidate }) => candidate.id === config.spool_id)
    ?.spool;
  if (!spool) {
    scenarioFailure(step, "The QA spool is missing");
  }
  expectExactNumber(
    step,
    "QA spool current weight",
    spool.current_weight_g,
    config.returned_weight_g,
  );
  expectExactNumber(
    step,
    "QA spool remaining weight",
    spool.remaining_g,
    config.returned_weight_g,
  );

  const matchingLoans = loans.filter(
    ({ loan }) => loan.spool_id === config.spool_id,
  );
  if (matchingLoans.length !== 1) {
    scenarioFailure(
      step,
      `Expected one QA loan, found ${matchingLoans.length}`,
    );
  }
  const loan = matchingLoans[0]?.loan;
  if (!loan || loan.loan_status !== "RETURNED" || !loan.returned_at) {
    scenarioFailure(step, "The QA loan is not returned");
  }
  expectExactNumber(step, "QA loan checkout weight", loan.grams_out, config.updated_weight_g);
  expectExactNumber(
    step,
    "QA loan returned weight",
    loan.returned_grams,
    config.returned_weight_g,
  );

  const matchingPrinters = printers.filter(
    ({ printer }) => printer.id === config.printer_id,
  );
  if (matchingPrinters.length !== 1) {
    scenarioFailure(
      step,
      `Expected one QA printer, found ${matchingPrinters.length}`,
    );
  }
  const slot = matchingPrinters[0]?.slots.find(
    (candidate) => candidate.slot_id === config.slot_id,
  );
  if (slot?.spool_id !== config.spool_id) {
    scenarioFailure(step, "The QA spool is not assigned to the expected printer slot");
  }

  return { loan };
}

function parseBackupRows(content: string, step: string) {
  let root: BackupRoot;
  try {
    root = JSON.parse(content) as BackupRoot;
  } catch {
    return scenarioFailure(step, "The exported full backup is not valid JSON");
  }
  if (root.format !== "filament-manager-backup-v1") {
    return scenarioFailure(step, "The exported full backup format is invalid");
  }
  if (!root.tables || typeof root.tables !== "object" || Array.isArray(root.tables)) {
    return scenarioFailure(step, "The exported full backup has no tables object");
  }
  return root.tables as Record<string, BackupRow[]>;
}

function findSingleBackupRow(
  tables: Record<string, BackupRow[]>,
  table: string,
  field: string,
  value: string,
  step: string,
) {
  const rows = tables[table];
  if (!Array.isArray(rows)) {
    return scenarioFailure(step, `The full backup is missing table ${table}`);
  }
  const matches = rows.filter((row) => row?.[field] === value);
  if (matches.length !== 1) {
    return scenarioFailure(
      step,
      `Expected one ${table} backup row for ${value}, found ${matches.length}`,
    );
  }
  return matches[0] as BackupRow;
}

function validateBackupScenarioRows(
  content: string,
  config: PackagedDesktopE2eConfiguration,
  loanId: string,
  step: string,
) {
  const tables = parseBackupRows(content, step);
  const spool = findSingleBackupRow(
    tables,
    "filament_spools",
    "id",
    config.spool_id,
    step,
  );
  expectExactNumber(
    step,
    "Backup spool current weight",
    spool.current_weight_g as number | null | undefined,
    config.returned_weight_g,
  );
  expectExactNumber(
    step,
    "Backup spool remaining weight",
    spool.remaining_g as number | null | undefined,
    config.returned_weight_g,
  );

  const loan = findSingleBackupRow(
    tables,
    "spool_loans",
    "id",
    loanId,
    step,
  );
  if (
    loan.spool_id !== config.spool_id ||
    loan.loan_status !== "RETURNED" ||
    typeof loan.returned_at !== "string"
  ) {
    scenarioFailure(step, "The full backup does not preserve the returned QA loan");
  }
  expectExactNumber(
    step,
    "Backup loan returned weight",
    loan.returned_grams as number | null | undefined,
    config.returned_weight_g,
  );

  const printer = findSingleBackupRow(
    tables,
    "printers",
    "id",
    config.printer_id,
    step,
  );
  if (printer.id !== config.printer_id) {
    scenarioFailure(step, "The full backup does not preserve the QA printer");
  }
  const slot = findSingleBackupRow(
    tables,
    "ams_slots",
    "id",
    config.slot_id,
    step,
  );
  if (slot.spool_id !== config.spool_id) {
    scenarioFailure(step, "The full backup does not preserve the QA slot assignment");
  }
}

async function runMutationPhase(
  config: PackagedDesktopE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  let step = "create-spool";
  try {
    await dependencies.createManualSpool({
      id: config.spool_id,
      material: "PLA",
      filament_name: "Packaged desktop E2E",
      color_name: "QA blue",
      hex_color: "#1A73E8",
      product_url: null,
      vendor: "Filament Manager QA",
      default_weight_g: config.initial_weight_g,
      qr_code: null,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: null,
      owner_contact: null,
      ownership_note: "Isolated packaged desktop E2E fixture",
      initial_weight_g: config.initial_weight_g,
      location: "Private packaged desktop QA",
    });
    const created = (await dependencies.listSpools(500, 0)).find(
      ({ spool }) => spool.id === config.spool_id,
    )?.spool;
    if (!created) {
      scenarioFailure(step, "The QA spool was not created");
    }
    expectExactNumber(
      step,
      "Created QA spool weight",
      created.remaining_g,
      config.initial_weight_g,
    );

    step = "update-weight";
    await dependencies.updateSpoolWeight(config.spool_id, config.updated_weight_g);
    const updated = (await dependencies.listSpools(500, 0)).find(
      ({ spool }) => spool.id === config.spool_id,
    )?.spool;
    expectExactNumber(
      step,
      "Updated QA spool weight",
      updated?.remaining_g,
      config.updated_weight_g,
    );

    step = "lend-spool";
    const createdLoan = await dependencies.lendSpool({
      spool_id: config.spool_id,
      borrower_name: "Packaged desktop E2E borrower",
      grams_out: config.updated_weight_g,
      note: "Mutating packaged desktop release gate",
    });
    if (!createdLoan.id || createdLoan.spool_id !== config.spool_id) {
      scenarioFailure(step, "The QA loan was not created for the expected spool");
    }

    step = "return-spool";
    const returnedLoan = await dependencies.returnSpoolLoan({
      loan_id: createdLoan.id,
      returned_grams: config.returned_weight_g,
      note: "Returned by packaged desktop release gate",
    });
    if (
      returnedLoan.id !== createdLoan.id ||
      returnedLoan.loan_status !== "RETURNED"
    ) {
      scenarioFailure(step, "The QA loan was not returned");
    }

    step = "create-printer";
    await dependencies.createPrinter({
      id: config.printer_id,
      model: "Generic QA printer",
      name: "Packaged desktop E2E printer",
      ams_units: 1,
      slots_per_ams: 1,
    });

    step = "assign-printer-slot";
    await dependencies.assignPrinterSlot({
      printer_id: config.printer_id,
      slot_id: config.slot_id,
      spool_id: config.spool_id,
      rfid_override_tray_uuid: null,
      rfid_override_color_hex: null,
      clear_live_cache_before_next_refresh: false,
    });

    step = "validate-mutated-state";
    const { loan } = await readAndValidatePersistedState(config, dependencies, step);
    if (loan.id !== createdLoan.id) {
      scenarioFailure(step, "The returned QA loan identity changed");
    }
    await dependencies.complete({
      phase: "mutate",
      run_id: config.run_id,
      spool_id: config.spool_id,
      printer_id: config.printer_id,
      slot_id: config.slot_id,
      loan_id: loan.id,
      final_weight_g: config.returned_weight_g,
      loan_status: "RETURNED",
      backup_sha256: null,
      backup_total_rows: null,
    });
  } catch (error) {
    if (error instanceof PackagedDesktopE2eScenarioError) {
      throw error;
    }
    scenarioFailure(
      step,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function runVerificationPhase(
  config: PackagedDesktopE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const step = "validate-state-after-restart";
  const { loan } = await readAndValidatePersistedState(config, dependencies, step);

  const backupStep = "export-and-validate-full-backup";
  const { content } = await dependencies.exportFullBackupJson();
  const validation = await dependencies.validateFullBackupJson(content);
  if (
    validation.format !== "filament-manager-backup-v1" ||
    validation.expected_tables !== validation.present_tables ||
    validation.missing_tables.length !== 0 ||
    validation.extra_tables.length !== 0 ||
    validation.total_rows <= 0
  ) {
    scenarioFailure(backupStep, "The exported full backup is incomplete");
  }
  validateBackupScenarioRows(content, config, loan.id, backupStep);
  const backupSha256 = await dependencies.sha256(content);

  await dependencies.complete({
    phase: "verify",
    run_id: config.run_id,
    spool_id: config.spool_id,
    printer_id: config.printer_id,
    slot_id: config.slot_id,
    loan_id: loan.id,
    final_weight_g: config.returned_weight_g,
    loan_status: "RETURNED",
    backup_sha256: backupSha256,
    backup_total_rows: validation.total_rows,
  });
}

export async function runPackagedDesktopE2eScenario(
  config: PackagedDesktopE2eConfiguration,
  dependencies: ScenarioDependencies = defaultDependencies,
) {
  if (config.phase === "mutate") {
    await runMutationPhase(config, dependencies);
    return;
  }
  if (config.phase === "verify") {
    await runVerificationPhase(config, dependencies);
    return;
  }
  scenarioFailure("configuration", "The packaged desktop E2E phase is invalid");
}
