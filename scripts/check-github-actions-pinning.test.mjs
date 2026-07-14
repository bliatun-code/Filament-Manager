import assert from "node:assert/strict";
import test from "node:test";

import { findUnpinnedActionUses } from "./check-github-actions-pinning.mjs";

test("GitHub Actions pinning accepts commit SHAs, local actions and Docker digests", () => {
  const errors = findUnpinnedActionUses(`
steps:
  - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5
  - uses: "owner/repository/path@0123456789abcdef0123456789abcdef01234567"
  - uses: ./github/actions/local
  - uses: docker://alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
`);

  assert.deepEqual(errors, []);
});

test("GitHub Actions pinning rejects mutable tags and branches", () => {
  const errors = findUnpinnedActionUses(
    `
steps:
  - uses: actions/checkout@v5
  - uses: dtolnay/rust-toolchain@stable
  - uses: docker://alpine:latest
`,
    ".github/workflows/fixture.yml",
  );

  assert.deepEqual(
    errors.map(({ file, line, reference }) => ({ file, line, reference })),
    [
      {
        file: ".github/workflows/fixture.yml",
        line: 3,
        reference: "actions/checkout@v5",
      },
      {
        file: ".github/workflows/fixture.yml",
        line: 4,
        reference: "dtolnay/rust-toolchain@stable",
      },
      {
        file: ".github/workflows/fixture.yml",
        line: 5,
        reference: "docker://alpine:latest",
      },
    ],
  );
});

test("GitHub Actions pinning checks reusable workflow references", () => {
  const errors = findUnpinnedActionUses(`
jobs:
  shared:
    uses: organization/repository/.github/workflows/shared.yml@main
`);

  assert.equal(errors.length, 1);
  assert.equal(
    errors[0].reference,
    "organization/repository/.github/workflows/shared.yml@main",
  );
});
