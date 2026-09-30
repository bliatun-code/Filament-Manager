// Feed only a generated native visual-QA database clone. No printer transport.
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
export function startSyntheticDiagnosticFeed(databasePath) {
  if (!databasePath || resolve(databasePath) === resolve('tmp/visual-modernization/review.db')) {
    throw new Error('Diagnostic feed requires the generated capture database, not its source.');
  }
  const db = new Database(databasePath);
  const key = 'bambu_live_integration:qa_printer_bambu';
  if (!db.prepare("SELECT id FROM filament_spools WHERE id='visual_edge_0'").get()) {
    db.close(); throw new Error('Diagnostic feed requires the synthetic review fixture.');
  }
  const temperatures = [205, 212, 219, 223, 221, 218, 220, 217, 219, 218];
  let index = 0;
  function tick() {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    const config = JSON.parse(row.value);
    if (config.host || config.access_code) throw new Error('Synthetic diagnostic source must have no printer credentials.');
    const value = temperatures[index++ % temperatures.length];
    const observed = config.observed_state;
    observed.last_seen_at = new Date().toISOString();
    observed.nozzle_temp_c = value;
    observed.raw_payload_json = {
      ...observed.raw_payload_json,
      print: { ...observed.raw_payload_json?.print, nozzle_temper: value, bed_temper: 55, mc_percent: 60 + index, gcode_state: 'RUNNING', subtask_name: 'Synthetic review prototype' },
    };
    db.transaction(() => {
      db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(config), key);
      db.prepare("UPDATE library_domain_revisions SET revision=revision+1, updated_at=datetime('now') WHERE domain='printers'").run();
    })();
  }
  tick();
  const timer = setInterval(tick, 6000);
  let stopped = false;
  return () => { if (!stopped) { stopped = true; clearInterval(timer); db.close(); } };
}
