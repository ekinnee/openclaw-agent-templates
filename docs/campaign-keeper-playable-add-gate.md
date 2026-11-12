# Campaign Keeper release handoff

The Focus Week release target is one authenticated owner playing The Lantern Below in ordinary chat with Keeper. Character selection, saved progress, the pressure and optics repair, and all four endings are in scope. Multiplayer enrollment and the launcher and sidebar experiments are outside the first release promise.

## Verified play

The isolated test Gateway ran OpenClaw main at `ad5fb63` with the requester identity from [OpenClaw #189600](https://github.com/openclaw/openclaw/pull/189600) at `fabedf1`. Generation 9 loaded the tested local engine archive. The human browser completed the Archive-prism route before the pressure update. Dedicated authenticated chat tests proved that the revised BALANCE route needs the Pump release and that DIVERT, SHUT, and evacuation reach their saved endings. There is separate restart and resume evidence on that same source build. See the [playtest ledger](campaign-keeper-proof.md).

Keeper uses the existing `campaign_keeper_intent` tool for the current authenticated actor and session. WebChat requires the host-supplied `requesterProfile` and its current-authority assertion. The separate deterministic command adapter uses a different save binding. Normal chat requires a working model.

## Release gates

1. **Qualify a released host.** Stable `v2026.11.3`, beta `v2026.11.5-beta.2`, and upstream main lacked the required tool context field when checked on November 12, 2026. #189600 was open at `fabedf1`. Verify a released build carrying that contract or a reviewed equivalent, then set the engine's actual compatibility floor. The current private spike's 2026.11.2 metadata predates the WebChat adapter and cannot qualify it for release.
2. **Publish a reviewed engine.** Freeze a source revision, inspect the package and permissions, resolve provenance, and release an immutable version under the verified ClawHub publisher. Verify registry status, version, digest, and source evidence, then install that exact version in fresh isolated state. The local archive's verified bytes and local game proof establish candidate behavior. Its provenance remains unverified.
3. **Prove portable Add.** Use the released host's supported dependency schema. The current source-build loader uses `plugins: [{ ref, version }]` with exact ClawHub versions. The beta still uses the older `packages` schema, so confirm the syntax at the qualified release. Inspect the plan and run Add in fresh state. Confirm that it installs the exact engine and applies workspace-only `read` and `campaign_keeper_intent`. Create a character, commit a move, reopen and read the saved scene. Reuse the existing end-to-end finale and restart cases where their inputs match, and check rejection for a mismatched caller.
4. **Review and release the Template.** Build the dependency-bearing Template twice and compare digests. Verify the published archive and perform a public exact-version install. The remote [draft Template PR #2](https://github.com/ekinnee/openclaw-agent-templates/pull/2) remains staging until the host, engine, and Add gates pass.

## Local staging

The local staging manifest uses native agent tool settings and an empty `plugins` list for the newer Template loader. It includes the solo play instructions derived from the tested Keeper workspace, current rules and adventure, and the original avatar. Validate and build it with the same source-build CLI while the host dependency is pending. Build success establishes packaging and manifest shape. The next integration proof is a fresh Add with the real dependency.

### Focus Week staging evidence

- On November 12, the earlier draft failed validation on the test host's newer Template loader because it used the retired `packages` field. Its `profiles/` directory was also retired on that loader. The local draft now uses native agent tool settings and an empty `plugins` list. Validation and the offline dev plan passed. Two builds produced identical staging archives with SHA-256 `c7245d4371634e87633fe72ccd46585f7ee38573b4d87fbce01c9fd13f3368be`. The plan has no dependency actions.
- The staged engine is the generation 9 playtest archive with SHA-256 `df246bb4a1ea472458a47697344fec3b9972d60f87fd368533e402287d87ebd0`. Rebuilding its server bundle with esbuild 0.28.2 from the current worktree matched the tested bytes. ClawHub's static package inspection passed against the npm 2026.11.3 target with zero contract probes. This check does not exercise requester identity in a live turn.
- ClawHub authenticated the `ekinnee` publisher account. The code-plugin publish preview required `--source-repo` and `--source-commit`. A reviewed, committed engine source and honest host compatibility still need to be established. A base commit predating the adapter would misrepresent the archive's source.
- The packaged engine artifact is the tested spike, with its experimental UI. The solo release package should omit that launcher and sidebar surface or make it opt-in before qualification. The Template builds ran offline. Live game proof is recorded separately in the proof ledger.
