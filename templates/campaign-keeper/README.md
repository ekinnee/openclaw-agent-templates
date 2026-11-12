# Campaign Keeper

The Lantern Below is a solo text adventure in six rooms, with original 2d6 rules, three character classes, and four endings. Created with Erick Kinnee. The adventure and illustration are original under MIT.

## Add Campaign Keeper

Use a private Gateway with one trusted owner and an OpenClaw development build
with native Template plugin installation. OpenClaw main commit
[`d54e624149cf`](https://github.com/openclaw/openclaw/commit/d54e624149cf98ca96972d7a46815db87fcf4288)
is the target for this Focus Week preview. Stable 2026.11.3 and beta 2026.11.5-beta.2
predate the required Template installer.

Enable **Templates** in **Settings → Labs**. Select Campaign Keeper in
**Pages → Templates**, review the pinned engine and tool grants, and choose
**Add**. The host supplies your configured model. The Gateway owner plays
from an ordinary persistent Keeper chat. Keep that chat private.

The engine uses one save per chat. Reopen the chat after a restart to resume it.
New chats and resets get a new save. Solo saves are separate from the earlier
requester-profile and multiplayer experiments.

## Play

Open an ordinary chat with Keeper and say **Start a new game**. Choose Quay Runner, Tidehand, or Lantern Singer. Keeper starts you at Lantern Quay, where a dark beacon and three uneven bell notes signal trouble below the harbor.

Speak naturally to investigate, talk, and act. You can restore the light and protect both shores, divert water at a cost to the Market, shutter the beacon and warn the boats, or evacuate and defer repairs. Pause whenever you want and return to the same chat to resume. Each new chat can hold a separate campaign.

The Template requests workspace-only reading and the engine's game-intent tool. Keeper reads the private GM source and reveals discoveries during play.

## Build from source

Use the OpenClaw CLI from a compatible development build. The Template
pins `@ekinnee/campaign-keeper-solo-engine@0.1.0` on ClawHub.

```bash
openclaw templates validate templates/campaign-keeper
openclaw templates build templates/campaign-keeper --out /tmp/campaign-keeper-0.1.0.tgz
```

To rebuild the pinned engine from this source, install the engine's development
dependencies and run `npm --prefix packages/engine run build:private-solo --
/path/to/new-engine-directory --release`.
