import assert from "node:assert/strict";
import test from "node:test";
import { requiredReleaseChecks, waitForReleaseCi } from "./wait-for-release-ci.mjs";

const repository = "example/filament";
const sha = "a".repeat(40);
const jobs = requiredReleaseChecks.map((name) => ({ name, status: "completed", conclusion: "success" }));
const url = "https://github.com/example/filament/actions/runs/123";

function simulate(polls) {
  let elapsed = 0;
  let index = 0;
  return {
    repository, sha,
    gh(args) {
      const poll = polls[index];
      if (args[1] === "list") {
        assert.deepEqual(args, [
          "run", "list", "--repo", repository, "--workflow", "ci.yml", "--branch", "main",
          "--event", "push", "--commit", sha, "--limit", "1", "--json", "databaseId,attempt",
        ]);
        return poll ? [{ databaseId: 123, attempt: poll.attempt ?? 1 }] : [];
      }
      assert.deepEqual(args, [
        "run", "view", "123", "--repo", repository, "--attempt", String(poll.attempt ?? 1),
        "--json", "jobs,status,url",
      ]);
      return { url, ...poll };
    },
    now: () => elapsed,
    async sleep(ms) {
      assert.equal(ms, 60_000);
      elapsed += ms;
      index++;
    },
    log() {},
  };
}

test("release waits for main CI, a late macOS aggregate, and running Windows checks", async () => {
  const checks = simulate([
    null,
    { status: "queued", jobs: [] },
    { status: "in_progress", jobs: [jobs[0], { ...jobs[2], status: "in_progress", conclusion: "" }] },
    { status: "in_progress", jobs: [jobs[0], { ...jobs[1], status: "queued" }, jobs[2]] },
    { status: "completed", jobs },
  ]);
  await waitForReleaseCi(checks);
  assert.equal(checks.now(), 4 * 60_000);
});

test("an already green attempt publishes immediately and uses only the required job names", async () => {
  const checks = simulate([{ attempt: 2, status: "completed", jobs: [
    ...jobs, { name: "Optional job", status: "completed", conclusion: "failure" },
  ] }]);
  await waitForReleaseCi(checks);
  assert.equal(checks.now(), 0);
});

for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral", "action_required"]) {
  test(`a ${conclusion} required check stops publication while another check is missing`, async () => {
    const checks = simulate([{ status: "in_progress", jobs: [{ ...jobs[2], conclusion }] }]);
    await assert.rejects(waitForReleaseCi(checks), new RegExp(`Windows Smoke concluded ${conclusion}`));
    assert.equal(checks.now(), 0);
  });
}

test("a completed run missing a required job stops publication", async () => {
  const checks = simulate([{ status: "completed", jobs: [jobs[0], jobs[2]] }]);
  await assert.rejects(waitForReleaseCi(checks), /CI finished.*macOS Smoke \(missing\)/);
  assert.equal(checks.now(), 0);
});

test("an absent main run times out after 90 minutes", async () => {
  const checks = simulate([]);
  await assert.rejects(waitForReleaseCi(checks), /Timed out after 90 minutes.*CI push run on main/);
  assert.equal(checks.now(), 90 * 60_000);
});

test("an API error blocks publication", async () => {
  const checks = simulate([]);
  checks.gh = () => { throw new Error("GitHub API failed"); };
  await assert.rejects(waitForReleaseCi(checks), /GitHub API failed/);
});
