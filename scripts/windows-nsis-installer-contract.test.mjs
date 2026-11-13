import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const template = read("../src-tauri/windows/nsis-installer.nsi");
const hooks = read("./windows-nsis-pilot.nsh");
const config = JSON.parse(read("./windows-nsis-pilot.json"));

test("the NSIS installer uses the audited template and keeps the library on uninstall", () => {
  assert.equal(config.version, undefined);
  const windows = config.bundle.windows;
  assert.equal(windows.allowDowngrades, false);
  assert.equal(windows.nsis.installMode, "currentUser");
  assert.equal(windows.nsis.template, "./windows/nsis-installer.nsi");
  assert.match(template, /Tauri CLI 2\.12\.4/);
  assert.match(template, /Upstream commit: 993038c49185307dfc895ab7657d77ca0d5ed7c7/);
  assert.match(read("../src-tauri/windows/TAURI-MIT.txt"), /Tauri Apps Contributors/);
  assert.doesNotMatch(template, /DeleteAppData|\$\(deleteAppData\)|FindWixInstall|PageReinstall|PageLeaveReinstall/);
  assert.doesNotMatch(template, /(?:RMDir|Delete) .*\$(?:LOCAL)?APPDATA/i);
  assert.match(template, /Section Install\s+!insertmacro NSIS_HOOK_PREINSTALL\s+SetOutPath \$INSTDIR\s+(?:;[^\n]*\s+)?File "\$\{MAINBINARYSRCPATH\}"/);
  assert.match(template, /Section Uninstall\s+!ifmacrodef NSIS_HOOK_PREUNINSTALL\s+!insertmacro NSIS_HOOK_PREUNINSTALL/);
  assert.match(template, /SemverCompare "\$\{VERSION\}" \$R0\s+Pop \$R0\s+\$\{If\} \$R0 = -1/);
});

test("only checksum-pinned published MSI versions can be removed by migration", () => {
  const sources = JSON.parse(read("./windows-nsis-msi-sources.json"));
  const eligible = Array.from(hooks.matchAll(/StrCmp "\$0:\$2" "(\{[0-9A-F-]+\}):(\d+\.\d+\.\d+)" eligible/g), ([, productCode, version]) => [`v${version}`, productCode]);
  assert.deepEqual(eligible, Object.entries(sources).map(([version, { productCode }]) => [version, productCode]));
  assert.match(hooks, /MsiGetProductInfoExW\(w r0, p 0, i 2,/);
  const prepare = hooks.slice(hooks.indexOf("Function FmPrepareInstall"));
  assert.match(prepare, /SemverCompare "\$\{VERSION\}" \$2\s+Pop \$1\s+StrCmp \$1 1 0 not_newer/);
  assert.match(prepare, /Call FmRequireAppClosed\s+Call FmReadAutostart[\s\S]*ExecWait [^\n]+msiexec\.exe[\s\S]*Call FmRestoreAutostart/);
  assert.match(prepare, /no_msi:[\s\S]*Call FmRequireAppClosed\s+Return/);
  assert.doesNotMatch(hooks, /RmShutdown|taskkill/);
});
