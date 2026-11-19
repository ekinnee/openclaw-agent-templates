#!/usr/bin/env node
// Fixture-only Add plan/workspace boundary. Does not install dependencies, persist
// agent config, start a Gateway, or run a model. Run with OpenClaw's tsx loader.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceTree, packages, output] = process.argv.slice(2).map(p => resolve(p));
assert(sourceTree && packages && output);
const upstream = async path => import(pathToFileURL(join(sourceTree, 'src', path)));
const { readTemplateManifestFile } = await upstream('templates/reader.ts');
const { buildTemplateAddPlan } = await upstream('templates/lifecycle.ts');
const { createTemplateWorkspaceFiles } = await upstream('templates/workspace.ts');
const { resolveAgentAvatar } = await upstream('agents/identity-avatar.ts');
const { resolveAgentAvatarUrlFromSource } = await upstream('agents/identity-avatar-file.ts');
await mkdir(output); // Refuse to overwrite another proof.
const results = [];
for (const slug of ['language-conversation-partner', 'campaign-keeper']) {
  for (const kind of ['official', 'npm']) {
    const packageRoot = join(packages, `${slug}-${kind}-extracted/package`);
    const source = await readTemplateManifestFile(packageRoot);
    assert(source.ok, JSON.stringify(source));
    const workspace = join(output, `${slug}-${kind}`);
    const plan = await buildTemplateAddPlan({
      manifest: source.manifest, templateMarkdownBody: source.templateMarkdownBody,
      packageBootstrap: source.packageBootstrap, source: source.source,
      context: { config: {}, workspace, existingAgentIds: [] },
    });
    // Keeper intentionally retains its dependency blocker. Do not bypass it by
    // calling the full installer: exercise only its independent workspace owner.
    if (slug === 'language-conversation-partner') assert.equal(plan.blockers.length, 0);
    else assert.equal(plan.summary.blockedActions, 1);
    await mkdir(workspace);
    const written = await createTemplateWorkspaceFiles(plan);
    const cfg = { agents: { entries: { [slug]: plan.agent.config } } };
    const selected = resolveAgentAvatar(cfg, slug);
    assert.equal(selected.kind, 'local');
    const original = await readFile(join(packageRoot, 'assets/icon.png'));
    assert.deepEqual(await readFile(selected.filePath), original);
    const url = await resolveAgentAvatarUrlFromSource(cfg, slug, plan.agent.config.identity.avatar);
    assert(url?.startsWith('data:image/png;base64,'), 'Avatar projection must resolve a PNG');
    assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), original);
    results.push({ slug, kind, copiedFiles: written.files.length,
      avatar: selected.source, resolution: selected.kind, mime: 'image/png',
      sha256: createHash('sha256').update(original).digest('hex'),
      blockers: plan.blockers, fullAdd: false });
  }
}
await writeFile(join(output, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
