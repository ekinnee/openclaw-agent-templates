import { defineControlUiPlugin, type ControlUiWidget } from "openclaw/plugin-sdk/control-ui";

const pluginId = "campaign-keeper-engine-spike";

type Stats = {
  totalGames: number;
  activeGames: number;
  completedGames: number;
  acceptedActions: number;
  asOfVersion: number;
  status: "complete";
};

function isStats(value: unknown): value is Stats {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.status === "complete" &&
    ["totalGames", "activeGames", "completedGames", "acceptedActions", "asOfVersion"]
      .every((key) => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0);
}

const mount: ControlUiWidget["mount"] = (container, initial) => {
  let context = initial;
  let generation = 0;
  let currentKey = "";
  const root = document.createElement("section");
  root.setAttribute("aria-label", "Campaign Keeper statistics");
  const title = document.createElement("strong");
  title.textContent = "Campaign Keeper";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const summary = document.createElement("p");
  root.append(title, status, summary);
  container.append(root);

  const clear = () => { summary.textContent = ""; };
  const refresh = () => {
    const version = ++generation;
    clear();
    if (!context.presented || context.signal.aborted) {
      status.textContent = "";
      return;
    }
    const { host, props } = context;
    if (!host.connection.connected || !host.connection.canRead || !props.sessionKey) {
      status.textContent = "Statistics unavailable.";
      return;
    }
    status.textContent = "Loading statistics…";
    // Use only the host's selected, authenticated session. Widget props are not an authority.
    void host.request("plugins.sessionAction", {
      pluginId, actionId: "gameStats", payload: {},
      sessionKey: props.sessionKey, ...(props.agentId ? { agentId: props.agentId } : {}),
    }).then((response: unknown) => {
      if (version !== generation || !context.presented || context.signal.aborted ||
          !context.host.connection.connected || !context.host.connection.canRead) return;
      const envelope = response as { ok?: unknown; result?: unknown } | null;
      if (envelope?.ok !== true || !isStats(envelope.result)) {
        status.textContent = "Statistics unavailable.";
        return;
      }
      const stats = envelope.result;
      status.textContent = "Current games";
      // Never render game IDs, player identities, locations, bindings or GM notes.
      summary.textContent = `${stats.totalGames} games · ${stats.activeGames} active · ${stats.completedGames} completed · ${stats.acceptedActions} accepted actions`;
    }).catch(() => {
      if (version === generation && context.presented && !context.signal.aborted) {
        clear();
        status.textContent = "Statistics unavailable.";
      }
    });
  };
  const sync = () => {
    const nextKey = JSON.stringify([context.props.sessionKey, context.props.agentId,
      context.presented, context.host.connection.connected, context.host.connection.canRead]);
    if (nextKey !== currentKey) {
      currentKey = nextKey;
      refresh();
    }
  };
  const unsubscribe = initial.host.subscribe(sync);
  sync();
  return {
    update(next) { context = next; sync(); },
    dispose() { ++generation; unsubscribe(); root.remove(); },
  };
};

export default defineControlUiPlugin({
  id: pluginId,
  activate(host) {
    return host.ui.registerWidget({ id: "game-stats", label: "Campaign Keeper statistics", mount });
  },
});
