# Update Metadata Channel

Release builds made with an explicitly configured, anonymously readable
metadata endpoint support both the retained manual **Check for updates** action
and optional automatic update notifications. When automatic checking is
enabled, the app waits briefly after startup and checks at most once per 24
hours. The automatic path shows a banner only when a newer version exists;
up-to-date, disabled-channel, unavailable-metadata, and other failure results
stay silent. Download and installation always remain manual.

The public repository now uses:

```text
FILAMENT_MANAGER_UPDATE_METADATA_URL=https://api.github.com/repos/bliatun-code/Filament-Manager/releases/latest
```

The repository variable was configured after the `v0.22.0` installers were
built. Those existing binaries retain the disabled fail-safe and therefore need
one manual bridge upgrade to a newer release. Automatic notifications can work
only after that newer release build, which receives the public channel, is
installed.

## Public metadata contract

Custom or non-canonical distribution builds may set:

```text
FILAMENT_MANAGER_UPDATE_METADATA_URL=https://updates.example.org/filament-manager/latest.json
```

The endpoint must:

- be public and require no token, cookie, client certificate, or other secret;
- use HTTPS without embedded credentials, query parameters, or a fragment;
- return a successful response without redirects;
- return at most 64 KiB of JSON in this form:

  ```json
  {
    "tag_name": "v0.22.0"
  }
  ```

The app compares the semantic version only. It does not run an installer or
trust a download URL from the response. **View release** remains pinned to the
project's known GitHub release page.

Do not place access tokens in the URL. Invalid configuration, an absent
endpoint, redirects, network failures, non-success responses, oversized
responses, malformed JSON, and invalid release versions all fail closed. An
absent or invalid endpoint is reported as a disabled update channel without
making a network request; failures from a configured public endpoint are
reported as unavailable release information. These details remain visible from
the manual action. Automatic checks suppress them and notify only for
`UPDATE_AVAILABLE`.

## Publication model

The canonical source repository and releases are anonymously readable, so the
GitHub `releases/latest` API is the selected metadata source. If that
publication model changes later, use a stable public endpoint that implements
the same minimal JSON contract. A usable unauthenticated download still
requires a public release page or public artifact location.

The URL is compiled into the application. Changing it therefore requires a new
build. Release CI reads `vars.FILAMENT_MANAGER_UPDATE_METADATA_URL` for both
macOS and Windows builds. A canonical tag release fails validation unless that
variable exactly names the GitHub `releases/latest` API shown above. Manual
workflow-dispatch and non-canonical builds may still leave it unset, producing
the disabled channel used for release-candidate testing. The sanitized support
file deliberately does not include the metadata URL.

## Build identity in support files

The build script records non-secret identity fields for the sanitized
`filament-manager-support-v2` file:

- `build.commit`: `FILAMENT_MANAGER_BUILD_COMMIT`, or the validated
  `GITHUB_SHA`, otherwise `unknown`;
- `build.target`: `FILAMENT_MANAGER_BUILD_TARGET`, or Cargo's target triple;
- `build.distribution_channel`: an explicit
  `FILAMENT_MANAGER_DISTRIBUTION_CHANNEL`, otherwise `github-release` for tag
  builds, `ci-artifact` for other GitHub Actions builds, or `development`.

These fields identify the binary being diagnosed without exposing the local
database path, repository checkout path, update endpoint, credentials, or
inventory data.
