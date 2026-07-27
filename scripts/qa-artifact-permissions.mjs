import { chmod, mkdir } from "node:fs/promises";

export const PRIVATE_QA_DIRECTORY_MODE = 0o700;
export const PRIVATE_QA_ARTIFACT_MODE = 0o600;

export async function preparePrivateQaArtifactDirectory(path, options = {}) {
  const platform = options.platform ?? process.platform;
  const mkdirFn = options.mkdirFn ?? mkdir;
  const chmodFn = options.chmodFn ?? chmod;
  await mkdirFn(path, {
    recursive: true,
    ...(platform === "win32" ? {} : { mode: PRIVATE_QA_DIRECTORY_MODE }),
  });
  if (platform !== "win32") {
    await chmodFn(path, PRIVATE_QA_DIRECTORY_MODE);
  }
  return path;
}

export async function securePrivateQaArtifact(path, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") {
    await (options.chmodFn ?? chmod)(path, PRIVATE_QA_ARTIFACT_MODE);
  }
  return path;
}
