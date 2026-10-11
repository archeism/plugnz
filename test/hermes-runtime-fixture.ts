import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LifecycleCliHarness } from './lifecycle-cli-harness';

export const HERMES_FIXTURE_REVISION = 'c0d7294769a38c17ceae51d8f7995e66e1dcae27';

function gitFixture(root: string, revision: string, dirty = ''): string {
  return `#!/bin/sh\nif [ "$1" = '-C' ] && [ "$2" = ${JSON.stringify(root)} ]; then\n  case "$3" in\n    rev-parse) printf '%s\\n' ${JSON.stringify(root)} ${JSON.stringify(revision)} ;;\n    status) printf '%s' ${JSON.stringify(dirty)} ;;\n    *) exit 1 ;;\n  esac\nelse\n  exec /usr/bin/git "$@"\nfi\n`;
}

/** External executable boundary: a version response and its reported checkout. */
export function hermesRuntimeFixture(revision = HERMES_FIXTURE_REVISION): () => void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugnz-hermes-runtime-fixture-')));
  const saved = { PATH: process.env.PATH, OPEN_PLUGIN_HERMES_BIN: process.env.OPEN_PLUGIN_HERMES_BIN };
  const hermes = join(root, 'hermes');
  writeFileSync(hermes, `#!/bin/sh\nprintf '%s\\n' 'Hermes Agent vfixture (test)' ${JSON.stringify(`Install directory: ${root}`)}\n`);
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
  const sourceRoot = harness.source('hermes-runtime', { '.keep': '' });
  harness.fakeNative('hermes', Array.from({ length: 64 }, () => ({
    args: ['--version'], stdout: `Hermes Agent vfixture (test)\nInstall directory: ${sourceRoot}\n`,
  })));
  // Local source resolution also calls git. Delegate those real source queries,
  // replacing only the external Hermes runtime checkout identity boundary.
  const git = harness.fakeNative('git', []);
  writeFileSync(git.path, gitFixture(sourceRoot, revision, dirty));
}
