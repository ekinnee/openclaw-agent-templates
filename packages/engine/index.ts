import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { toolPluginMetadataSymbol } from "openclaw/plugin-sdk/tool-plugin";
import { registerEngine } from "./engine.js";
import { registerLauncher } from "./launcher.js";

const entry = definePluginEntry({
  id: "campaign-keeper-engine-spike",
  name: "Campaign Keeper engine spike",
  description: "Minimal authenticated conversation-bound game command (not a full game)",
  register(api) {
    registerEngine(api, registerLauncher(api));
  },
});

// Publish the same agent tool contract used by the runtime factory.
Object.defineProperty(entry, toolPluginMetadataSymbol, {
  value: {
    id: "campaign-keeper-engine-spike", name: "Campaign Keeper engine spike",
    description: "Minimal authenticated conversation-bound game command (not a full game)",
    activation: { onStartup: true },
    configSchema: { type: "object", additionalProperties: false, properties: {
      dashboardEnabled: { type: "boolean" }, agentId: { type: "string", minLength: 1 },
    } },
    tools: [{ name: "campaign_keeper_intent", label: "Campaign Keeper player intent", description: "Commit the current attributed player intent through the GM.",
      parameters: { type: "object", additionalProperties: false, required: ["action", "requestId"], properties: {
        action: { type: "string" }, requestId: { type: "string" }, target: { type: "string" },
        gameId: { type: "string" }, sourceSessionKey: { type: "string" },
        choice: { type: "string" }, retreat: { type: "string" }, item: { type: "string" }, helper: { type: "string" },
      } } }],
  },
});

export default entry;
