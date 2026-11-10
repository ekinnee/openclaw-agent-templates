import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerEngine } from "./engine.js";

export default definePluginEntry({
  id: "campaign-keeper-engine-spike",
  name: "Campaign Keeper engine spike",
  description: "Minimal authenticated conversation-bound game command (not a full game)",
  register: registerEngine,
});
