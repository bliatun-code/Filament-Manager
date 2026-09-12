import assert from "node:assert/strict";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LOGIN_HELPER_NAME, loginHelperTargets, prepareMacosLoginHelperBundle,
} from "./prepare-macos-login-helper-bundle.mjs";

const source = fileURLToPath(new URL("../src-tauri/macos/filament-manager-login-helper.m", import.meta.url));
const macosOnly = { skip: process.platform !== "darwin" };

function helperFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-helper-bundle-"));
  for (const { target, architecture } of loginHelperTargets("universal-apple-darwin")) {
    writeFileSync(path.join(directory, `${LOGIN_HELPER_NAME}-${target}`), architecture, { mode: 0o755 });
  }
  const run = (args) => {
    if (args[0] === "lipo" && args[1] === "-create") {
      writeFileSync(args.at(-1), args.slice(2, -2).map((file) => readFileSync(file, "utf8")).join(" "));
      return "";
    }
    if (args[0] === "lipo" && args[1] === "-archs") return readFileSync(args[2], "utf8");
    if (args[0] === "otool") return "cmd LC_BUILD_VERSION\nminos 11.0\n";
    throw new Error("Unexpected helper command");
  };
  return { directory, run, platform: "darwin" };
}

test("helper packaging requires an explicit supported target and macOS", () => {
  for (const target of [undefined, "arm64", "aarch64-apple-ios", "x86_64-pc-windows-msvc"]) {
    assert.throws(() => loginHelperTargets(target), /TAURI_ENV_TARGET_TRIPLE/);
  }
  assert.throws(() => prepareMacosLoginHelperBundle({ platform: "win32" }), /requires macOS/);
});

test("helper packaging validates both universal slices and preserves unchanged output", macosOnly, () => {
  const fixture = helperFixture();
  try {
    const file = prepareMacosLoginHelperBundle({ ...fixture, target: "universal-apple-darwin" });
    assert.equal(readFileSync(file, "utf8"), "arm64 x86_64");
    const before = lstatSync(file);
    assert.equal(prepareMacosLoginHelperBundle({ ...fixture, target: "universal-apple-darwin" }), file);
    assert.equal(lstatSync(file).ino, before.ino);
    assert.equal(lstatSync(file).mtimeMs, before.mtimeMs);
    assert.equal(readdirSync(fixture.directory).some((name) => name.startsWith(".universal-")), false);
    assert.match(prepareMacosLoginHelperBundle({ ...fixture, target: "aarch64-apple-darwin" }), /aarch64-apple-darwin$/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("helper packaging rejects wrong slices, deployment drift and linked or missing inputs", macosOnly, () => {
  const fixture = helperFixture();
  const file = path.join(fixture.directory, `${LOGIN_HELPER_NAME}-aarch64-apple-darwin`);
  const options = { ...fixture, target: "universal-apple-darwin" };
  try {
    writeFileSync(file, "x86_64");
    assert.throws(() => prepareMacosLoginHelperBundle(options), /Expected architectures/);
    writeFileSync(file, "arm64");
    assert.throws(() => prepareMacosLoginHelperBundle({ ...options, run: (args) =>
      args[0] === "otool" ? "cmd LC_BUILD_VERSION\nminos 13.0\n" : fixture.run(args),
    }), /deployment target/);
    chmodSync(file, 0o644);
    assert.throws(() => prepareMacosLoginHelperBundle(options), /regular executable/);
    rmSync(file);
    assert.throws(() => prepareMacosLoginHelperBundle(options), /ENOENT/);
    symlinkSync(path.join(fixture.directory, `${LOGIN_HELPER_NAME}-x86_64-apple-darwin`), file);
    assert.throws(() => prepareMacosLoginHelperBundle(options), /regular executable/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("failed universal validation leaves the previous helper intact and removes staging", macosOnly, () => {
  const fixture = helperFixture();
  const target = "universal-apple-darwin";
  try {
    const destination = prepareMacosLoginHelperBundle({ ...fixture, target });
    const before = readFileSync(destination);
    assert.throws(() => prepareMacosLoginHelperBundle({ ...fixture, target, run: (args) => {
      if (args[0] === "lipo" && args[1] === "-create") {
        writeFileSync(args.at(-1), "arm64");
        return "";
      }
      return fixture.run(args);
    } }), /Expected architectures/);
    assert.deepEqual(readFileSync(destination), before);
    assert.equal(readdirSync(fixture.directory).some((name) => name.startsWith(".universal-")), false);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test("compiled login helper validates its containing app without launching it", macosOnly, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-helper-native-"));
  try {
    const binary = path.join(directory, LOGIN_HELPER_NAME);
    const compile = spawnSync("/usr/bin/xcrun", [
      "--sdk", "macosx", "clang", "-mmacosx-version-min=11.0", "-fobjc-arc",
      "-Wall", "-Wextra", "-Werror", "-DFILAMENT_MANAGER_LOGIN_HELPER_TEST",
      "-framework", "Foundation", "-framework", "AppKit", source, "-o", binary,
    ], { encoding: "utf8" });
    assert.equal(compile.status, 0, compile.stderr);
    assert.equal(spawnSync(binary).status, 70, "a loose helper cannot locate an app");
    const app = path.join(directory, "Fixture æøå.app");
    const macos = path.join(app, "Contents", "MacOS");
    mkdirSync(macos, { recursive: true });
    const helper = path.join(macos, LOGIN_HELPER_NAME);
    copyFileSync(binary, helper);
    const executable = path.join(macos, "bambu-filament-manager");
    writeFileSync(executable, "fixture executable is never run", { mode: 0o755 });
    const info = path.join(app, "Contents", "Info.plist");
    const writeInfo = (identifier = "no.bliatun.filamentmanager", executableName = "bambu-filament-manager") => {
      writeFileSync(info, `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>${executableName}</string></dict></plist>`);
    };
    writeInfo();
    assert.equal(spawnSync(helper).status, 0, "the expected app passes without launch");
    writeInfo("unrelated.app");
    assert.equal(spawnSync(helper).status, 70);
    writeInfo(undefined, "other-executable");
    assert.equal(spawnSync(helper).status, 70);
    writeInfo();
    chmodSync(executable, 0o644);
    assert.equal(spawnSync(helper).status, 70);
    rmSync(executable);
    symlinkSync(binary, executable);
    assert.equal(spawnSync(helper).status, 70);
    assert.ok(existsSync(info));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
