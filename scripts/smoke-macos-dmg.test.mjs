import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanupMacosDmgSmokeStaging,
  createMacosDmgSmokeStaging,
  macosDmgInstallCommand,
  macosLaunchServicesArguments,
  macosRunningApplicationMatches,
  initializeMacosDmgSmokeRuntimeLogs,
  parseMacosRunningApplicationRows,
  parseMacosWindowRows,
  publishMacosDmgSmokeLogFile,
  publishMacosDmgSmokeRuntimeLogs,
  resolveMacosDmgSmokeLogPaths,
  resolveMacosDmgSmokeStagingPaths,
  validateMacosDmgSmokeOptions,
  validateMacosDmgSmokeStaging,
} from "./smoke-macos-dmg.mjs";

test("macOS installed DMG smoke requires explicit bounded inputs", () => {
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "",
        launchTimeoutMs: 90_000,
        logDirectory: "logs",
      }),
    /DMG path is required/,
  );
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        launchTimeoutMs: 9_999,
        logDirectory: "logs",
      }),
    /Launch timeout must be an integer/,
  );
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        launchTimeoutMs: 90_000,
        logDirectory: "",
      }),
    /log directory is required/,
  );
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        launchTimeoutMs: 90_000,
        logDirectory: "logs",
        signaturePolicy: "adhoc",
      }),
    /Signature policy must be one of: release, local-adhoc/,
  );
});

test("macOS installed DMG smoke defaults to the release signature policy", () => {
  const options = validateMacosDmgSmokeOptions({
    dmgPath: "candidate.dmg",
    expectedTeamId: "ABCDE12345",
    launchTimeoutMs: 120_000,
    logDirectory: "release-artifacts/smoke",
  });

  assert.equal(options.dmgPath, path.resolve("candidate.dmg"));
  assert.equal(
    options.logDirectory,
    path.resolve("release-artifacts", "smoke"),
  );
  assert.equal(options.expectedTeamId, "ABCDE12345");
  assert.equal(options.launchTimeoutMs, 120_000);
  assert.equal(options.signaturePolicy, "release");
  assert.equal(options.upgradeFixturePath, null);
  assert.equal(options.upgradeSourceRelease, null);
});

test("macOS installed DMG smoke requires complete previous-release fixture identity", () => {
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        expectedTeamId: "ABCDE12345",
        logDirectory: "logs",
        upgradeFixturePath: "v0.27.0.db",
      }),
    /fixture path and source release must be provided together/,
  );
  const options = validateMacosDmgSmokeOptions({
    dmgPath: "candidate.dmg",
    expectedTeamId: "ABCDE12345",
    logDirectory: "logs",
    upgradeFixturePath: "v0.27.0.db",
    upgradeSourceRelease: "v0.27.0",
  });
  assert.equal(options.upgradeFixturePath, path.resolve("v0.27.0.db"));
  assert.equal(options.upgradeSourceRelease, "v0.27.0");
});

test("macOS installed DMG smoke requires the expected release Team ID", () => {
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        logDirectory: "release-artifacts/smoke",
      }),
    /expected Apple Team ID is required/,
  );
});

test("macOS installed DMG smoke accepts explicit local ad-hoc policy", () => {
  const options = validateMacosDmgSmokeOptions({
    dmgPath: "candidate.dmg",
    logDirectory: "release-artifacts/smoke",
    signaturePolicy: "local-adhoc",
  });

  assert.equal(options.expectedTeamId, null);
  assert.equal(options.signaturePolicy, "local-adhoc");
});

test("macOS installed local ad-hoc smoke rejects a release Team ID", () => {
  assert.throws(
    () =>
      validateMacosDmgSmokeOptions({
        dmgPath: "candidate.dmg",
        expectedTeamId: "ABCDE12345",
        logDirectory: "release-artifacts/smoke",
        signaturePolicy: "local-adhoc",
      }),
    /Team ID cannot be used with the local ad-hoc signature policy/,
  );
});

test("macOS DMG smoke resolves staging below the user Applications directory", () => {
  const homeDirectory = path.join(
    tmpdir(),
    "filament-manager-release-runner-home",
  );
  const paths = resolveMacosDmgSmokeStagingPaths({ homeDirectory });

  assert.equal(paths.homeDirectory, path.resolve(homeDirectory));
  assert.equal(
    paths.applicationsDirectory,
    path.join(path.resolve(homeDirectory), "Applications"),
  );
  assert.equal(path.dirname(paths.stagingPrefix), paths.applicationsDirectory);
  assert.match(
    path.basename(paths.stagingPrefix),
    /^\.filament-manager-release-smoke-/,
  );
  assert.throws(
    () =>
      resolveMacosDmgSmokeStagingPaths({
        homeDirectory: "relative-home",
      }),
    /staging home must be an absolute path/,
  );
  assert.throws(
    () =>
      resolveMacosDmgSmokeStagingPaths({
        homeDirectory: path.parse(homeDirectory).root,
      }),
    /staging home cannot be a filesystem root/,
  );
});

