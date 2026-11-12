import type { ControlUiHost, ControlUiPage, ControlUiPanel } from "openclaw/plugin-sdk/control-ui";
import { archetypes, archetypeIds, isArchetype } from "../characters.js";

const method = "campaign-keeper.launch.";
const panelId = "campaign-scene";
type Launch = { agentId: string; sessionKey: string; requestId: string };
type Scene = { player: { room: string; scene: string; character: string } } |
  { management: { pending: true } | { version: number; players: number; room: string } };

function frame(container: HTMLElement, heading: string) {
  const root = document.createElement("section");
  root.style.padding = "20px";
  const title = document.createElement("h2");
  title.textContent = heading;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  root.append(title, status);
  container.append(root);
  return { root, status };
}

const mountLauncher: ControlUiPage["mount"] = (container, { host, signal }) => {
  const { root, status } = frame(container, "Campaign Keeper");
  status.textContent = "Choose your character for The Lantern Below.";
  const label = document.createElement("label");
  label.textContent = "Class";
  label.style.display = "block";
  const choice = document.createElement("select");
  choice.style.margin = "0 0 16px 10px";
  choice.style.maxWidth = "100%";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a class";
  choice.append(placeholder);
  for (const id of archetypeIds) {
    const { name, attributes: { grit, wits, charm } } = archetypes[id];
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${name} · Grit +${grit}, Wits +${wits}, Charm +${charm}`;
    choice.append(option);
  }
  choice.value = "";
  label.append(choice);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "New Game";
  button.disabled = true;
  choice.onchange = () => { button.disabled = !isArchetype(choice.value); };
  root.append(label, button);
  button.onclick = async () => {
    const archetype = choice.value;
    if (button.disabled || signal.aborted || !isArchetype(archetype)) return;
    button.disabled = true;
    choice.disabled = true;
    status.textContent = "Opening your player chat…";
    try {
      const launch = await host.request<Launch>(method + "prepare");
      signal.throwIfAborted();
      const { agentId, sessionKey, requestId } = launch;
      const created = await host.request<{ key: string }>("sessions.create", {
        agentId, key: sessionKey, idempotencyKey: requestId, displayName: "The Lantern Below · Player",
      });
      if (created.key !== sessionKey) throw Error("Unexpected player chat");
      signal.throwIfAborted();
      const result = await host.request<Scene>(method + "start", { sessionKey, archetype });
      if (!("player" in result)) throw Error("Opening scene unavailable");
      signal.throwIfAborted();
      host.sessions.open({ agentId, sessionKey });
      host.ui.openPanel(panelId, { agentId, sessionKey });
    } catch {
      if (!signal.aborted) status.textContent = "Couldn’t open the game. Select New Game to retry.";
    } finally {
      choice.disabled = false;
      button.disabled = false;
    }
  };
  return { dispose: () => root.remove() };
};

const mountScene: ControlUiPanel["mount"] = (container, initial) => {
  const { root, status } = frame(container, "The Lantern Below");
  let context = initial;
  let generation = 0;
  let inFlight = false;
  const heading = document.createElement("h3");
  status.before(heading);
  const clear = (message: string) => { heading.textContent = ""; status.textContent = message; };
  const refresh = async () => {
    if (inFlight || !context.presented || context.signal.aborted) return;
    const { host, props } = context;
    if (!host.connection.connected || !props.sessionKey) {
      clear("Waiting for this chat to connect.");
      return;
    }
    const request = generation;
    inFlight = true;
    try {
      const result = await host.request<Scene>(method + "read", { sessionKey: props.sessionKey });
      if (request !== generation || context.signal.aborted || !context.presented || !host.connection.connected) return;
      const title = "player" in result ? result.player.room : "Keeper management";
      const summary = "player" in result ? `${result.player.character}. ${result.player.scene}` : "pending" in result.management
        ? "Waiting for a player to start the campaign."
        : `${result.management.players} player · Version ${result.management.version} · ${result.management.room}`;
      if (heading.textContent !== title) heading.textContent = title;
      if (status.textContent !== summary) status.textContent = summary;
    } catch {
      if (request === generation && !context.signal.aborted && context.presented) {
        clear("Campaign unavailable in this chat.");
      }
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(refresh, 2000);
  const unsubscribe = initial.host.subscribe(() => {
    if (!initial.host.connection.connected) {
      generation++;
      clear("Waiting for this chat to connect.");
    }
    void refresh();
  });
  void refresh();
  return {
    update(next) {
      if (context.props.sessionKey !== next.props.sessionKey || context.presented !== next.presented) {
        generation++;
        clear("");
      }
      context = next;
      void refresh();
    },
    dispose() { generation++; clearInterval(timer); unsubscribe(); root.remove(); },
  };
};

export function registerLauncherUi(host: ControlUiHost) {
  const page = host.ui.registerPage({ id: "new-game", label: "Campaign Keeper", mount: mountLauncher });
  const navigation = host.ui.registerNavigation({ id: "campaign-keeper", label: "Campaign Keeper",
    icon: "bookOpenText", page: { id: "new-game" }, defaultVisible: true });
  const panel = host.ui.registerPanel({ id: panelId, label: "Campaign Keeper Scene",
    icon: "bookOpenText", mount: mountScene });
  return () => { panel(); navigation(); page(); };
}
