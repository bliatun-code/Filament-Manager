# v0.1.1 Hardening Plan

Date: 2026-04-05

## Goal
Ship a fast-follow stability/security patch after `v0.1.0` without changing product scope.

## Scope
1. Web UI bundle hygiene
2. Dependency/security hygiene
3. Regression confidence

## Planned Items
- Keep `Settings` page action-only heavy modules lazy-loaded (QR/PDF helpers).
- Keep production build free from the previous `settings` chunk-size warning regression.
- Keep root and `ui` lockfiles refreshed to latest allowed ranges.
- Run and record:
  - `npm audit` (root)
  - `npm audit` (`ui`)
  - `npm run smoke`
- Re-check GitHub Dependabot alerts in repository Security tab with an owner token that has `security_events` scope.
- If open alerts remain, patch affected package ranges and re-run smoke before release.

## Exit Criteria
- `npm audit` shows no moderate/high/critical issues in both package roots.
- `npm run smoke` passes.
- No bundle warning regression for the `settings` page baseline.
- Release notes mention any remaining known risks explicitly.

