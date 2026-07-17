import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(".");
const apiPath = resolve(repoRoot, "src-tauri", "src", "companion_routes.rs");
const browserDir = resolve(repoRoot, "src-tauri", "companion_browser");

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function extractProtectedRoutes(source) {
  const start = source.indexOf("let protected = Router::new()");
  const end = source.indexOf(".route_layer", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate protected companion router block");
  }
  return extractRoutes(source.slice(start, end), "/api/v1");
}

function extractRootRoutes(source) {
  const protectedEnd = source.indexOf(".with_state(state.clone());");
  const start = source.indexOf("Router::new()", protectedEnd);
  const end = source.indexOf('.nest("/api/v1", protected)', start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate root companion router block");
  }
  return extractRoutes(source.slice(start, end), "");
}

function extractRoutes(source, prefix) {
  const routes = [];
  const routePattern = /\.route\(\s*"([^"]+)"\s*,\s*(get|post)\(/gms;
  for (const match of source.matchAll(routePattern)) {
    routes.push({
      method: match[2].toUpperCase(),
      path: `${prefix}${match[1]}`,
      pattern: routePathToRegExp(`${prefix}${match[1]}`),
    });
  }
  return routes;
}

function routePathToRegExp(path) {
  const escaped = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith("{") && segment.endsWith("}")) {
        return "[^/]+";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

function normalizeBrowserPath(rawPath) {
  const withoutQuery = rawPath.split("?")[0];
  return withoutQuery
    .replace(/\$\{[^}]+\}/g, "{param}")
    .replace(/\{encodeURIComponent\([^}]+\)\}/g, "{param}");
}

function extractBrowserApiPaths(source) {
  const paths = new Set();
  const literalPattern = /(["'`])((?:\\.|(?!\1).)*\/api\/v1(?:\\.|(?!\1).)*)\1/gms;
  for (const match of source.matchAll(literalPattern)) {
    const value = match[2];
    const apiStart = value.indexOf("/api/v1");
    if (apiStart === -1) {
      continue;
    }
    const path = value.slice(apiStart).split(/[\s"'`]/)[0];
    paths.add(normalizeBrowserPath(path));
  }
  return paths;
}

const apiSource = readFileSync(apiPath, "utf8");
const routes = [...extractProtectedRoutes(apiSource), ...extractRootRoutes(apiSource)];

const browserPaths = new Map();
for (const file of collectJavaScriptFiles(browserDir)) {
  const source = readFileSync(file, "utf8");
  for (const path of extractBrowserApiPaths(source)) {
    if (!browserPaths.has(path)) {
      browserPaths.set(path, []);
    }
    browserPaths.get(path).push(relative(repoRoot, file));
  }
}

const missing = [];
for (const [path, files] of [...browserPaths.entries()].sort()) {
  if (!routes.some((route) => route.pattern.test(path))) {
    missing.push({ path, files });
  }
}

if (missing.length > 0) {
  console.error("Companion browser API paths without matching Rust routes:");
  for (const { path, files } of missing) {
    console.error(`  - ${path}`);
    for (const file of files) {
      console.error(`    ${file}`);
    }
  }
  process.exit(1);
}

console.log(
  `Companion route contract ok (${browserPaths.size} browser API paths, ${routes.length} Rust routes).`,
);
