# Campaign Keeper

**Release staging.** The Lantern Below is a solo text adventure in six rooms, with original 2d6 rules, three character classes, and four endings. Created with Erick Kinnee. The adventure and illustration are original under MIT.

The staging Template has an empty plugin list. Saved play requires the Campaign Keeper engine at a reviewed, exact ClawHub version and an OpenClaw host with verified requester identity for plugin tools. The isolated playtest used an OpenClaw source build with the proposed identity capability. A portable Add is pending.

## Play on a prepared host

Open an ordinary chat with Keeper and say **Start a new game**. Choose Quay Runner, Tidehand, or Lantern Singer. Keeper starts you at Lantern Quay, where a dark beacon and three uneven bell notes signal trouble below the harbor.

Speak naturally to investigate, talk, and act. You can restore the light and protect both shores, divert water at a cost to the Market, shutter the beacon and warn the boats, or evacuate and defer repairs. Pause whenever you want and return to the same chat to resume. Each new chat can hold a separate campaign.

The first release target is solo play with the authenticated owner. The Template requests workspace-only reading and the engine's game-intent tool. Keeper reads the private GM source and reveals discoveries during play. The host supplies the model and credentials.

## Check the staging package

From this directory, use the Template CLI that supports native agent settings and the `plugins` dependency list.

```bash
openclaw templates validate .
openclaw templates dev . --json
openclaw templates build . --out /tmp/campaign-keeper-0.1.0-staging.tgz
```

These commands check the local Template and build an archive. The staging archive has no engine dependency. For the portable release, the published engine must be installed by an exact dependency reference and exercised through a fresh Add.