test(
  "macOS DMG smoke creates private staging and preserves existing apps",
  { skip: process.platform === "win32" },
  () => {
  const testDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-staging-test-"),
  );
  const homeDirectory = path.join(testDirectory, "home");
  const applicationsDirectory = path.join(homeDirectory, "Applications");
  const existingAppPath = path.join(applicationsDirectory, "Existing.app");
  mkdirSync(existingAppPath, { recursive: true });
  let context = null;
  try {
    context = createMacosDmgSmokeStaging({ homeDirectory });
    assert.equal(
      path.dirname(context.stagingDirectory),
      applicationsDirectory,
    );
    assert.equal(
      lstatSync(context.stagingDirectory).mode & 0o777,
      0o700,
    );
    assert.equal(context.applicationsDirectoryCreated, false);

    cleanupMacosDmgSmokeStaging(context);
    context = null;
    assert.equal(existsSync(existingAppPath), true);
    assert.equal(existsSync(applicationsDirectory), true);
  } finally {
    if (context && existsSync(context.stagingDirectory)) {
      rmSync(context.stagingDirectory, { force: true, recursive: true });
    }
    rmSync(testDirectory, { force: true, recursive: true });
  }
  },
);

test(
  "macOS DMG smoke removes only an empty Applications directory it created",
  { skip: process.platform === "win32" },
  () => {
  const testDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-staging-parent-test-"),
  );
  const homeDirectory = path.join(testDirectory, "home");
  const applicationsDirectory = path.join(homeDirectory, "Applications");
  mkdirSync(homeDirectory, { mode: 0o700 });
  let context = null;
  try {
    context = createMacosDmgSmokeStaging({ homeDirectory });
    assert.equal(context.applicationsDirectoryCreated, true);
    cleanupMacosDmgSmokeStaging(context);
    context = null;
    assert.equal(existsSync(applicationsDirectory), false);
    assert.equal(existsSync(homeDirectory), true);
  } finally {
    if (context && existsSync(context.stagingDirectory)) {
      rmSync(context.stagingDirectory, { force: true, recursive: true });
    }
    rmSync(testDirectory, { force: true, recursive: true });
  }
  },
);

test(
  "macOS DMG smoke fails closed if its unique staging identity changes",
  { skip: process.platform === "win32" },
  () => {
  const testDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-staging-identity-test-"),
  );
  const homeDirectory = path.join(testDirectory, "home");
  mkdirSync(homeDirectory);
  let context = null;
  let originalStagingDirectory = null;
  try {
    context = createMacosDmgSmokeStaging({ homeDirectory });
    originalStagingDirectory = `${context.stagingDirectory}-original`;
    renameSync(context.stagingDirectory, originalStagingDirectory);
    mkdirSync(context.stagingDirectory, { mode: 0o700 });
    assert.throws(
      () => validateMacosDmgSmokeStaging(context),
      /staging directory changed after the smoke staging was created/,
    );
  } finally {
    if (context && existsSync(context.stagingDirectory)) {
      rmSync(context.stagingDirectory, { force: true, recursive: true });
    }
    if (originalStagingDirectory && existsSync(originalStagingDirectory)) {
      rmSync(originalStagingDirectory, { force: true, recursive: true });
    }
    rmSync(testDirectory, { force: true, recursive: true });
  }
  },
);

test(
  "macOS DMG smoke rejects a symlinked user Applications directory",
  { skip: process.platform === "win32" },
  () => {
    const testDirectory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-staging-symlink-test-"),
    );
    const homeDirectory = path.join(testDirectory, "home");
    const outsideDirectory = path.join(testDirectory, "outside");
    mkdirSync(homeDirectory);
    mkdirSync(outsideDirectory);
    symlinkSync(
      outsideDirectory,
      path.join(homeDirectory, "Applications"),
      "dir",
    );
    try {
      assert.throws(
        () => createMacosDmgSmokeStaging({ homeDirectory }),
        /Applications directory must be a real directory, not a symbolic link/,
      );
      assert.equal(existsSync(outsideDirectory), true);
    } finally {
      rmSync(testDirectory, { force: true, recursive: true });
    }
  },
);

