# Template catalog-icon audit — 2026-11-19

Base: `5b967aef2bdc832bd2c1d39cc533a0a2ed4039fb`;
worktree branch: `audit/template-current-guidance`. Changes remain uncommitted.
Erick clarified that the reported missing Blobsters were **catalog icons for both
Templates**. Independent review confirmed the icon solution and identified the
solo-prerequisite and category corrections below; this bounded repair applies them.
No publication was requested. No publication, live Gateway writes, engine edits,
or other-worktree changes were performed.

## Final scope and corrections

- Language remains `0.1.2`; Keeper remains `0.1.1`. Each declares one
  `assets/icon.png` source, also mapped to a workspace avatar. Original artwork,
  attribution, manifest tools and engine `@ekinnee/campaign-keeper-solo-engine@0.1.0`
  pin are preserved. No new design or lifecycle owner was added.
- Both manifests use only `categories: [entertainment]`, following the current
  ClawHub category guidance covering games and language practice; retired
  `personal` and the prior language `productivity` selection are removed.
- Keeper README/bootstrap now describe authenticated Gateway owner/operator,
  private WebChat, and current operator/invocation authority. They do not require
  `requesterProfile`. Read-only confirmation: `packages/engine/solo-template-entry.ts`
  checks `operator.admin`; `packages/engine/engine.ts`'s private-solo branch checks
  owner, direct input, WebChat and invocation authority; the private-solo test in
  `packages/engine/engine.test.ts` succeeds with `requesterProfile: undefined`.
  No engine behavior or authority was changed, and engine tests were not rerun.
- Verification remains limited to packaging. No further Add, preflight, gameplay,
  or UI investigation is part of this repair.

## Catalog cause and source contracts

Both public archives were **downloaded from the registry**, with verified digests,
under `/tmp/template-registry.efotkr`; they were not user-supplied archives:

- language `0.1.1`: `6868c1421b9853a5a81d29abb231c0c7f4f03e608fcadd7e762a066cf1ecfbd2`
- Keeper `0.1.0`: `c7b0846f7a98cdebbcb06ae7f8b19a28d0e977ce64b60cc6aee14445d5da3bec`

Neither contains `assets/icon.png`, explaining the missing catalog artwork under
the server convention. Both contain and map SVG avatars; Keeper's published
manifest selects SVG even though the selected main base already maps its PNG.
Catalog artwork and installed agent avatars are separate surfaces.

ClawHub server snapshot `63a48631a855dfda27254b4a767962ca7a4ece8b`:
[icon resolver](https://github.com/openclaw/clawhub/blob/63a48631a855dfda27254b4a767962ca7a4ece8b/convex/lib/packageIcons.ts),
[package ingestion](https://github.com/openclaw/clawhub/blob/63a48631a855dfda27254b4a767962ca7a4ece8b/convex/packages.ts), and
[Template artwork test](https://github.com/openclaw/clawhub/blob/63a48631a855dfda27254b4a767962ca7a4ece8b/convex/packages.templateArtwork.runtime.test.ts)
confirm fixed-path PNG extraction for Templates, not only plugins. The limit is
512 KiB. Keeper's original main PNG was 579,045 bytes; the preserved-artwork
512 × 512 resize is 180,353 bytes. Language's existing SVG was rasterized to
512 × 469, 21,366 bytes. Both originals remain source-only and unchanged.

Earlier contract inspection used installed OpenClaw `2026.11.5 (5bb6f35)` at
`/home/openclaw/openclaw` and newer source `6ef632bfb498` at
`/mnt/projects/openclaw`: `skills/create-blobster/SKILL.md`, `docs/cli/templates.md`,
and the project-build/workspace/avatar owners. A selected PNG can serve both
packaging paths and map independently to the workspace avatar. OpenClaw limits
workspace files to 1 MiB each and 4 MiB total. npm allowlists exclude source-only
art/tests; the official builder selects manifest files and normalizes metadata.

## Final verification

Ran exactly once after all shipped-payload corrections:

```bash
python3 scripts/verify-template-packages.py --out /tmp/template-catalog-release-proof
```

**Exit 0**, using OpenClaw `2026.11.5 (5bb6f35)` and npm `12.2.2`:
two source validations, two official builds, two npm packs, and four extracted
package validations passed. Each of the four archives contains exactly nine
selected files. Category `[entertainment]`, PNG limits/bytes, unchanged manifest
tool authority and the exact engine pin all passed verification. Versions remain
language `0.1.2` and Keeper `0.1.1`; both icon digests match the prior artwork.
The proof directory retains command stdout/stderr, four archives, extracted
packages and `summary.json`. `git diff --check` passed after this note update.

| Template | Builder | Final artifact SHA-256 |
| --- | --- | --- |
| @ekinnee/language-conversation-partner 0.1.2 | official | `e5405ccb4d41ad082e6ace9acd1986090528726f0688b661d502c7cd04a11adc` |
| @ekinnee/language-conversation-partner 0.1.2 | npm | `5d656694a66e2ea43d78043e3404f2cf26ecef278f26370562afa037515ab76b` |
| @ekinnee/campaign-keeper 0.1.1 | official | `dacbeb5921a62118a21bbf66b9b7746ae7538b714e5bace98e98d416e729e558` |
| @ekinnee/campaign-keeper 0.1.1 | npm | `76635167504a580580b28219a9c2ec12d43fecc36246a69dad47af5e8cd69be6` |

Earlier avatar-helper fixtures passed for four previous-payload artifacts and
both published SVGs. They are historical helper evidence, not full Add or UI
proof. The earlier newer-source probe failed before assertions because
`@openclaw/proc-safe` was unavailable; stale dist was not used as newer-source
proof. Those limitations remain; no additional probes or installs were attempted.
