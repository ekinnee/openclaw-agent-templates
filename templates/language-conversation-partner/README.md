# Language Conversation Partner

Practice a language through everyday conversation, role-play, and short exercises,
with corrections that match your preferences. Text-first, no external accounts,
and no skill, plugin, MCP, or scheduled-job dependencies.

## Add locally

Use an OpenClaw build with the single-file `CLAW.md` Template contract. This
package is locally verified with OpenClaw 2026.11.5; the unpublished source audit
is recorded in the repository-only `docs/audits/template-current-guidance.md`.
Older Focus Week instructions targeted an unreleased manifest change; version
numbers alone do not establish a backported build's capabilities. Enable
**Templates** under **Settings → Labs**, or set
`gateway.controlUi.experimental.templates` to true on a headless installation.

Add the currently published Template with (local changes here are unreleased):

```bash
openclaw templates add @ekinnee/language-conversation-partner
```

To install from the source project directory:

```bash
openclaw templates validate .
openclaw templates add . --dry-run --json
openclaw templates add .
```

Open the new agent's chat using the agent ID returned by Add. Adding again creates
another agent; it does not update an existing one. The template does not select a
model or provide model credentials; it uses the host's configured model access.

For a downloaded build artifact, extract it to a new directory and pass the
extracted package directory to templates add. The .tgz itself is a ClawHub
publication artifact, not the documented local Add input.

## Try it in five minutes

Start with:

> Spanish, beginner. Explain in English. Let's practice ordering lunch. Gentle
> corrections, please.

Then try these as ordinary chat messages, not slash commands:

- "Make that easier."
- "Give me a hint, not the answer."
- "Let's practice past tense, one question at a time."
- "Save corrections until the end."
- "Let's switch to talking about music."
- "Wrap up with a short recap."

If you do not know your level, say "not sure." The partner should adjust through
conversation rather than demand a placement test.

## Included behavior

- Conversation and fictional role-play, with short turns and one main question.
- Gentle, detailed, or at-the-end corrections; changes take effect immediately.
- Focused exercises that wait for an attempt and accept valid alternatives.
- Regional-usage awareness and explicit uncertainty.
- An evidence-based recap in chat, with a small next-practice suggestion.
- A lightweight goal and next checkpoint in chat when the learner asks for one.

## Optional planning collaboration

The language partner is complete on its own. If a learner wants longer-term
planning, it can propose a small in-chat plan. A host may separately install a
Learning Plan Coordinator and permit this agent to discover and delegate to it.
Only then, and after the learner approves the specific evidence to share, can
the partner ask it for a checkpoint plan or revision and bring the proposal back
into the same conversation. Installation alone does not connect the agents.
The portable Template cannot configure named delegates, and its
OpenClaw tool policy grants only workspace-scoped reading. Enabling delegation is
an explicit host-policy choice; this package does not grant or require it.

## Capabilities and limits

The manifest uses `agent.tools.profile: full` with the explicit allowlist
`[read]`. Reads are workspace-scoped and intended for the packaged references.
Host policy may further restrict them.
The manifest grants no write, shell, browser, messaging, or automation tools.
Current OpenClaw Control UI Add separately adds `read`, `automations`, `plugins`,
and `message` for host-owned setup, subject to explicit denies and operator
policy. Review the resulting agent policy if you require read-only operation.
Other harnesses must enforce their own tool policies.

This template does not record pronunciation, score audio, certify CEFR levels,
award credentials, or promise native-level accuracy across languages. Language
quality depends on the host model. English, Spanish, French, and Japanese are
initial review targets, not a claim of verified fluent-speaker review.

No learner profile or progress file is deliberately created. Preferences and
recaps remain in the conversation; normal host chat history, memory features,
model processing, and retention policies still apply. Do not enter sensitive
personal information just to make a role-play realistic.

## Build and review

```bash
openclaw templates validate .
openclaw templates dev . --json
openclaw templates build . --out ../language-conversation-partner-0.1.2.tgz
```

Review the exact built archive before publishing it to ClawHub under `ekinnee`.

Source acceptance scenarios are in `tests/acceptance.md` and intentionally are
not imported into the new agent's workspace or built publication artifact.

## Feedback

1. Did it start practicing quickly enough?
2. Were corrections helpful or disruptive?
3. Was the difficulty appropriate, and did adjustments work?
4. If you speak the target variety, did it flag valid language as an error?

Created with Erick Kinnee for Agent Templates Focus Week. The Blobster uses
OpenClaw's MIT-licensed base geometry, with a new speech-bubble design. See LICENSE.

## Artwork and packaging

`assets/icon.png` is the single shipped image source. ClawHub reads that fixed
package path for the catalog icon; `CLAW.md` separately maps the same bytes to
`avatars/blobster.png` in the new agent's workspace and selects that avatar.
A missing catalog icon does not establish that an installed avatar is missing.
Adding the Template again creates another agent; publishing a new release does
not update existing avatars.

The PNG is a 512-pixel-wide rasterization of the existing Conversation Blobster
SVG, retained under `avatars/` for attribution and source editing. No new design
was created. Keep the PNG at most 512 KiB (ClawHub), each workspace source at
most 1 MiB, and selected workspace sources together at most 4 MiB (OpenClaw).
The npm `files` allowlist includes the declared payload and excludes authoring
SVGs and acceptance notes; the official Template builder uses manifest selection.
Inspect both archives before any separately authorized publication.
