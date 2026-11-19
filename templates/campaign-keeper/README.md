# Campaign Keeper

The Lantern Below is a solo text adventure in six rooms, with original 2d6 rules, three character classes, and four endings. Created with Erick Kinnee. The adventure and illustration are original under MIT.

## Add Campaign Keeper

Use a private Gateway with one trusted owner and a build supporting the
single-file `CLAW.md` Template contract and native Template plugin requirements.
Local authoring is verified with OpenClaw 2026.11.5. Solo play requires an
authenticated Gateway owner/operator in a private WebChat, with current operator
and invocation authority. It does not require `requesterProfile`. Package
validation alone does not establish gameplay on a particular host.

Enable **Templates** in **Settings → Labs**. Select Campaign Keeper in
**Pages → Templates** and choose **Add**. On current OpenClaw source, referenced
community plugins are offered for separate review/installation in setup;
Template Add alone does not install or enable them. Review
`@ekinnee/campaign-keeper-solo-engine@0.1.0` and its tool grants before installing
it. CLI/offline Add has its own dependency preflight and consent checks. Local
changes here are unreleased; the catalog still serves the published version.
The host supplies your configured model. Keep the ordinary persistent Keeper
chat private.

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
openclaw templates build templates/campaign-keeper --out /tmp/campaign-keeper-0.1.1.tgz
```

To rebuild the pinned engine from this source, install the engine's development
dependencies and run `npm --prefix packages/engine run build:private-solo --
/path/to/new-engine-directory --release`.

## Artwork and packaging

`assets/icon.png` is the single shipped image source. ClawHub uses that fixed
path for catalog artwork. `CLAW.md` copies it to `avatars/blobster-keeper.png`
and selects that workspace avatar independently. Catalog `icon:null` does not
prove an installed avatar failure. Existing agents are not updated by a new Add.

The PNG preserves the existing main-branch Keeper artwork, resized from 768 × 768
to 512 × 512 to fit ClawHub's 512 KiB limit. The original PNG and older SVG remain
source-only under `avatars/`; the published 0.1.0 used the SVG, whereas this source
base had already selected the PNG. No new design was created. Original
illustration credit and MIT licensing are unchanged.

OpenClaw limits each selected workspace file to 1 MiB and their total to 4 MiB.
Keep the catalog PNG within the tighter 512 KiB limit. The npm `files` allowlist
and the manifest-selected official build both ship the declared artwork and
license; source-only artwork and acceptance notes are excluded. See the repository-only `docs/audits/template-current-guidance.md` for evidence
and the remaining installed-play/UI limitations.
