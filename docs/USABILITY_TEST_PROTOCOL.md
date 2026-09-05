# Usability acceptance protocol

This protocol turns the roadmap's usability targets into one repeatable release gate. It is used for the baseline build and again for the candidate build with the same seeded library and the same five tasks.

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

The `receive` starting state is deliberately shared by older builds with a
purchase dialog and newer builds with a dedicated purchases view. Establish
this same state in both builds before timing; finding the purchase workflow is
part of the task.

## Prepare the study

Create a new private directory outside the repository; its parent must already
exist. Resolve the baseline and candidate before collecting any measurements:

```sh
npm run qa:usability:prepare -- --baseline=v0.27.0 --candidate=HEAD --output=/absolute/path/to/new-study
```

`v0.27.0` is an example baseline from before the improvement plan. Select the
comparison that answers the study question, and use the same pinned candidate
for every participant. The command resolves both refs to immutable commits and
checks that their source supports the schema-2 fixture. It does not build or
launch either artifact.

The generated directory contains:

- `study.json`: build commits, source schema versions, fixture SHA-256, planned
  build order, and unfilled artifact, rehearsal and machine details.
- `results.json`: one baseline and candidate record per task and participant,
  with all measurements and outcomes set to `null`.
- `task-cards.md`: five fixed English participant cards and a separate
  moderator answer key using only the reviewed synthetic identities.
- `fixture.db`: the read-only schema-2 starting fixture, with local networking
  disabled, the lending spool available and a two-roll item on order.
- `sessions/`: a separate byte-identical writable fixture copy for every task,
  build and participant. The default six slots produce 60 databases and 60
  unmeasured records.

Existing output directories are rejected rather than overwritten. The
preparation command never reads a user's inventory database or fills in
participant outcomes. Six slots mean planned participants, not completed
participation. The unfilled result template intentionally fails the analyzer.

Before timing, fill in the artifact paths and checksums, verify their source
commits, and rehearse both artifacts using disposable fixture copies. Confirm
all five starting states and outcomes, then record `launch_verified`. Source
schema compatibility alone does not prove the installed artifacts are ready.
Close the app between tasks and launch the chosen build with
`FILAMENT_MANAGER_DB_PATH` pointing to that task's private database. Keep the
pristine fixture and normal user library out of the launch path.

The planned setup uses English, Dark, and a predeclared ten-minute task limit.
Select and verify English and Dark in each app before timing, then record
`preferences_verified` in the manifest. Separate database copies do not reset
the app's local UI preferences.
The participant count and limit can be chosen with `--participants=6` and
`--time-limit-seconds=600`. Choose the setup before the study, use it for both
builds, and document any deviation, including actual build order or a repeated
attempt. Do not silently replace a failed attempt with a better repeat.

## Automated data-integrity companion gates

The release checks exercise these same five success conditions through both a
Client connected to a separate Host process and the rendered Companion web UI:

```sh
cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture
npm run qa:visual:companion:data-e2e -- --startup-timeout-ms 120000
```

Those gates verify authoritative routing, exact record counts, relationships,
cache updates, reload persistence and isolation from real user libraries. They
do not replace participants, assistance tracking or timing measurements, and
their successful result must not be reported as usability-study evidence.

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
npm run qa:usability:analyze -- /absolute/path/to/results.json
```

The command exits non-zero when the dataset is incomplete or either blocking threshold is missed. It reports the actual number of comparable timing pairs overall and for each task without printing participant IDs. Keep the raw participant file private; attach only the aggregate command output to the release evidence.

The timing calculation includes only pairs where both attempts succeeded
without assistance or a critical error. The existing acceptance rule has no
separate minimum number of timing pairs, so even a passing result can rest on
very little timing evidence. Review and report the pair counts and missing
task coverage before interpreting a PASS; do not describe sparse timing data
as proof of improvement across all five tasks. The manifest, artifact identity,
actual build order and human participation remain moderator checks; the
results-only analyzer cannot verify them.

## Release evidence

Record the baseline commit, candidate commit, fixture revision, participant count, aggregate unassisted completion rate, per-task rates, matched median durations, and the analyzer result. Any protocol deviation must be documented before interpreting the numbers.
