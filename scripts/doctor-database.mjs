export function parseNodeModuleVersionMismatch(message) {
  const compactMessage = String(message ?? "").replace(/\s+/g, " ").trim();
  const match = compactMessage.match(
    /\bNODE_MODULE_VERSION\s+(\d+)\b[.!]?\s+(?:This|The(?: current)?) version of Node\.js requires\s+NODE_MODULE_VERSION\s+(\d+)\b/i,
  );
  if (!match) {
    return null;
  }

  const builtAbi = Number(match[1]);
  const requiredAbi = Number(match[2]);
  if (
    !Number.isSafeInteger(builtAbi) ||
    builtAbi <= 0 ||
    !Number.isSafeInteger(requiredAbi) ||
    requiredAbi <= 0 ||
    builtAbi === requiredAbi
  ) {
    return null;
  }

  return { builtAbi, requiredAbi };
}

export async function probeBetterSqlite({
  loadModule = () => import("better-sqlite3"),
} = {}) {
  try {
    const module = await loadModule();
    const Database = module.default ?? module;
    const database = new Database(":memory:");
    try {
      return { mismatch: null, ready: true, reason: "" };
    } finally {
      database.close();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      mismatch: parseNodeModuleVersionMismatch(reason),
      ready: false,
      reason,
    };
  }
}
