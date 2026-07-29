# Update Metadata Channel

Filament Manager never checks for updates automatically. The manual
**Check for updates** action is also disabled at build time unless the build
has an explicitly configured, anonymously readable metadata endpoint.

This fail-safe default is intentional. An anonymous request to
`releases/latest` returns `404 Not Found` while the GitHub repository is
private, so a private release page is not a reliable application update
channel.

## Public metadata contract

Release builds may set:

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
reported as unavailable release information.

## Choosing the publication model

Before enabling the channel, choose one of these models:

1. Make the clean public repository and its releases anonymously readable,
   then build with its public GitHub `releases/latest` API URL.
2. Keep release source or assets private, but publish the minimal JSON document
   above at a stable public endpoint. This can notify users that a version
   exists, but a usable unauthenticated download still requires a public
   release page or public artifact location.

The URL is compiled into the application. Changing it therefore requires a new
build. Release CI reads the optional
`vars.FILAMENT_MANAGER_UPDATE_METADATA_URL` repository variable for both macOS
and Windows builds; leaving it unset produces the disabled channel. The
sanitized support file deliberately does not include the metadata URL.

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
