import { readGatewayToolOperatorScopes } from "openclaw/plugin-sdk/agent-harness-runtime";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerPlayerIntentTool } from "./engine.js";

export default definePluginEntry({
  id: "campaign-keeper-solo-engine",
  name: "Campaign Keeper Solo Engine",
  description: "Saved single-player adventures for private owner chats.",
  register(api) {
    registerPlayerIntentTool(api, undefined, {
      toolName: "campaign_keeper_solo_intent",
      assertOperatorCurrent() {
        if (!readGatewayToolOperatorScopes()?.includes("operator.admin")) {
          throw Error("Private solo operator authority is unavailable");
        }
      },
    });
  },
});