test("macOS DMG smoke keeps LaunchServices paths outside the requested log tree", () => {
  const requestedLogDirectory = path.resolve(
    "release-artifacts",
    "macos-smoke",
  );
  const runtimeDirectory = path.resolve("private-runtime");
  const logPaths = resolveMacosDmgSmokeLogPaths({
    logDirectory: requestedLogDirectory,
    runtimeDirectory,
  });
  const launchArguments = macosLaunchServicesArguments({
    appPath: path.resolve("Filament Manager.app"),
    databasePath: path.join(runtimeDirectory, "filament-manager.db"),
    stderrPath: logPaths.runtimePaths.appStderrPath,
    stdoutPath: logPaths.runtimePaths.appStdoutPath,
  });

  assert.equal(
    path.dirname(logPaths.runtimeLogDirectory),
    runtimeDirectory,
  );
  assert.equal(
    Object.values(logPaths.runtimePaths).every((runtimePath) =>
      runtimePath.startsWith(`${logPaths.runtimeLogDirectory}${path.sep}`),
    ),
    true,
  );
  assert.equal(
    launchArguments.some((argument) =>
      String(argument).includes(requestedLogDirectory),
    ),
    false,
  );
  assert.equal(
    Object.values(logPaths.requestedPaths).every((requestedPath) =>
      requestedPath.startsWith(`${requestedLogDirectory}${path.sep}`),
    ),
    true,
  );
  assert.throws(
    () =>
      resolveMacosDmgSmokeLogPaths({
        logDirectory: path.join(runtimeDirectory, "requested"),
        runtimeDirectory,
      }),
    /must be separate trees/,
  );
});

test(
  "macOS DMG smoke publishes all runtime logs atomically with mode 0600",
  { skip: process.platform === "win32" },
  () => {
  const testDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-log-publish-test-"),
  );
  const requestedLogDirectory = path.join(testDirectory, "requested");
  const runtimeDirectory = path.join(testDirectory, "runtime");
  mkdirSync(requestedLogDirectory);
  mkdirSync(runtimeDirectory);
  try {
    const logPaths = resolveMacosDmgSmokeLogPaths({
      logDirectory: requestedLogDirectory,
      runtimeDirectory,
    });
    initializeMacosDmgSmokeRuntimeLogs(logPaths);
    for (const [key, runtimePath] of Object.entries(logPaths.runtimePaths)) {
      writeFileSync(runtimePath, `${key}\n`, { encoding: "utf8" });
      writeFileSync(logPaths.requestedPaths[key], "stale\n", {
        encoding: "utf8",
      });
    }

    assert.deepEqual(
      publishMacosDmgSmokeRuntimeLogs(logPaths).sort(),
      Object.values(logPaths.requestedPaths).sort(),
    );
    for (const [key, requestedPath] of Object.entries(
      logPaths.requestedPaths,
    )) {
      assert.equal(readFileSync(requestedPath, "utf8"), `${key}\n`);
      assert.equal(lstatSync(requestedPath).mode & 0o777, 0o600);
    }
    assert.deepEqual(
      readdirSync(requestedLogDirectory).filter((fileName) =>
        fileName.endsWith(".tmp"),
      ),
      [],
    );
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
  },
);

test(
  "macOS DMG smoke refuses a symlinked requested log destination",
  { skip: process.platform === "win32" },
  () => {
    const testDirectory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-log-symlink-test-"),
    );
    const requestedLogDirectory = path.join(testDirectory, "requested");
    const runtimeDirectory = path.join(testDirectory, "runtime");
    const outsidePath = path.join(testDirectory, "outside.log");
    mkdirSync(requestedLogDirectory);
    mkdirSync(runtimeDirectory);
    try {
      const logPaths = resolveMacosDmgSmokeLogPaths({
        logDirectory: requestedLogDirectory,
        runtimeDirectory,
      });
      initializeMacosDmgSmokeRuntimeLogs(logPaths);
      writeFileSync(outsidePath, "outside\n", { encoding: "utf8" });
      symlinkSync(
        outsidePath,
        logPaths.requestedPaths.appStdoutPath,
        "file",
      );

      assert.throws(
        () =>
          publishMacosDmgSmokeLogFile({
            destinationPath: logPaths.requestedPaths.appStdoutPath,
            sourcePath: logPaths.runtimePaths.appStdoutPath,
          }),
        /Refusing to replace a non-regular macOS smoke log/,
      );
      assert.equal(readFileSync(outsidePath, "utf8"), "outside\n");
    } finally {
      rmSync(testDirectory, { force: true, recursive: true });
    }
  },
);

