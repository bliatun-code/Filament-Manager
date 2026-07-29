# Release Integrity And Supply Chain

Official Filament Manager releases are assembled by the tagged GitHub Actions
workflow from verified job outputs. A release is not published when a required
installer, checksum, source dependency SBOM, or eligible provenance step fails.
Each build job uploads its statically verified candidate and downloads that
exact workflow artifact again before installation testing. The Universal 2 DMG
is additionally downloaded, verified, installed, and launched on a separate
native Intel runner; the build job performs the same checks on Apple Silicon.
The publish and public-provenance jobs cannot proceed unless both macOS
architecture smokes and the Windows candidate job succeed. The Windows MSI
remains intentionally unsigned. Its installer smoke fails unless both the MSI
and installed executable report the exact Authenticode status `NotSigned`.

Release publication uses the separate `github-release` environment and an
exact `refs/tags/v<package-version>` source check. The GitHub environment must
also be configured to accept only `v*` tags, while a tag ruleset limits who can
create, update, or delete those tags. The publish job resolves the remote tag
again immediately before creating the release and requires it to still point
to the workflow commit. Apple credentials remain isolated in the separate
`macos-release` environment. The Intel smoke receives no signing or
notarization secrets; it uses the public `EXPECTED_APPLE_TEAM_ID` repository
variable to verify the already signed artifact.

## Release Assets

A tagged release contains:

- the Developer ID-signed, notarized, and stapled Universal 2 DMG for Apple
  Silicon and Intel;
- the currently unsigned per-user Windows x64 MSI;
- one SHA-256 manifest for each installer;
- `Filament-Manager_<version>_source.spdx.json`, an SPDX 2.3 source dependency
  SBOM;
- `SHA256SUMS-sbom.txt` for that SBOM; and
- when the repository is public, a Sigstore JSON bundle containing GitHub
  artifact attestations for the DMG and MSI.

The source SBOM is generated from a clean checkout with a pinned Syft version,
then checked by the repository's fail-closed validator. It describes
dependencies discoverable from the source tree and lockfiles. It can include
development and build dependencies; it is not an exact inventory of files or
runtime libraries inside either installer.

The scheduled dependency-security workflow separately checks both npm
lockfiles and the Cargo graph for live vulnerability advisories and license
policy violations. See
[Dependency Security And License Policy](DEPENDENCY_SECURITY.md). These
network-dependent checks deliberately remain outside the deterministic
`npm run verify` gate.

## Verify Checksums

Use the platform-specific instructions for the installer itself:

- [macOS installation and verification](MACOS_DISTRIBUTION.md)
- [Windows installation and verification](WINDOWS_DISTRIBUTION.md)

On macOS or Linux, the SBOM checksum can be checked with:

```bash
sha256sum --check SHA256SUMS-sbom.txt
```

On macOS systems without `sha256sum`, use:

```bash
expected="$(awk '{print $1}' SHA256SUMS-sbom.txt)"
actual="$(shasum -a 256 Filament-Manager_*_source.spdx.json | awk '{print $1}')"
test "$actual" = "$expected"
```

When the matching source tag is checked out, the SBOM shape, application
version, package graph, and privacy contract can also be validated with:

```bash
version="<version>"
node scripts/verify-release-sbom.mjs \
  "Filament-Manager_${version}_source.spdx.json" \
  --expected-package=bambu-filament-manager \
  --expected-version="$version"
```

## Verify Public Build Provenance

GitHub artifact attestations are generated only for public tag releases. The
public release cannot be published unless both installers are rechecked and
attested in the separate least-privilege provenance job.

With GitHub CLI installed, verify a downloaded installer against the tagged
release workflow:

```bash
gh attestation verify Filament-Manager_<version>_<platform>.<ext> \
  --repo bliatun-code/Filament-Manager \
  --signer-workflow bliatun-code/Filament-Manager/.github/workflows/release-build.yml \
  --source-ref refs/tags/v<version>
```

The release's `.sigstore.json` bundle can also be retained for later or offline
verification. Private-repository builds intentionally skip attestation because
GitHub does not provide this capability for private repositories on every
account plan; they still require the verified SBOM and installer checksums.

Checksums prove byte identity with the published manifests, and attestations
bind public installer artifacts to the release workflow and source tag. Neither
is proof that an artifact is vulnerability-free. Report security concerns
through [the security policy](../SECURITY.md).

Before the source repository is made public, follow the clean-mirror and
full-history procedure in
[Public Repository Publication](PUBLIC_REPOSITORY.md). The ordinary
public-readiness check covers the current tree only; the mirror audit also
checks every reachable text blob, historical filename, commit message, ref,
and Git object, and rejects inherited or unreachable private objects.
