import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePublicReadiness,
  collectTrackedFiles,
} from "./check-public-readiness.mjs";

const MINIMAL_RECOGNIZED_PNG = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]);

function analyzeFixture(files) {
  return analyzePublicReadiness({
    trackedFiles: Object.keys(files),
    readTrackedFile: (file) => files[file],
  });
}

test("tracked file collection uses a NUL-delimited git file list", () => {
  const calls = [];
  const files = collectTrackedFiles("/repository", (command, args, options) => {
    calls.push({ command, args, options });
    return Buffer.from("README.md\0docs/guide with spaces.md\0");
  });

  assert.deepEqual(files, ["README.md", "docs/guide with spaces.md"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args, ["ls-files", "-z"]);
  assert.equal(calls[0].options.cwd, "/repository");
  assert.equal(calls[0].options.encoding, null);
});

test("public readiness accepts generic examples, templates, and valid local references", () => {
  const result = analyzeFixture({
    ".env.example": "PUBLIC_BASE_URL=http://localhost:4278\n",
    "README.md": [
      "[Guide](docs/GUIDE.md)",
      '<img src="docs/screenshots/example.png" alt="Example">',
      "Generic paths: /Users/example/Downloads and C:\\Users\\Alex\\Downloads", // path-portability-allow: intentional cross-platform public-readiness fixture
      "Placeholder only: github_pat_REPLACE_ME",
    ].join("\n"),
    "docs/GUIDE.md": "[Back](../README.md)\n",
    "docs/screenshots/example.png": MINIMAL_RECOGNIZED_PNG,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.trackedFilesChecked, 4);
  assert.equal(result.textFilesChecked, 3);
});

test("public readiness scans UTF-16LE and UTF-16BE text with a BOM", () => {
  const token = ["github", "_pat_", "A".repeat(32)].join("");
  const source = `Public notes\n${token}\n`;
  const littleEndianBody = Buffer.from(source, "utf16le");
  const bigEndianBody = Buffer.from(littleEndianBody);
  bigEndianBody.swap16();
  const result = analyzeFixture({
    "docs/little-endian.txt": Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      littleEndianBody,
    ]),
    "docs/big-endian.txt": Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      bigEndianBody,
    ]),
  });

  assert.deepEqual(
    result.errors.map(({ file, line, label }) => ({ file, line, label })),
    [
      {
        file: "docs/little-endian.txt",
        line: 2,
        label: "GitHub access token",
      },
      {
        file: "docs/big-endian.txt",
        line: 2,
        label: "GitHub access token",
      },
    ],
  );
  assert.equal(result.textFilesChecked, 2);
});

test("public readiness fails closed on opaque bytes and false binary extensions", () => {
  const result = analyzeFixture({
    "docs/opaque.dat": Buffer.from([0xc3, 0x28, 0xff]),
    "docs/not-really.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
  });

  assert.deepEqual(
    result.errors.map(({ file, label }) => ({ file, label })),
    [
      {
        file: "docs/opaque.dat",
        label:
          "tracked file is neither supported text nor an explicitly recognized binary asset",
      },
      {
        file: "docs/not-really.png",
        label:
          "tracked file is neither supported text nor an explicitly recognized binary asset",
      },
    ],
  );
  assert.equal(result.textFilesChecked, 0);
});

test("public readiness scans recognizable ASCII secrets inside accepted binary assets", () => {
  const token = ["github", "_pat_", "A".repeat(32)].join("");
  const pngWithMetadata = Buffer.concat([
    MINIMAL_RECOGNIZED_PNG.subarray(0, 8),
    Buffer.from(token, "ascii"),
    MINIMAL_RECOGNIZED_PNG.subarray(8),
  ]);
  const result = analyzeFixture({
    "docs/metadata.png": pngWithMetadata,
  });

  assert.deepEqual(
    result.errors.map(({ file, label }) => ({ file, label })),
    [
      {
        file: "docs/metadata.png",
        label: "GitHub access token",
      },
    ],
  );
  assert.equal(result.textFilesChecked, 0);
});

