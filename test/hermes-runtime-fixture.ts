import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LifecycleCliHarness } from './lifecycle-cli-harness';
import { hermesNativeBootstrap, hermesUvConsoleBody } from '../src/hosts/hermes-launcher-templates';
import { writeFiles } from './util';

export const HERMES_FIXTURE_REVISION = 'c0d7294769a38c17ceae51d8f7995e66e1dcae27';

function gitFixture(root: string, revision: string, dirty = ''): string {
  return `#!/bin/sh\nif [ "$1" = '-C' ] && [ "$2" = ${JSON.stringify(root)} ]; then\n  case "$3" in\n    rev-parse) printf '%s\\n' ${JSON.stringify(root)} ${JSON.stringify(revision)} ;;\n    -c) [ "$4" = 'core.fsmonitor=false' ] && [ "$5" = status ] || exit 1; printf '%s' ${JSON.stringify(dirty)} ;;\n    *) exit 1 ;;\n  esac\nelse\n  exec /usr/bin/git "$@"\nfi\n`;
}

export function nativeHermesFixtureLauncher(root: string): string {
  const code = hermesNativeBootstrap.replaceAll("'/__PLUGNZ_HERMES_ROOT__'", `'${root}'`);
  return `#!/bin/sh\nexec /usr/bin/python3 -I -c '${code.replace(/'/gu, `'"'"'`)}' "$@"\n`;
}

function consoleRuntime(root: string): string {
  const venv = join(root, '.venv');
  const executable = join(venv, 'bin', 'hermes');
  writeFiles(root, {
    'hermes_cli/main.py': '',
    '.venv/pyvenv.cfg': 'include-system-site-packages = false\n',
    '.venv/bin/python': '#!/bin/sh\nexit 97\n',
    '.venv/bin/hermes': `#!${join(venv, 'bin', 'python')}\n${hermesUvConsoleBody}`,
    '.venv/lib/python3.13/site-packages/hermes_agent-0.21.4.dist-info/direct_url.json': JSON.stringify({ url: `file://${root}`, dir_info: { editable: true } }),
    '.venv/lib/python3.13/site-packages/hermes_agent-0.21.4.dist-info/entry_points.txt': '[console_scripts]\nhermes = hermes_cli.main:main\n',
    '.venv/lib/python3.13/site-packages/__editable__.hermes_agent-0.21.4.pth': `${root}\n`,
  });
  chmodSync(executable, 0o755);
  return executable;
}

/** External executable boundary: a recognized native launcher's import binding. */
export function hermesRuntimeFixture(revision = HERMES_FIXTURE_REVISION): () => void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugnz-hermes-runtime-fixture-')));
  const saved = { PATH: process.env.PATH, OPEN_PLUGIN_HERMES_BIN: process.env.OPEN_PLUGIN_HERMES_BIN };
  const hermes = join(root, 'hermes');
  const executable = consoleRuntime(root);
  writeFileSync(hermes, `#!/bin/sh\nexec ${JSON.stringify(executable)} "$@"\n`);
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

export function hermesPublicRuntime(harness: LifecycleCliHarness, revision = HERMES_FIXTURE_REVISION, dirty = ''): { sourceRoot: string; executable: string } {
  const sourceRoot = harness.source('hermes-runtime', { 'hermes_cli/main.py': '' });
  const hermes = harness.fakeNative('hermes', []);
  const executable = consoleRuntime(sourceRoot);
  writeFileSync(hermes.path, `#!/bin/sh\nexec ${JSON.stringify(executable)} "$@"\n`);
  // Local source resolution also calls git. Delegate those real source queries,
  // replacing only the external Hermes runtime checkout identity boundary.
  const git = harness.fakeNative('git', []);
  writeFileSync(git.path, gitFixture(sourceRoot, revision, dirty));
  return { sourceRoot, executable: hermes.path };
}
