import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LifecycleCliHarness } from './lifecycle-cli-harness';

export const HERMES_FIXTURE_REVISION = 'c0d7294769a38c17ceae51d8f7995e66e1dcae27';

function gitFixture(root: string, revision: string, dirty = ''): string {
  return `#!/bin/sh\nif [ "$1" = '-C' ] && [ "$2" = ${JSON.stringify(root)} ]; then\n  case "$3" in\n    rev-parse) printf '%s\\n' ${JSON.stringify(root)} ${JSON.stringify(revision)} ;;\n    -c) [ "$4" = 'core.fsmonitor=false' ] && [ "$5" = status ] || exit 1; printf '%s' ${JSON.stringify(dirty)} ;;\n    *) exit 1 ;;\n  esac\nelse\n  exec /usr/bin/git "$@"\nfi\n`;
}

function launcher(root: string): string {
  const code = `import os, re, sys\nsys.path.insert(0, ${JSON.stringify(root)})\nfrom hermes_cli.main import main\nsys.exit(main())`;
  return `#!/bin/sh\nexec /usr/bin/python3 -I -c '${code}' "$@"\n`;
}

/** External executable boundary: a recognized native launcher's import binding. */
export function hermesRuntimeFixture(revision = HERMES_FIXTURE_REVISION): () => void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugnz-hermes-runtime-fixture-')));
  const saved = { PATH: process.env.PATH, OPEN_PLUGIN_HERMES_BIN: process.env.OPEN_PLUGIN_HERMES_BIN };
  const hermes = join(root, 'hermes');
  mkdirSync(join(root, 'hermes_cli'));
  writeFileSync(join(root, 'hermes_cli', 'main.py'), '');
  writeFileSync(hermes, launcher(root));
  writeFileSync(join(root, 'git'), gitFixture(root, revision));
  chmodSync(hermes, 0o755); chmodSync(join(root, 'git'), 0o755);
  process.env.OPEN_PLUGIN_HERMES_BIN = hermes;
  process.env.PATH = `${root}:${saved.PATH ?? '/usr/bin:/bin'}`;
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  };
}

export function hermesPublicRuntime(harness: LifecycleCliHarness, revision = HERMES_FIXTURE_REVISION, dirty = ''): void {
  const sourceRoot = harness.source('hermes-runtime', { 'hermes_cli/main.py': '' });
  const hermes = harness.fakeNative('hermes', []);
  writeFileSync(hermes.path, launcher(sourceRoot));
  // Local source resolution also calls git. Delegate those real source queries,
  // replacing only the external Hermes runtime checkout identity boundary.
  const git = harness.fakeNative('git', []);
  writeFileSync(git.path, gitFixture(sourceRoot, revision, dirty));
}
