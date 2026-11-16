# Usability acceptance protocol

Compare a baseline and a candidate using the same five tasks and starting library.

## Acceptance thresholds

- At least 90% of candidate attempts must be completed without help, both overall and for each task.
- The candidate's overall median duration must be at least 30% shorter than the baseline for matched, unassisted successful attempts.
- A critical data error, wrong-spool mutation, or unrecoverable navigation error makes the attempt unsuccessful even if the participant reaches the final screen.

The timing threshold is reported per task as well, but the blocking 30% threshold applies to the combined matched attempts. This avoids hiding a weak task while keeping the small baseline study statistically usable.

## Participants and setup

- Use at least five participants who perform filament-inventory work or understand the workshop workflow.
- Give each participant a pseudonymous ID such as `P01`; do not record names, email addresses, or free-form personal notes in the results file.
- Counterbalance build order: half start with the baseline and half with the candidate. The preparation command defaults to six participant slots for an even split. Five still meets the minimum; with an odd count, record the one-person imbalance in advance.
- Reset the fixed test fixture before each task and build. The fixture must contain at least two printers, one open printer slot, one active outbound loan, one on-order wishlist item, and visually similar spools that make accidental selection observable. A failed or completed task must not change the next task's starting state.
- Use the same machine class, display size, locale, theme, and input method for both runs.

## Fixed tasks

| ID | Task | Starting state | Success condition |
| --- | --- | --- | --- |
| `register` | Register a new owned spool | Inventory is open; the target filament identity and initial weight are provided on the task card. | Exactly one matching spool exists with the supplied weight and home location. |
| `find` | Find a specified existing spool | Dashboard is open; the task card gives material, colour and location. | The correct spool detail is open, with no inventory mutation. |
| `load` | Load the selected spool into a printer | The target spool detail is open and a target printer/slot is given. | That exact spool is assigned to the target slot and no other assignment changed. |
| `lend` | Lend the selected spool to a named borrower | The target spool detail is open; borrower and outgoing weight are provided. | One active outbound loan exists for that spool with the supplied borrower and weight. |
| `receive` | Receive an on-order item into stock | The main Inventory view is open with purchase dialogs closed; the target item and quantity are provided. | The requested number of spools exists and the queue quantity/status is correct. |

## Prepare the study

Create a new private directory outside the repository; its parent must already
exist. Resolve the baseline and candidate before collecting any measurements:

```sh
npm run qa:usability:prepare -- --baseline="$baseline_ref" --candidate="$candidate_ref" --output=/absolute/path/to/new-study
```

Set `baseline_ref` and `candidate_ref` to the Git refs you want to compare.
The command resolves both to commits and checks that their source supports
the schema-2 fixture. Build and launch the study artifacts separately.

The command creates a private `study.json` manifest, an unfilled `results.json`
template, moderator and participant `task-cards.md`, the read-only `fixture.db`,
and an independent writable database in `sessions/` for each build, participant
and task. The fixture uses synthetic identities and has LAN disabled. An
existing output directory is rejected.

Before timing, fill in the artifact paths and checksums, verify their source
commits, and rehearse both artifacts using disposable fixture copies. Confirm
all five starting states and outcomes, then record `launch_verified`. Source
schema compatibility alone does not prove the installed artifacts are ready.
Close the app between tasks and launch the isolated study build with
`FILAMENT_MANAGER_DB_PATH` pointing to that task's private database. Keep the
pristine fixture and normal user library out of the launch path. Follow the
native isolation procedure below before starting either artifact.

The planned setup uses English, Dark, and a predeclared ten-minute task limit.
Select and verify English and Dark in each app before timing, then record
`preferences_verified` in the manifest. Turn off General → Updates → Check
automatically for each task so update prompts do not interrupt measurements.
Separate database copies do not reset the app's local UI preferences.
The participant count and limit can be chosen with `--participants=6` and
`--time-limit-seconds=600`. Choose the setup before the study, use it for both
builds, and document any deviation, including actual build order or a repeated
attempt. Do not silently replace a failed attempt with a better repeat.

### Native macOS build and launch isolation

A database override isolates SQLite only. The ordinary macOS app identifier
also owns the single-instance socket, webview storage and desktop preferences.
Renaming an `.app`, or editing its `Info.plist` after compilation, does not
isolate the compiled single-instance identifier.

