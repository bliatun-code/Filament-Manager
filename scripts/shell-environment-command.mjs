const environmentVariablePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertEnvironmentVariableName(name) {
  if (!environmentVariablePattern.test(name)) {
    throw new TypeError(`Invalid environment variable name: ${name}`);
  }
}

function quotePosixShellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quotePowerShellValue(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatInlineEnvironmentAssignment(name, value, platform) {
  assertEnvironmentVariableName(name);
  if (platform === "win32") {
    return `$env:${name}=${quotePowerShellValue(value)}`;
  }
  return `${name}=${quotePosixShellValue(value)}`;
}

export function formatShellEnvironmentAssignment(
  name,
  value,
  platform = process.platform,
) {
  const assignment = formatInlineEnvironmentAssignment(name, value, platform);
  return platform === "win32" ? assignment : `export ${assignment}`;
}

export function formatShellEnvironmentCommand(
  environmentEntries,
  command,
  platform = process.platform,
) {
  if (!Array.isArray(environmentEntries) || environmentEntries.length === 0) {
    throw new TypeError("At least one environment entry is required");
  }
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new TypeError("A shell command is required");
  }

  const assignments = environmentEntries.map(([name, value]) =>
    formatInlineEnvironmentAssignment(name, value, platform),
  );
  return platform === "win32"
    ? `${assignments.join("; ")}; ${command}`
    : `${assignments.join(" ")} ${command}`;
}
