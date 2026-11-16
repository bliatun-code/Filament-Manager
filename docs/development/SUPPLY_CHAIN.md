# Release Integrity And Supply Chain

The [tagged release workflow](../../.github/workflows/release-build.yml)
publishes after verifying the installer artifacts, checksums, source SBOM, and
required provenance. The candidate packages are downloaded and installed from
the verified workflow artifacts. The Universal 2 DMG is tested on native Apple
Silicon and Intel runners. The Windows gate tests clean NSIS installation and
upgrades from the pinned published MSI and NSIS installers. The Windows
installer and installed executable must both report Authenticode `NotSigned`.

Release publication uses the separate `github-release` environment and an
exact `refs/tags/v<package-version>` source check. The GitHub environment must
also be configured to accept only `v*` tags. One tag ruleset restricts creation
to the release maintainer; a second prevents updates, non-fast-forward changes,
and deletion. The publish job resolves the remote tag again immediately before
creating a draft and requires it to still point to the workflow commit. It
uploads without replacement, verifies the remote asset names and sizes against
the local verified set, and only then publishes. If the job fails before
publication, it removes only the draft created by that run. Apple credentials
remain isolated in the separate `macos-release` environment. The Intel smoke
receives no signing or notarization secrets; it uses the public
`EXPECTED_APPLE_TEAM_ID` repository variable to verify the already signed
artifact.

GitHub release immutability applies after publication and only to releases
created after the repository setting was enabled. Drafts remain editable so
the workflow can upload and verify the complete asset set before making it
public.

## Release Assets

A tagged release contains:

- the Developer ID-signed, notarized, and stapled Universal 2 DMG for Apple
  Silicon and Intel;
- the unsigned per-user Windows x64 NSIS installer (`_x64-setup.exe`);
- one SHA-256 manifest for each installer;
- `Filament-Manager_<version>_source.spdx.json`, an SPDX 2.3 source dependency
  SBOM;
- `SHA256SUMS-sbom.txt` for that SBOM; and
- when the repository is public, a Sigstore JSON bundle containing GitHub
  artifact attestations for the DMG and NSIS installer.

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

Retain the release's `.sigstore.json` bundle for offline verification.

Checksums prove byte identity with the published manifests, and attestations
bind public installer artifacts to the release workflow and source tag. Neither
is proof that an artifact is vulnerability-free. Report security concerns
through [the security policy](../../SECURITY.md).

The repository is public. Follow
[Public Repository Security](PUBLIC_REPOSITORY.md) for the current full-history
secret-scanning procedure and the separate clean-mirror audit used for future
source exports. The ordinary public-readiness check covers the current tree
only.

## Retaining releases

Keep the three newest release entries available for download. Also keep the
public installers referenced by the
[MSI migration manifest](../../scripts/windows-nsis-msi-sources.json) and the
[NSIS upgrade manifest](../../scripts/windows-nsis-upgrade-source.json).
Installer tests download those assets by tag.

Before removing an eligible older release entry, archive its installers,
checksums, SBOM, provenance and release metadata locally. Verify all asset
digests. Immutability protects individual assets of published releases.
Retention operates on whole release entries. Keep the original Git tags and
source commits for historical links and database fixtures.
