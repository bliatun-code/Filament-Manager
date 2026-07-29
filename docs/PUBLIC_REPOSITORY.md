# Public Repository Publication

Filament Manager must be published from a new, squash-based repository. Do
not change the visibility of the private development repository and do not
push its branches, tags, reflogs, or Git object database to the public
repository.

This boundary is intentional: `npm run check:public-readiness` validates the
current tracked tree, while `npm run audit:public-mirror` validates the complete
history and object database of the new publication repository.

## Prepare the source snapshot

1. Select a reviewed commit on `main` in the private repository.
2. Run `npm ci`, `npm --prefix ./ui ci`, and `npm run verify`.
3. Export only the tracked files from that commit into a new empty directory.
   Do not clone the private repository and do not create an orphan branch
   inside it.
4. Inspect the exported directory before initializing Git. It must not contain
   `.git`, local databases, release artifacts, credentials, signing material,
   internal notes, or personal filesystem paths.
5. Initialize a new repository with `main` as its only branch. Configure the
   public maintainer identity in that repository's local Git configuration
   before creating the snapshot commit:

   ```bash
   git init -b main
   git config --local user.name "bliatun"
   git config --local user.email "bliatun@users.noreply.github.com"
   git add .
   git commit -m "Public source snapshot"
   ```

   These values must match `config/publication-policy.json`. Do not rely on or
   change global Git identity configuration for publication. Both the commit
   author and committer must use this public identity.
6. Install dependencies in the new repository and run:

   ```bash
   npm run verify
   npm run audit:public-mirror
   ```

The mirror audit fails unless the repository is non-shallow, has exactly one
raw root commit with no parent headers, contains only `refs/heads/main`, has a
clean worktree, and has no unreachable Git objects or forbidden historical
paths. It verifies both commit identities against the checked-in publication
policy and the repository-local Git configuration. Identity failures report
only the affected role and category, never the observed or expected name or
email.

UTF-8 and BOM-marked UTF-16 text blobs, together with UTF-8 commit messages,
are scanned for recognized secret and personal-path patterns. Invalid commit
encoding fails closed. An undecodable blob also fails closed unless its tracked
extension and file structure match the narrow PNG, JPEG, ICO, or ICNS asset
classifiers used by the repository. Recognizable ASCII secret and home-path
patterns are scanned across the accepted binary bytes. This does not decode
every EXIF/metadata representation or prove that arbitrary compressed or
encoded binary data is free of secrets.

If any credential or token is discovered, revoke or rotate it before doing
anything else. Rebuild the public repository from a fresh export instead of
rewriting the private repository in place. GitHub's
[sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
explains why rewriting an already shared history is difficult to coordinate.

## Independent history scan

The repository-owned audit is a release gate, not a substitute for a second
scanner. Before the first public push, run a pinned, checksum-verified release
of a dedicated secret scanner against all refs and binary asset bytes in the
new repository. Review every finding and retain a redacted report outside the
repository. Repeat the scan after any publication-candidate change.

After the repository is public, enable GitHub secret scanning and push
protection. Treat any later alert as a potential compromise even when the
matching value appears only in old history.

## Create the public GitHub repository

The published repository keeps the canonical
`bliatun-code/Filament-Manager` slug used by the app, documentation, issue
forms, and release links. Immediately before publication, rename the private
development repository to an explicitly private slug and update its local
remote. Then create a new, empty repository at the canonical slug. Do not use
GitHub's repository importer, do not pre-populate it with a README or license,
and do not transfer old tags. Push only the audited `main` branch. Complete
this rename-and-create handoff in one maintenance window so shipped links do
not remain pointed at the renamed private repository.

Before creating the first version tag:

- require pull requests and the macOS/Windows CI checks on `main`;
- create a tag ruleset targeting `v*` that restricts tag creation, updates, and
  deletion to the release maintainer;
- create the `github-release` environment and allow deployments only from tags
  matching `v*`;
- disable administrator bypass where the account plan supports it;
- keep Apple signing credentials in the existing `macos-release` environment;
- give the release-publishing job only the permissions it needs; and
- enable CodeQL, Dependabot alerts, secret scanning, and push protection.

Do not create a version tag until both the environment and ruleset have been
confirmed in repository settings. Merely naming `github-release` in workflow
YAML is not protection: GitHub can create a missing environment without
reviewers or tag restrictions. The workflow revalidates the tag target
immediately before publication, but the remote tag ruleset remains the control
that prevents a tag from being moved between checks.

GitHub environments can restrict deployment jobs to selected tag patterns, and
tag rulesets can restrict who creates or changes matching tags. These are
repository settings and therefore complement, rather than replace, the
fail-closed checks in the workflow source:

- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)

## First public release

1. Confirm that the update metadata endpoint selected for the public channel is
   anonymously reachable.
2. Run the scheduled supply-chain workflow and resolve every failing audit.
3. Tag the exact reviewed `main` commit with the matching `v<version>` tag.
4. Approve the `github-release` environment only after both exact installers
   have been installed and launched by the release workflow.
5. Download the published artifacts independently and verify their checksums,
   macOS signature/notarization, Windows unsigned policy, SBOM, and public
   provenance.

Keep the private development repository private after publication. Future
public work should happen in the public repository or through explicitly
reviewed source snapshots; never merge private history into it.
