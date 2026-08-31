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
- Counterbalance build order: half start with the baseline and half with the candidate.
- Reset the fixed test fixture before each build. The fixture must contain at least two printers, one open printer slot, one active outbound loan, one on-order wishlist item, and visually similar spools that make accidental selection observable.
- Use the same machine class, display size, locale, theme, and input method for both runs.

## Fixed tasks

| ID | Task | Starting state | Success condition |
| --- | --- | --- | --- |
| `register` | Register a new owned spool | Inventory is open; the target filament identity and initial weight are provided on the task card. | Exactly one matching spool exists with the supplied weight and home location. |
| `find` | Find a specified existing spool | Dashboard is open; the task card gives material, colour and location. | The correct spool detail is open, with no inventory mutation. |
| `load` | Load the selected spool into a printer | The target spool detail is open and a target printer/slot is given. | That exact spool is assigned to the target slot and no other assignment changed. |
| `lend` | Lend the selected spool to a named borrower | The target spool detail is open; borrower and outgoing weight are provided. | One active outbound loan exists for that spool with the supplied borrower and weight. |
| `receive` | Receive an on-order item into stock | Inventory is open on purchases; the target item and quantity are provided. | The requested number of spools exists and the queue quantity/status is correct. |

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
3. Stop the timer when the success condition is visible and verifiable.
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

The command exits non-zero when the dataset is incomplete or either blocking threshold is missed. Keep the raw participant file private; attach only the aggregate command output to the release evidence.

## Release evidence

Record the baseline commit, candidate commit, fixture revision, participant count, aggregate unassisted completion rate, per-task rates, matched median durations, and the analyzer result. Any protocol deviation must be documented before interpreting the numbers.
