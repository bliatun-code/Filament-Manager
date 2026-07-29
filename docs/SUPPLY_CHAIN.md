# Release Integrity And Supply Chain

Official Filament Manager releases are assembled by the tagged GitHub Actions
workflow from verified job outputs. A release is not published when a required
installer, checksum, source dependency SBOM, or eligible provenance step fails.
Before either installer enters those outputs, the exact release DMG or MSI is
installed and launched with an isolated runtime database, whose integrity and
expected schema are checked. The Windows MSI remains intentionally unsigned.
Its installer smoke fails unless both the MSI and installed executable report
the exact Authenticode status `NotSigned`.

## Release Assets

A tagged release contains:

- the Developer ID-signed, notarized, and stapled Apple Silicon DMG;
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