For local study builds, create detached worktrees at the two commits recorded
in `study.json`. Keep the source trees unchanged and use an external Tauri
configuration overlay for each build. Give each a distinct study-only
`identifier`, such as `no.bliatun.fmstudy.<study-id>.baseline` and
`no.bliatun.fmstudy.<study-id>.candidate`. Copy that ref's complete `app.windows`
array into the overlay and add `"incognito": true` to the main window. On macOS
this uses a nonpersistent webview data store. Preserve the same window size
and other window options in both builds. Set
`"bundle": { "macOS": { "signingIdentity": "-" } }` for local ad-hoc signing.

Install each ref's locked root and UI dependencies, then build the release
profile from each worktree with a separate target directory:

```sh
npm ci
npm --prefix ./ui ci
CARGO_TARGET_DIR=/absolute/path/to/study-target \
  npm run tauri -- build --bundles app --config /absolute/path/to/overlay.json --ci
```

Use the same Rust toolchain, architecture and build profile for both. Keep
release-signing and notarization credentials out of these build processes.
Record the source commit, overlay and its SHA-256, tool versions, build log,
bundle identifier and artifact checksum. These are derived study builds;
they are not the official signed release artifacts. Verify the bundle's code
signature and identifier before launching. If the study requires unchanged
official binaries instead, use a virtual machine, or a separate macOS user
with the ordinary app fully quit in every other login session. The original
single-instance socket is shared across users in `/tmp/`.

Launch the exact executable inside the study bundle from a shell with no
other visual-QA scenario or packaged-test overrides:

```sh
FILAMENT_MANAGER_DB_PATH=/absolute/path/to/disposable-task.db \
FILAMENT_MANAGER_VISUAL_QA=1 \
  '/absolute/path/to/Filament Manager.app/Contents/MacOS/bambu-filament-manager'
```

Verify that both study builds honor the QA flag before testing. Select English
and Dark and turn off automatic update checks after each launch because
incognito storage resets these preferences. Launch from the shell to pass both
overrides. Quit the process completely before changing tasks.

Rehearse with new disposable copies outside `sessions/`. Verify the five task
outcomes against before/after database state, account separately for startup
migrations, and retain the observations as rehearsal evidence. Preserve the
participant databases, actual build orders and unmeasured result fields.
An automated rehearsal does not start the human study or supply participant
durations, completion rates or assistance scores.

### Check the library after startup

App initialization can migrate the database and seed the bundled catalog.
Record each build's post-startup catalog and take the task's before snapshot
after startup has settled. Check that the original fixture records and slot
assignments remain intact and that the target is unambiguous. Different bundled
catalogs affect workflow comparisons. Rehearse with identical catalog contents
if the study is intended to isolate an interface change.

The [automated quality gates](QUALITY_GATES.md) check persisted outcomes for
these workflows. Human timing and assistance data come from the study.

## Moderator rules

1. Read the task card verbatim and start the timer when the participant first controls the app.
2. Do not suggest labels, pages, shortcuts, or recovery steps. Answering a workflow question marks `assisted: true`.
3. Stop the timer when the success condition is visible and verifiable, a critical error prevents continuation, the participant stops, or the predeclared time limit is reached. Record the actual elapsed time and stop reason; an unsuccessful attempt uses `completed: false`, never a fabricated success or a zero-duration placeholder.
4. Set `critical_error: true` for wrong-record mutation, duplicate creation beyond the requested quantity, data loss, or a state the participant cannot recover without reset.
5. Reset the fixture after every critical error and before switching builds.

## Result format

Store results outside the repository as a JSON array. Each participant must have exactly one `baseline` and one `candidate` record for every task.

```json
[
  {
    "participant_id": "P01",
    "build": "baseline",
    "task": "register",
    "duration_ms": 82000,
    "completed": true,
    "assisted": false,
    "critical_error": false
  }
]
```

Analyze a completed study with:

```sh
npm run --silent qa:usability:analyze -- /absolute/path/to/results.json
```

The command exits non-zero when the dataset is incomplete or either blocking threshold is missed. It reports the actual number of comparable timing pairs overall and for each task without printing participant IDs. Keep the raw participant file private; attach only the aggregate command output to the release evidence.

Use `--silent` when collecting output to share so npm omits the private input
path. Review the number of successful unassisted pairs and report gaps by task.
Moderators verify artifact identity, build order and human participation.

## Release evidence

Record the baseline commit, candidate commit, fixture revision, participant count, aggregate unassisted completion rate, per-task rates, matched median durations, and the analyzer result. Any protocol deviation must be documented before interpreting the numbers.
