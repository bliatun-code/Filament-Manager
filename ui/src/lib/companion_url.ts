export function deriveCompanionShellUrl(
  baseUrl: string | null | undefined,
): string | null {
  const normalizedBaseUrl = String(baseUrl ?? "").trim();
  if (!normalizedBaseUrl) {
    return null;
  }
  try {
    const url = new URL(normalizedBaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    const trimmedPath = url.pathname.replace(/\/+$/, "");
    if (!trimmedPath || trimmedPath === "/") {
      url.pathname = "/companion";
    } else if (!trimmedPath.endsWith("/companion")) {
      url.pathname = `${trimmedPath}/companion`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isStableLocalCompanionBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  const shellUrl = deriveCompanionShellUrl(baseUrl);
  if (!shellUrl) {
    return false;
  }
  try {
    return new URL(shellUrl).hostname.toLowerCase().endsWith(".local");
  } catch {
    return false;
  }
}