test("macOS installed DMG smoke preserves metadata and uses normal LaunchServices", () => {
  const mountedAppPath = path.resolve("mounted", "Filament Manager.app");
  const installedAppPath = path.resolve(
    "home",
    "Applications",
    ".filament-manager-release-smoke-test",
    "Filament Manager.app",
  );
  const installCommand = macosDmgInstallCommand(
    mountedAppPath,
    installedAppPath,
  );
  const databasePath = path.resolve("private-runtime", "filament-manager.db");
  const logPaths = resolveMacosDmgSmokeLogPaths({
    logDirectory: path.resolve("release-artifacts", "logs"),
    runtimeDirectory: path.resolve("private-runtime"),
  });
  const launchArguments = macosLaunchServicesArguments({
    appPath: installedAppPath,
    databasePath,
    stderrPath: logPaths.runtimePaths.appStderrPath,
    stdoutPath: logPaths.runtimePaths.appStdoutPath,
  });

  assert.deepEqual(installCommand, {
    args: [mountedAppPath, installedAppPath],
    command: "ditto",
  });
  assert.doesNotMatch(
    installCommand.args.join("\n"),
    /--noextattr|--noqtn|xattr|-cr/,
  );
  assert.deepEqual(
    launchArguments,
    [
      "-n",
      "-W",
      "--env",
      `FILAMENT_MANAGER_DB_PATH=${databasePath}`,
      "--stdout",
      logPaths.runtimePaths.appStdoutPath,
      "--stderr",
      logPaths.runtimePaths.appStderrPath,
      installedAppPath,
    ],
  );
  assert.doesNotMatch(launchArguments.join("\n"), /--noqtn|xattr|ditto/);
  assert.equal(
    launchArguments.some((argument) =>
      Object.values(logPaths.requestedPaths).includes(argument),
    ),
    false,
  );
});

test("macOS installed DMG smoke parses exact running-application identity", () => {
  const bundlePath = path.resolve(
    "home",
    "Applications",
    ".filament-manager-release-smoke-test",
    "Filament Manager.app",
  );
  const executablePath = path.join(
    bundlePath,
    "Contents",
    "MacOS",
    "filament-manager",
  );

  const [application] = parseMacosRunningApplicationRows(
    `4242\tno.bliatun.filamentmanager\t${bundlePath}\t${executablePath}\tFilament Manager\n`,
  );
  assert.deepEqual(application, {
    bundleIdentifier: "no.bliatun.filamentmanager",
    bundlePath,
    executablePath,
    processId: 4242,
    processName: "Filament Manager",
  });
  const expectedIdentity = {
    bundleIdentifier: "no.bliatun.filamentmanager",
    bundlePaths: new Set([bundlePath]),
    executablePaths: new Set([executablePath]),
  };
  assert.equal(
    macosRunningApplicationMatches(application, expectedIdentity),
    true,
  );
  assert.equal(
    macosRunningApplicationMatches(
      { ...application, bundlePath: path.resolve("Other.app") },
      expectedIdentity,
    ),
    false,
  );
  assert.equal(
    macosRunningApplicationMatches(
      { ...application, executablePath: path.resolve("other-executable") },
      expectedIdentity,
    ),
    false,
  );
  assert.equal(
    macosRunningApplicationMatches(
      { ...application, bundleIdentifier: "example.wrong" },
      expectedIdentity,
    ),
    false,
  );
  assert.deepEqual(
    parseMacosRunningApplicationRows(
      `0\tno.bliatun.filamentmanager\t${bundlePath}\t${executablePath}\tInvalid\n`,
    ),
    [],
  );
});

test("macOS installed DMG smoke binds visible windows to the exact process ID", () => {
  assert.deepEqual(
    parseMacosWindowRows(
      [
        "Filament Manager\tDashboard\t20\t40\t900\t700\t4242",
        "Filament Manager\tOther\t0\t0\t300\t200\t0",
        "",
      ].join("\n"),
    ),
    [
      {
        height: 700,
        processId: 4242,
        processName: "Filament Manager",
        signature: "Filament Manager\tDashboard\t20\t40\t900\t700\t4242",
        title: "Dashboard",
        width: 900,
        x: 20,
        y: 40,
      },
    ],
  );
});
