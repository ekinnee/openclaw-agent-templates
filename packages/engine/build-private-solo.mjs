import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const output = process.argv[2];
const format = process.argv[3];
if (!output || (format !== undefined && format !== "--release")) {
  throw Error("Usage: npm run build:private-solo -- <new-output-directory> [--release]");
}
const directory = resolve(output);
const source = fileURLToPath(new URL(".", import.meta.url));
const packageJson = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(source, "openclaw.plugin.json"), "utf8"));
delete packageJson.scripts;
delete packageJson.devDependencies;
delete packageJson.openclaw.controlUi;
delete manifest.controlUi;
delete manifest.uiCapabilities;
packageJson.openclaw.extensions = ["./dist/index.js"];
if (format === "--release") {
  packageJson.name = "@ekinnee/campaign-keeper-solo-engine";
  packageJson.version = "0.1.0";
  packageJson.license = "MIT";
  delete packageJson.private;
  delete packageJson.peerDependencies;
  packageJson.repository = { type: "git", url: "https://github.com/ekinnee/openclaw-agent-templates.git", directory: "packages/engine" };
  packageJson.openclaw.compat = { pluginApi: ">=2026.11.3", minGatewayVersion: "2026.11.3" };
  packageJson.openclaw.build = { openclawVersion: "2026.11.3", pluginSdkVersion: "2026.11.3" };
  manifest.id = "campaign-keeper-solo-engine";
  manifest.name = "Campaign Keeper Solo Engine";
  manifest.description = "Saved single-player adventures for private owner chats.";
  manifest.version = packageJson.version;
  manifest.configSchema = { type: "object", additionalProperties: false, properties: {} };
  manifest.contracts = { tools: ["campaign_keeper_solo_intent"] };
  manifest.toolMetadata = { campaign_keeper_solo_intent: { optional: true } };
}
await mkdir(directory);
await build({
  entryPoints: [resolve(source, format === "--release" ? "solo-template-entry.ts" : "index.ts")],
  outfile: resolve(directory, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["openclaw/*"],
});
await writeFile(resolve(directory, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
await writeFile(resolve(directory, "openclaw.plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
if (format === "--release") {
  await copyFile(resolve(source, "../../templates/campaign-keeper/LICENSE"), resolve(directory, "LICENSE"));
}
