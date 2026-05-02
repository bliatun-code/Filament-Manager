import { resolve } from "node:path";
import { collectTestFiles, runNodeTestCommand } from "./test-runner-utils.mjs";

const testsDir = resolve("ui", "src");
const testFiles = collectTestFiles(testsDir, /\.test\.tsx?$/).sort();

if (testFiles.length === 0) {
  console.error(`No UI tests found in ${testsDir}`);
  process.exit(1);
}

runNodeTestCommand(
  ["./node_modules/tsx/dist/cli.mjs", "--test", ...testFiles],
  {
    cwd: resolve("."),
  },
);
