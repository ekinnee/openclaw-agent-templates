import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { toolPluginMetadataSymbol } from "openclaw/plugin-sdk/tool-plugin";
import { registerEngine } from "./engine.js";

const entry = definePluginEntry({
  id: "campaign-keeper-engine-spike",
  name: "Campaign Keeper engine spike",
  description: "Minimal authenticated conversation-bound game command (not a full game)",
  register: registerEngine,
});

// The 2026.11.2 plugins authoring builder reads static tool/feature metadata.
// This command-only plugin has no agent tools; publish an empty tool contract
// without registering an unnecessary agent-facing tool at runtime.
Object.defineProperty(entry, toolPluginMetadataSymbol, {
  value: {
    id: "campaign-keeper-engine-spike", name: "Campaign Keeper engine spike",
    description: "Minimal authenticated conversation-bound game command (not a full game)",
    activation: { onStartup: true },
    configSchema: { type: "object", additionalProperties: false, properties: {
      dashboardEnabled: { type: "boolean" }, agentId: { type: "string", minLength: 1 },
    } },
    tools: [],
  },
});

export default entry;
