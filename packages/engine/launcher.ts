import { createHash } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { launchedManagement, launchedScene, openGameStore, type LaunchSession } from "./engine.js";
import { isArchetype } from "./characters.js";

const method = "campaign-keeper.launch.";
const scope = { scope: "operator.write", profileAccess: "required" } as const;
const sessionScope = { ...scope, sessionAccess: { mode: "write", allowOwnSessionScope: true } } as const;
type Request = Parameters<Parameters<OpenClawPluginApi["registerGatewayMethod"]>[1]>[0];
type Slot = {
  keeper: LaunchSession;
  lease: { assertCurrent(): void; release(): void };
  profileId: string;
  playerAgentId: string;
  playerKey: string;
  requestId: string;
};

function deny({ respond }: Request, message = "This campaign is unavailable in this chat.") {
  respond(false, undefined, { code: "FORBIDDEN", message });
}

function playerProfile({ client }: Request): string | undefined {
  const profile = client?.authenticatedUserProfile?.profileId;
  return profile && profile !== "gateway-owner" && !client?.internal?.syntheticClient ? profile : undefined;
}

export function registerLauncher(api: OpenClawPluginApi) {
  const slots = new Map<string, Slot>();
  api.registerService({ id: "campaign-keeper-launcher", start() {}, stop() {
    for (const slot of slots.values()) slot.lease.release();
    slots.clear();
  } });

  api.registerGatewayMethod(method + "arm", (req) => {
    const { client, params, sessionAccessAuthority: access, assertHandlerCurrent, respond } = req;
    const { profileId, playerAgentId } = params;
    if (!client?.connect.scopes?.includes("operator.admin") || !access || !assertHandlerCurrent ||
        !Object.keys(params).every(key => ["sessionKey", "profileId", "playerAgentId"].includes(key)) ||
        typeof profileId !== "string" || !profileId || profileId === "gateway-owner" ||
        typeof playerAgentId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(playerAgentId) ||
        playerAgentId === access.target.agentId) return deny(req);
    assertHandlerCurrent();
    access.assertCurrent();
    const keeper = access.target;
    const previous = slots.get(keeper.sessionKey);
    if (!previous && slots.size >= 8) return deny(req, "The Keeper launcher is full.");
    const requestId = createHash("sha256").update(JSON.stringify([
      keeper.sessionKey, keeper.sessionId, keeper.lifecycleRevision ?? null, profileId, playerAgentId,
    ])).digest("hex").slice(0, 32);
    const lease = access.retainSession();
    previous?.lease.release();
    slots.delete(keeper.sessionKey);
    slots.set(keeper.sessionKey, { keeper, lease, profileId, playerAgentId, requestId,
      playerKey: `agent:${playerAgentId}:dashboard:ck-play-${requestId}` });
    respond(true, { ready: true });
  }, sessionScope);

  api.registerGatewayMethod(method + "prepare", (req) => {
    const profile = playerProfile(req);
    const current = [...slots.values()].findLast(slot => slot.profileId === profile);
    if (!current || Object.keys(req.params).length ||
        !req.assertHandlerCurrent) return deny(req, "A Keeper session is not ready for this player.");
    req.assertHandlerCurrent();
    current.lease.assertCurrent();
    req.respond(true, { agentId: current.playerAgentId, sessionKey: current.playerKey, requestId: current.requestId });
  }, scope);

  for (const action of ["start", "read"] as const) {
    api.registerGatewayMethod(method + action, async (req) => {
      const { sessionAccessAuthority: access, assertHandlerCurrent, respond } = req;
      const key = access?.target.sessionKey;
      const current = key ? slots.get(key) ?? [...slots.values()].find(slot => slot.playerKey === key) : undefined;
      if (!current || !access || !assertHandlerCurrent ||
          !Object.keys(req.params).every(key => key === "sessionKey" || (action === "start" && key === "archetype"))) return deny(req);
      const selection = req.params.archetype;
      if (action === "start" && !isArchetype(selection)) return deny(req, "Choose a character class first.");
      const assertCurrent = () => {
        assertHandlerCurrent();
        access.assertCurrent();
        current.lease.assertCurrent();
      };
      const store = openGameStore(api.runtime, assertCurrent);
      const target = access.target;
      if (action === "read" && target.sessionKey === current.keeper.sessionKey &&
          target.sessionId === current.keeper.sessionId && target.lifecycleRevision === current.keeper.lifecycleRevision &&
          req.client?.connect.scopes?.includes("operator.admin")) {
        const management = await launchedManagement(current.keeper, store, assertCurrent);
        return respond(true, { management: management ?? { pending: true } });
      }
      if (target.sessionKey !== current.playerKey || target.agentId !== current.playerAgentId ||
          current.profileId !== playerProfile(req)) return deny(req);
      assertCurrent();
      const entry = await api.runtime.agent.session.getSessionEntryAsync(target);
      assertCurrent();
      if (entry?.sessionId !== target.sessionId || entry.createdActor?.type !== "human" ||
          entry.createdActor.source !== "profile" || entry.createdActor.id !== current.profileId) return deny(req);
      const scene = await launchedScene({ keeper: current.keeper, player: target, profileId: current.profileId,
        assertCurrent }, store, isArchetype(selection) ? selection : undefined);
      if (!scene) return deny(req);
      respond(true, { player: scene });
    }, sessionScope);
  }

  return async (ctx: { agentId?: string; sessionKey?: string; sessionId?: string; assertInvocationCurrent(): void }) => {
    const current = [...slots.values()].find(slot => slot.playerKey === ctx.sessionKey);
    if (!current || ctx.agentId !== current.playerAgentId || ctx.sessionKey !== current.playerKey || !ctx.sessionId) {
      return undefined;
    }
    const assertCurrent = () => { ctx.assertInvocationCurrent(); current.lease.assertCurrent(); };
    assertCurrent();
    const entry = await api.runtime.agent.session.getSessionEntryAsync({ agentId: ctx.agentId, sessionKey: ctx.sessionKey });
    assertCurrent();
    if (!entry || entry.sessionId !== ctx.sessionId) return undefined;
    return { keeper: current.keeper, player: { agentId: ctx.agentId, sessionKey: ctx.sessionKey, sessionId: ctx.sessionId,
      lifecycleRevision: entry.lifecycleRevision }, profileId: current.profileId, assertCurrent };
  };
}
