import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { readGatewayToolOperatorScopes } from "openclaw/plugin-sdk/agent-harness-runtime";
import { toolPluginMetadataSymbol } from "openclaw/plugin-sdk/tool-plugin";
import { registerEngine, registerPlayerIntentTool } from "./engine.js";
import { registerLauncher } from "./launcher.js";

const entry = definePluginEntry({
  id: "campaign-keeper-engine-spike",
  name: "Campaign Keeper engine spike",
  description: "Minimal authenticated conversation-bound game command (not a full game)",
  register(api) {
    const soloAgentId = api.pluginConfig?.privateSoloAgentId;
    if (typeof soloAgentId === "string") {
      // Earlier hosts can omit provenance even for synthetic input. Ordinary
      // chat can also omit it, so the tool cannot detect that gap per turn.
      if (api.runtime.version !== "2026.11.5-beta.2") {
        throw Error("Private solo chat has been qualified for OpenClaw 2026.11.5-beta.2");
      }
      registerPlayerIntentTool(api, undefined, {
        agentId: soloAgentId,
        assertOperatorCurrent() {
          if (!readGatewayToolOperatorScopes()?.includes("operator.admin")) {
            throw Error("Private solo operator authority is unavailable");
          }
        },
      });
      return;
    }
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
      privateSoloAgentId: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" },
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
