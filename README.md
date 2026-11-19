# Erick's OpenClaw Agent Templates

A collection of independently installable OpenClaw Agent Templates. Each Template lives in its own `templates/<slug>/` directory with a separate `package.json`, `CLAW.md`, documentation, resources, and license. Adding a Template creates an agent; it does not install this collection as one package.

## Templates

| Template | Purpose |
| --- | --- |
| [Language Conversation Partner](templates/language-conversation-partner/) | Text-first conversation, role-play, focused exercises, and learner-controlled feedback; optional planning without a second agent. |
| [Campaign Keeper](templates/campaign-keeper/) | Persistent, text-first cooperative adventure with a bounded engine plugin. Pins the released solo engine `0.1.0`; saved play requires its installation and a compatible host. |

## Using a Template

Enable **Templates** in OpenClaw's **Settings → Labs**. From a Template's directory, follow its README and review its declared capabilities before adding it. Templates may have different permissions and dependencies; do not assume one Template's requirements apply to another.

## Contributing

Add a focused, self-contained directory under `templates/<slug>/`. Include the Template's own README, license and attribution, source verification steps, and any acceptance scenarios. Preserve unrelated Template directories. A pull request should state what the agent does, its capability and privacy boundaries, validation performed, and remaining limitations. Adding a Template here does not publish it to ClawHub or merge it into another repository.

## Verify package changes

Run `python3 scripts/verify-template-packages.py --out /tmp/template-package-audit`
with a compatible `openclaw`, Node.js/npm, and Python Pillow available. It builds
both Templates with the official CLI and npm packing used by ClawHub, checks the
exact selected payload and artwork bytes, and validates extracted packages.
It isolates CLI state under the output directory and does not Add an agent or
contact a Gateway. Use a new output directory for each run. See the
[current-guidance audit](docs/audits/template-current-guidance.md) for isolated
Add results and the separate catalog-icon/agent-avatar contracts.
