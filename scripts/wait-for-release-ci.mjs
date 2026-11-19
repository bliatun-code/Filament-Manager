import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const pollIntervalMs = 60_000;
const waitLimitMs = 90 * 60_000;

function ghJson(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 }));
}

export async function waitForReleaseCi({
  repository, sha, requiredChecks, gh = ghJson, sleep = delay, now = Date.now, log = console.log,
}) {
  if (!repository || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("The release gate requires GITHUB_REPOSITORY and the full GITHUB_SHA.");
  }
  if (!requiredChecks?.length) {
    throw new Error("Specify the required CI job names before publishing.");
  }
  const deadline = now() + waitLimitMs;
  let waitingFor = "the CI push run on main";

  while (now() < deadline) {
    const [run] = gh([
      "run", "list", "--repo", repository, "--workflow", "ci.yml", "--branch", "main",
      "--event", "push", "--commit", sha, "--limit", "1", "--json", "databaseId,attempt",
    ]);
    if (run) {
      const { jobs, status, url } = gh([
        "run", "view", String(run.databaseId), "--repo", repository, "--attempt", String(run.attempt),
        "--json", "jobs,status,url",
      ]);
      const pending = [];
      for (const name of requiredChecks) {
        const job = jobs.find((job) => job.name === name);
        if (job?.status !== "completed") {
          pending.push(`${name} (${job?.status ?? "missing"})`);
        } else if (job.conclusion !== "success") {
          throw new Error(`${name} concluded ${job.conclusion} for ${sha}. See ${url}`);
        }
      }
      if (!pending.length) {
        log(`All required checks passed for ${sha}. See ${url}`);
        return;
      }
      waitingFor = `${pending.join(", ")} in ${url}`;
      if (status === "completed") {
        throw new Error(`CI finished for ${sha} without all required checks passing: ${waitingFor}`);
      }
    }
    log(`Waiting for ${waitingFor} for ${sha}.`);
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
  }
  throw new Error(`Timed out after 90 minutes waiting for ${waitingFor} for ${sha}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await waitForReleaseCi({
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      requiredChecks: process.argv.slice(2),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
