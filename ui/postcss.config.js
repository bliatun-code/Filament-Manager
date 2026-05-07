import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugins = {};

function addPluginIfInstalled(name, options = {}) {
  try {
    require.resolve(name);
    plugins[name] = options;
  } catch {
    // Optional by design: keeps UI build stable without this plugin.
  }
}

addPluginIfInstalled("@tailwindcss/postcss");
addPluginIfInstalled("autoprefixer");

export default { plugins };
