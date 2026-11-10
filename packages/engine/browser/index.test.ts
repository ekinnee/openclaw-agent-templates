import { test } from "node:test";
import assert from "node:assert/strict";
import plugin from "./index.ts";

class Element {
  textContent = "";
  children: Element[] = [];
  attrs: Record<string, string> = {};
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  remove() { this.children = []; }
}

test("native widget reads only selected session stats and never renders raw game data", async () => {
  const original = globalThis.document;
  (globalThis as any).document = { createElement: () => new Element() };
  try {
    let widget: any;
    let listener: () => void = () => {};
    let resolve!: (value: unknown) => void;
    const requests: any[] = [];
    const host = {
      connection: { connected: true, canRead: true },
      request: (method: string, params: unknown) => {
        requests.push({ method, params });
        return new Promise((done) => { resolve = done; });
      },
      subscribe: (cb: () => void) => { listener = cb; return () => { listener = () => {}; }; },
      ui: { registerWidget: (item: unknown) => { widget = item; return () => {}; } },
    };
    plugin.activate(host as any);
    assert.equal(widget.id, "game-stats");
    const container = new Element();
    const controller = new AbortController();
    const context = { host, signal: controller.signal, presented: true,
      props: { sessionKey: "agent:keeper:chat:room", agentId: "keeper", widget: { name: "game-stats",
        props: { sessionKey: "forged", agentId: "other" } } } };
    const mounted = widget.mount(container, context);
    assert.deepEqual(requests[0], { method: "plugins.sessionAction", params: {
      pluginId: "campaign-keeper-engine-spike", actionId: "gameStats", payload: {},
      sessionKey: "agent:keeper:chat:room", agentId: "keeper",
    } });
    resolve({ ok: true, result: { status: "complete", totalGames: 1, activeGames: 1,
      completedGames: 0, acceptedActions: 2, asOfVersion: 2,
      games: [{ gameId: "secret-uuid", label: "secret-label", playerCount: 1 }] } });
    await Promise.resolve();
    assert.match(container.children[0].children[2].textContent, /1 games/);
    assert.doesNotMatch(JSON.stringify(container), /secret|forged/);
    mounted.update({ ...context, props: { ...context.props, sessionKey: "another" } });
    assert.equal(container.children[0].children[2].textContent, "");
    const summary = container.children[0].children[2];
    mounted.dispose();
    resolve({ ok: true, result: { status: "complete", totalGames: 99, activeGames: 99,
      completedGames: 0, acceptedActions: 99, asOfVersion: 99 } });
    await Promise.resolve();
    listener();
    assert.equal(summary.textContent, "");
  } finally {
    (globalThis as any).document = original;
  }
});

test("widget fails closed without read access and ignores stale responses after a session switch", async () => {
  const original = globalThis.document;
  (globalThis as any).document = { createElement: () => new Element() };
  try {
    let widget: any;
    const pending: Array<(value: unknown) => void> = [];
    const host = {
      connection: { connected: true, canRead: false },
      request: () => new Promise((resolve) => pending.push(resolve)),
      subscribe: () => () => {},
      ui: { registerWidget: (item: unknown) => { widget = item; return () => {}; } },
    };
    plugin.activate(host as any);
    const container = new Element();
    const controller = new AbortController();
    const context = { host, signal: controller.signal, presented: true,
      props: { sessionKey: "first", agentId: "keeper", widget: { name: "game-stats" } } };
    const mounted = widget.mount(container, context);
    assert.equal(pending.length, 0);
    assert.equal(container.children[0].children[1].textContent, "Statistics unavailable.");
    host.connection.canRead = true;
    mounted.update(context);
    assert.equal(pending.length, 1);
    mounted.update({ ...context, props: { ...context.props, sessionKey: "second" } });
    assert.equal(pending.length, 2);
    pending[0]({ ok: true, result: { status: "complete", totalGames: 42,
      activeGames: 42, completedGames: 0, acceptedActions: 42, asOfVersion: 42 } });
    await Promise.resolve();
    assert.equal(container.children[0].children[2].textContent, "");
    pending[1]({ ok: false, error: "private server detail" });
    await Promise.resolve();
    assert.equal(container.children[0].children[1].textContent, "Statistics unavailable.");
    assert.doesNotMatch(JSON.stringify(container), /private server detail|42/);
    mounted.dispose();
  } finally {
    (globalThis as any).document = original;
  }
});