test("public readiness rejects internal notes and sensitive or built artifacts", () => {
  const files = Object.fromEntries(
    [
      ".DS_Store",
      ".env.local",
      ".netrc",
      ".npmrc",
      "Developer-Team-Key.txt",
      "docs/MACOS_SIGNING.md",
      "docs/internal/ROADMAP.md",
      "release/Filament-Manager.dmg",
      "release/Filament-Manager.app/Contents/Info.plist",
      "secrets/credentials.json",
      "secrets/workshop-service-account.json",
      "state/filament-manager.db",
    ].map((file) => [file, "fixture"]),
  );
  const labels = analyzeFixture(files).errors.map(({ file, label }) => ({
    file,
    label,
  }));

  assert.deepEqual(labels, [
    { file: ".DS_Store", label: "macOS metadata artifact" },
    { file: ".env.local", label: "environment file" },
    {
      file: ".netrc",
      label: "credential or secret configuration filename",
    },
    {
      file: ".npmrc",
      label: "credential or secret configuration filename",
    },
    { file: "Developer-Team-Key.txt", label: "internal signing or notarization filename" },
    { file: "docs/MACOS_SIGNING.md", label: "internal signing or notarization filename" },
    { file: "docs/internal/ROADMAP.md", label: "internal document" },
    { file: "release/Filament-Manager.dmg", label: "built release artifact" },
    {
      file: "release/Filament-Manager.app/Contents/Info.plist",
      label: "built release artifact",
    },
    {
      file: "secrets/credentials.json",
      label: "credential or secret configuration filename",
    },
    {
      file: "secrets/workshop-service-account.json",
      label: "credential or secret configuration filename",
    },
    { file: "state/filament-manager.db", label: "database artifact" },
  ]);
});

test("public readiness rejects personal absolute home paths but supports documented fixtures", () => {
  const macosPrivatePath = [
    "",
    "Users",
    "private-person",
    "Documents",
    "release.txt",
  ].join("/");
  const linuxPrivatePath = [
    "",
    "home",
    "private-person",
    "build",
    "release.txt",
  ].join("/");
  const windowsPrivatePath = [
    "C:",
    "Users",
    "Private Person",
    "Documents",
    "release.txt",
  ].join("\\");
  const macosPrivateHome = ["", "Users", "private-person"].join("/");
  const linuxPrivateHome = ["", "home", "private-person"].join("/");
  const windowsPrivateHome = ["C:", "Users", "Private Person"].join("\\");
  const result = analyzeFixture({
    "docs/path.md": [
      macosPrivatePath,
      linuxPrivatePath,
      windowsPrivatePath,
      macosPrivateHome,
      linuxPrivateHome,
      windowsPrivateHome,
      "/Users/documented/fixture // public-readiness-allow: deliberate generic fixture", // path-portability-allow: intentional allow-marker fixture
      "/Users/example/fixture", // path-portability-allow: intentional generic username fixture
      "/Users/example", // path-portability-allow: intentional generic username fixture
      "/Users/O'Brien/fixture", // path-portability-allow: intentional generic username fixture
      "/home/O'Brien/fixture", // path-portability-allow: intentional generic username fixture
      "/home/runner", // path-portability-allow: intentional generic username fixture
      "C:\\Users\\Alex", // path-portability-allow: intentional generic username fixture
      "C:\\Users\\O'Brien\\fixture", // path-portability-allow: intentional generic username fixture
    ].join("\n"),
  });

  assert.deepEqual(
    result.errors.map(({ line, label }) => ({ line, label })),
    [
      { line: 1, label: "personal absolute macOS home path" },
      { line: 4, label: "personal absolute macOS home path" },
      { line: 2, label: "personal absolute Linux home path" },
      { line: 5, label: "personal absolute Linux home path" },
      { line: 3, label: "personal absolute Windows home path" },
      { line: 6, label: "personal absolute Windows home path" },
    ],
  );
});

test("public readiness rejects private-key and access-token shapes", () => {
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const githubToken = ["github", "_pat_", "A".repeat(32)].join("");
  const awsKey = ["AK", "IA", "A".repeat(16)].join("");
  const result = analyzeFixture({
    "fixture.txt": [privateKey, githubToken, awsKey].join("\n"),
  });

  assert.deepEqual(
    result.errors.map(({ line, label }) => ({ line, label })),
    [
      { line: 1, label: "private key material" },
      { line: 2, label: "GitHub access token" },
      { line: 3, label: "AWS access key" },
    ],
  );
});

test("public readiness reports missing Markdown and HTML document assets", () => {
  const result = analyzeFixture({
    "README.md": [
      "[Missing guide](docs/MISSING.md)",
      "![Missing screenshot](docs/screenshots/missing.jpg)",
      '<a href="docs/ALSO_MISSING.md">Missing</a>',
      "[Existing guide](docs/GUIDE.md#section)",
      "[External](https://example.com/missing.md)",
      "[Anchor](#local-heading)",
    ].join("\n"),
    "docs/GUIDE.md": "# Section\n",
  });

  assert.deepEqual(
    result.errors.map(({ line, label, detail }) => ({ line, label, detail })),
    [
      {
        line: 1,
        label: "missing tracked document or asset reference",
        detail: "docs/MISSING.md",
      },
      {
        line: 2,
        label: "missing tracked document or asset reference",
        detail: "docs/screenshots/missing.jpg",
      },
      {
        line: 3,
        label: "missing tracked document or asset reference",
        detail: "docs/ALSO_MISSING.md",
      },
    ],
  );
});
