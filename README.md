# Erick's OpenClaw Agent Templates

A collection of independently installable OpenClaw Agent Templates. Each Template lives in its own `templates/<slug>/` directory with a separate `package.json`, `CLAW.md`, documentation, resources, and license. Adding a Template creates an agent; it does not install this collection as one package.

## Templates

| Template | Purpose |
| --- | --- |
| [Language Conversation Partner](templates/language-conversation-partner/) | Text-first conversation, role-play, focused exercises, and learner-controlled feedback; optional planning without a second agent. |

## Using a Template

Enable **Templates** in OpenClaw's **Settings → Labs**. From a Template's directory, follow its README and review its declared capabilities before adding it. Templates may have different permissions and dependencies; do not assume one Template's requirements apply to another.

## Contributing

Add a focused, self-contained directory under `templates/<slug>/`. Include the Template's own README, license and attribution, source verification steps, and any acceptance scenarios. Preserve unrelated Template directories. A pull request should state what the agent does, its capability and privacy boundaries, validation performed, and remaining limitations. Adding a Template here does not publish it to ClawHub or merge it into another repository.
