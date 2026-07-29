import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const assetsDir = resolve("ui", "dist", "assets");
const heavyVendorPrefixes = ["vendor-pdf-lib-", "vendor-qrcode-", "vendor-zxing-"];
const requiredRuntimeAssetPrefixes = ["bambu_filament_code_camera_worker-"];
const allowedVendorImporters = new Map([
  ["vendor-pdf-lib-", ["inventory_overview_print-"]],
  ["vendor-qrcode-", ["filament_label_print-", "trusted_lan_pairing_qr-"]],
  ["vendor-zxing-", ["bambu_filament_code_image_scan-"]],
]);
const pageChunkPrefixes = [
  "dashboard-",
  "index-",
  "inventory-",
  "loans-",
  "printers-",
  "settings-",
  "settings_",
  "statistics-",
];
const performanceChunkBudgets = new Map([
  // The entry chunk is the cold-start floor. Page implementations must stay
  // behind their lazy imports rather than silently growing this bundle.
  ["index-", 300_000],
  // These are deliberately roomier than the v0.22.0 measurements. They catch
  // accidental eager dependencies and large navigation regressions without
  // making normal minifier/hash variation a release blocker.
  ["dashboard-", 65_000],
  ["inventory-", 260_000],
  ["loans-", 55_000],
  ["printers-", 115_000],
  ["settings-", 190_000],
  ["statistics-", 90_000],
]);

function importsForSource(source) {
  const imports = new Set();
  const importPattern =
    /import\((?:[^"'`]*?)(["'`])(\.\/[^"'`]+)\1|from\s*(["'])(\.\/[^"']+)\3/gms;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2] ?? match[4];
    if (specifier) {
      imports.add(specifier.replace("./", ""));
    }
  }
  return imports;
}

function hasPrefix(assetName, prefixes) {
  return prefixes.some((prefix) => assetName.startsWith(prefix));
}

export function readUiBundleAssets(distAssetsDir = assetsDir) {
  if (!existsSync(distAssetsDir)) {
    return null;
  }
  return readdirSync(distAssetsDir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => ({
      name,
      size: statSync(resolve(distAssetsDir, name)).size,
      source: readFileSync(resolve(distAssetsDir, name), "utf8"),
    }));
}

export function validateUiBundleChunks(assets) {
  const assetNames = assets.map((asset) => asset.name);
  const errors = [];

  for (const prefix of performanceChunkBudgets.keys()) {
    if (!assetNames.some((assetName) => assetName.startsWith(prefix))) {
      errors.push(
        `Expected ${prefix}*.js so its cold-start/navigation budget can be enforced.`,
      );
    }
  }

  for (const vendorPrefix of heavyVendorPrefixes) {
    if (!assetNames.some((assetName) => assetName.startsWith(vendorPrefix))) {
      errors.push(`Expected ${vendorPrefix}*.js in the production bundle.`);
    }
  }

  for (const assetPrefix of requiredRuntimeAssetPrefixes) {
    if (!assetNames.some((assetName) => assetName.startsWith(assetPrefix))) {
      errors.push(`Expected ${assetPrefix}*.js in the production bundle.`);
    }
  }

  for (const asset of assets) {
    const imports = importsForSource(asset.source);
    const importedHeavyVendors = heavyVendorPrefixes.filter((vendorPrefix) =>
      [...imports].some((specifier) => specifier.startsWith(vendorPrefix)),
    );
    if (importedHeavyVendors.length === 0) {
      continue;
    }

    for (const vendorPrefix of importedHeavyVendors) {
      const allowedPrefixes = allowedVendorImporters.get(vendorPrefix) ?? [];
      const importerIsAllowed = hasPrefix(asset.name, allowedPrefixes);
      if (!importerIsAllowed) {
        errors.push(`${asset.name} must not import ${vendorPrefix}*.js directly.`);
      }
    }
  }

  for (const asset of assets.filter((candidate) => candidate.name.startsWith("esm-"))) {
    if (asset.size > 100_000) {
      errors.push(
        `${asset.name} is a large anonymous esm chunk (${asset.size} bytes); assign the dependency to a named lazy vendor chunk.`,
      );
    }
  }

  for (const asset of assets.filter((candidate) => hasPrefix(candidate.name, pageChunkPrefixes))) {
    const imports = importsForSource(asset.source);
    const importedHeavyVendors = heavyVendorPrefixes.filter((vendorPrefix) =>
      [...imports].some((specifier) => specifier.startsWith(vendorPrefix)),
    );
    if (importedHeavyVendors.length > 0) {
      errors.push(`${asset.name} pulls heavy lazy vendors into a page chunk.`);
    }
  }

  for (const asset of assets) {
    const matchingBudget = [...performanceChunkBudgets.entries()].find(([prefix]) =>
      asset.name.startsWith(prefix),
    );
    if (!matchingBudget) {
      continue;
    }
    const [prefix, maxBytes] = matchingBudget;
    if (asset.size > maxBytes) {
      errors.push(
        `${asset.name} exceeds the ${prefix} cold-start/navigation budget (${asset.size} > ${maxBytes} bytes).`,
      );
    }
  }

  return errors;
}

function runUiBundleChunkCheck() {
  const assets = readUiBundleAssets();
  if (!assets) {
    console.log("UI bundle chunk check skipped; build output is not present.");
    return;
  }

  const errors = validateUiBundleChunks(assets);
  if (errors.length > 0) {
    console.error("UI bundle chunk contract failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI bundle chunk contract ok.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUiBundleChunkCheck();
}
