import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const commitShaPattern = /^[0-9a-f]{40}$/i;
const dockerDigestPattern = /^docker:\/\/.+@sha256:[0-9a-f]{64}$/i;
const actionUsePattern =
  /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/gm;

export function collectWorkflowFiles(workflowsDirectory = resolve(".github", "workflows")) {
  return readdirSync(workflowsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry) => resolve(workflowsDirectory, entry.name))
    .sort();
}

export function findUnpinnedActionUses(source, file = "<workflow>") {
  const errors = [];

  for (const match of source.matchAll(actionUsePattern)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (!reference || reference.startsWith("./")) {
      continue;
    }

    const isPinnedDockerImage = dockerDigestPattern.test(reference);
    const separatorIndex = reference.lastIndexOf("@");
    const revision = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : "";
    const isPinnedRepositoryAction =
      !reference.startsWith("docker://") && commitShaPattern.test(revision);

    if (isPinnedDockerImage || isPinnedRepositoryAction) {
      continue;
    }

    const line = source.slice(0, match.index).split(/\r?\n/).length;
    errors.push({ file, line, reference });
  }

  return errors;
}

export function analyzeGithubActionsPinning(options = {}) {
  const workflowFiles = options.workflowFiles ?? collectWorkflowFiles(options.workflowsDirectory);
  const errors = workflowFiles.flatMap((workflowFile) =>
    findUnpinnedActionUses(readFileSync(workflowFile, "utf8"), workflowFile),
  );

  return { errors, workflowFiles };
}

function runCli() {
  const { errors, workflowFiles } = analyzeGithubActionsPinning();
  if (errors.length > 0) {
    console.error("GitHub Actions pinning contract failed:");
    for (const error of errors) {
      console.error(`  - ${error.file}:${error.line}: ${error.reference}`);
    }
    console.error("External actions must use a full 40-character commit SHA.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `GitHub Actions pinning contract ok (${workflowFiles.length} workflow files checked).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
