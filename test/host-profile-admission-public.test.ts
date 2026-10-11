import { expect, test } from 'bun:test';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { hermesPublicRuntime, nativeHermesFixtureLauncher } from './hermes-runtime-fixture';
import { initGitRepo, writeFiles } from './util';
import { hermesEditableFinderBody } from '../src/hosts/hermes-launcher-templates';
import { spawnSync } from 'node:child_process';

test('isolated Python PathFinder identifies Hermes extension precedence without importing source', async () => {
  await withLifecycleCliHarness(harness => {
    const runtime = hermesPublicRuntime(harness);
    writeFiles(runtime.sourceRoot, {
      'hermes_bootstrap.py': '', 'hermes_bootstrap.so': 'not executed',
      'hermes_cli/main.so': 'not executed',
      'hermes_cli/__init__.py': '', 'hermes_cli/__init__.so': 'not executed',
    });
    const before = snapshotTree(runtime.sourceRoot);
    const probe = `import importlib.machinery, json\nfrom pathlib import Path\nroot = Path(${JSON.stringify(runtime.sourceRoot)})\nrows = []\nfor name, directory in [('hermes_bootstrap', root), ('main', root / 'hermes_cli'), ('__init__', root / 'hermes_cli')]:\n    spec = importlib.machinery.PathFinder.find_spec(name, [str(directory)])\n    rows.append({'name': name, 'loader': type(spec.loader).__name__, 'origin': spec.origin})\nprint(json.dumps(rows))\n`;
    const result = spawnSync('/usr/bin/python3', ['-I', '-B', '-c', probe], {
      encoding: 'utf8', cwd: harness.home, env: { HOME: harness.home, PATH: '/usr/bin:/bin' },
    });
    expect({ code: result.status, stderr: result.stderr }).toEqual({ code: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual([
      { name: 'hermes_bootstrap', loader: 'ExtensionFileLoader', origin: join(runtime.sourceRoot, 'hermes_bootstrap.so') },
      { name: 'main', loader: 'ExtensionFileLoader', origin: join(runtime.sourceRoot, 'hermes_cli/main.so') },
      { name: '__init__', loader: 'ExtensionFileLoader', origin: join(runtime.sourceRoot, 'hermes_cli/__init__.so') },
    ]);
    expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
  });
});

for (const form of ['native', 'editable'] as const) {
  for (const [name, files] of [
    ['root bootstrap extension', { 'hermes_bootstrap.so': 'foreign extension' }],
    ['nested main extension', { 'hermes_cli/main.so': 'foreign extension' }],
    ['nested tagged extension', { 'hermes_cli/plugins.py': '', 'hermes_cli/plugins.abi3.so': 'foreign extension' }],
    ['package initializer extension', { 'hermes_cli/__init__.py': '', 'hermes_cli/__init__.so': 'foreign extension' }],
    ['namespace initializer extension', { 'hermes_cli/__init__.so': 'foreign extension' }],
    ['nested namespace extension', { 'hermes_cli/nested/handler.py': '', 'hermes_cli/nested.so': 'foreign extension' }],
    ['root bootstrap package', { 'hermes_bootstrap.py': '', 'hermes_bootstrap/__init__.py': 'foreign package' }],
  ] as const) {
    test(`${form} Hermes refuses source import-closure ${name} before any writes`, async () => {
      await withLifecycleCliHarness(harness => {
        const runtime = hermesPublicRuntime(harness);
        writeFiles(runtime.sourceRoot, files);
        if (form === 'native') writeFileSync(runtime.executable, nativeHermesFixtureLauncher(runtime.sourceRoot));
        harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
        const source = harness.source('plugin', {
          'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}\n',
          'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
        });
        const before = snapshotTree(runtime.sourceRoot);
        const result = harness.run(['add', source, '--target', 'hermes', '--json']);
        expect(result.exitCode).toBe(1);
        expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
        expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
        expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
        expect(result.state.after).toEqual(result.state.before);
        expect(result.ambient.after).toEqual(result.ambient.before);
      });
    });
  }
  test(`${form} Hermes admits inert untracked source files without executing or changing the runtime`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness);
      writeFiles(runtime.sourceRoot, { 'notes/untracked.txt': 'preserved inert note', 'hermes_cli/untracked.md': 'preserved inert document' });
      if (form === 'native') writeFileSync(runtime.executable, nativeHermesFixtureLauncher(runtime.sourceRoot));
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', {
        'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
      });
      const before = snapshotTree(runtime.sourceRoot);
      const result = harness.run(['add', source, '--target', 'hermes', '--json']);
      expect(result.exitCode).toBe(0);
      expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason).toBe(null);
      expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
      expect(result.ambient.after).toEqual(result.ambient.before);
    });
  });
}

for (const [name, files] of [
  ['conflicting config', { '.venv/pyvenv.cfg': 'include-system-site-packages = false\ninclude-system-site-packages = true\n' }],
  ['duplicate config', { '.venv/pyvenv.cfg': 'include-system-site-packages = false\ninclude-system-site-packages = false\n' }],
  ['bin config precedence', { '.venv/bin/pyvenv.cfg': 'include-system-site-packages = true\n' }],
  ['site sourceless module', { '.venv/lib/python3.13/site-packages/hermes_cli.pyc': 'foreign bytecode' }],
  ['bin extension module', { '.venv/bin/hermes_cli.cpython-313-x86_64-linux-gnu.so': 'foreign extension' }],
  ['site extension customization', { '.venv/lib/python3.13/site-packages/sitecustomize.abi3.so': 'foreign extension' }],
  ['source sourceless customization', { 'usercustomize.pyc': 'foreign bytecode' }],
  ['virtualenv extension shadow', { '.venv/lib/python3.13/site-packages/_virtualenv.so': 'foreign extension' }],
  ['finder sourceless shadow', { '.venv/lib/python3.13/site-packages/__editable___hermes_agent_0_21_4_finder.pyc': 'foreign bytecode' }],
  ['debug extension shadow', { '.venv/lib/python3.13/site-packages/hermes_cli_d.pyd': 'foreign extension' }],
  ['bootstrap site extension shadow', { '.venv/lib/python3.13/site-packages/hermes_bootstrap.so': 'foreign extension' }],
  ['constants bin extension shadow', { '.venv/bin/hermes_constants.so': 'foreign extension' }],
] as const) {
  test(`editable Hermes refuses ${name} with no writes`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness);
      writeFiles(runtime.sourceRoot, files);
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', {
        'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
      });
      const before = snapshotTree(runtime.sourceRoot);
      const result = harness.run(['add', source, '--target', 'hermes', '--json']);
      expect(result.exitCode).toBe(1);
      expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
      expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.ambient.after).toEqual(result.ambient.before);
    });
  });
}

for (const form of ['native-middle', 'console-prelude'] as const) {
  test(`lookalike Hermes ${form} cannot substitute a foreign import source`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness);
      let executable = runtime.executable;
      if (form === 'native-middle') {
        writeFileSync(executable, nativeHermesFixtureLauncher(runtime.sourceRoot).replace('from hermes_cli.main import main',
          `sys.path[:] = ["/foreign/hermes/source"]\nfrom hermes_cli.main import main`));
      } else {
        const venv = join(runtime.sourceRoot, '.venv');
        executable = join(venv, 'bin', 'hermes');
        writeFiles(venv, {
          'pyvenv.cfg': 'include-system-site-packages = false\n',
          'bin/python': '#!/bin/sh\nexit 97\n',
          'bin/hermes': `#!${join(venv, 'bin', 'python')}\nimport sys\nsys.path[:] = ["/foreign/hermes/source"]\nfrom hermes_cli.main import main\nsys.exit(main())\n`,
          'lib/python3.13/site-packages/hermes_agent-0.21.4.dist-info/direct_url.json': JSON.stringify({ url: `file://${runtime.sourceRoot}`, dir_info: { editable: true } }),
          'lib/python3.13/site-packages/hermes_agent-0.21.4.dist-info/entry_points.txt': '[console_scripts]\nhermes = hermes_cli.main:main\n',
          'lib/python3.13/site-packages/__editable__.hermes_agent-0.21.4.pth': 'import finder; finder.install()\n',
          'lib/python3.13/site-packages/finder.py': `MAPPING: dict[str, str] = {'hermes_cli': '${runtime.sourceRoot}/hermes_cli'}\n`,
        });
        chmodSync(executable, 0o755);
      }
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', {
        'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
      });
      const before = snapshotTree(runtime.sourceRoot);
      const result = harness.run(['add', source, '--target', 'hermes', '--json'], {
        env: { OPEN_PLUGIN_HERMES_BIN: executable },
      });
      expect(result.exitCode).toBe(1);
      expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
      expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.ambient.after).toEqual(result.ambient.before);
    });
  });
}

for (const shadow of ['bin-module', 'site-module', 'extra-pth', 'finder-code'] as const) {
  test(`editable Hermes refuses ${shadow} import precedence without any writes`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness);
      const packages = '.venv/lib/python3.13/site-packages';
      const foreign = harness.source('foreign-runtime', { 'hermes_cli/main.py': 'raise RuntimeError("foreign source")\n' });
      if (shadow === 'bin-module') writeFiles(runtime.sourceRoot, { '.venv/bin/hermes_cli.py': 'foreign = True\n' });
      else if (shadow === 'site-module') writeFiles(runtime.sourceRoot, { [`${packages}/hermes_cli/__init__.py`]: 'foreign = True\n' });
      else if (shadow === 'extra-pth') writeFiles(runtime.sourceRoot, { [`${packages}/00-foreign.pth`]: `${foreign}\n` });
      else {
        const finder = '__editable___hermes_agent_0_21_4_finder';
        const code = hermesEditableFinderBody.replace('__MAPPING__', `MAPPING: dict[str, str] = {'hermes_cli': '${runtime.sourceRoot}/hermes_cli'}`)
          .replace('__NAMESPACES__', 'NAMESPACES: dict[str, list[str]] = {}')
          .replace('__EDITABLE_NAME__', '__editable__.hermes_agent-0.21.4.finder')
          .replace('import sys\n', `import sys\nsys.path[:] = ['${foreign}']\n`);
        writeFiles(runtime.sourceRoot, {
          [`${packages}/__editable__.hermes_agent-0.21.4.pth`]: `import ${finder}; ${finder}.install()\n`,
          [`${packages}/${finder}.py`]: code,
        });
      }
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
      const before = snapshotTree(runtime.sourceRoot);
      const result = harness.run(['add', source, '--target', 'hermes', '--json']);
      expect(result.exitCode).toBe(1);
      expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
      expect(snapshotTree(runtime.sourceRoot)).toEqual(before);
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.ambient.after).toEqual(result.ambient.before);
    });
  });
}

test('an interrupted Hermes checkout is observed without startup recovery or Python bytecode writes', async () => {
  await withLifecycleCliHarness(harness => {
    const runtime = harness.source('interrupted-hermes', {
      '.git/hermes-update-pull': 'pre=0000000000000000000000000000000000000000\n',
      'hermes_cli/__init__.py': '',
      'hermes_cli/main.py': `from pathlib import Path\nroot = Path(__file__).resolve().parents[1]\n# Model the documented startup recovery boundary before argument handling.\n(root / '.git/hermes-update-pull').write_text('recovered')\n(root / 'recovery-sentinel').write_text('startup ran')\ndef main():\n    print('Hermes Agent vfixture (test)')\n    print('Install directory: ' + str(root))\n    return 0\n`,
      '.venv/.keep': '',
    });
    initGitRepo(runtime, { 'tracked-sentinel': 'unchanged\n' });
    const launcher = join(runtime, 'hermes');
    const bootstrap = `import os, re, sys\nsys.path.insert(0, ${JSON.stringify(runtime)})\nfrom hermes_cli.main import main\nsys.exit(main())`;
    writeFileSync(launcher, `#!/bin/sh\nexec /usr/bin/python3 -I -c '${bootstrap}' "$@"\n`);
    chmodSync(launcher, 0o755);
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('plugin', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const before = snapshotTree(runtime);
    const result = harness.run(['add', source, '--target', 'hermes', '--json'], {
      env: { OPEN_PLUGIN_HERMES_BIN: launcher },
    });
    expect(result.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
    expect(snapshotTree(runtime)).toEqual(before);
    expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('an unrecognized Hermes launcher reports its missing proof without executing it', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('plugin', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const hermes = harness.fakeNative('hermes', [{ args: ['--version'], stdout: 'Hermes Agent vfixture\n' }]);
    const result = harness.run(['add', source, '--target', 'hermes', '--json']);
    expect(result.exitCode).toBe(1);
    const reason = parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason;
    expect(reason?.code).toBe('capability.unverified');
    expect(reason?.diagnostic).toContain('launcher source binding is unverified');
    expect(hermes.invocations()).toEqual([]);
    expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('Hermes admits evidenced clean revisions and refuses unknown or locally modified revisions', async () => {
  for (const [revision, dirty, expectedCode] of [
    ['c0d7294769a38c17ceae51d8f7995e66e1dcae27', '', 0],
    ['dce1e9b37581dd62e480a9064dc04a709c2940d3', '', 0],
    ['0'.repeat(40), '', 1],
    ['dce1e9b37581dd62e480a9064dc04a709c2940d3', ' M hermes_cli/plugins.py\n', 1],
  ] as const) {
    await withLifecycleCliHarness(harness => {
      hermesPublicRuntime(harness, revision, dirty);
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('hermes-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const result = harness.run(['add', source, '--target', 'hermes', ...(expectedCode === 0 ? ['--dry-run'] : []), '--json']);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(expectedCode);
      expect(report.outcomes[0]?.reason?.code ?? null).toBe(expectedCode === 0 ? null : 'capability.unverified');
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
    });
  }
});

test('Claude lifecycle keeps both evidenced releases available through the public CLI', async () => {
  for (const version of ['2.1.275', '2.1.295']) {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.claude/.keep': '' });
      const source = harness.source('claude-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const claude = harness.fakeNative('claude', Array.from({ length: 4 }, () => ({
        args: ['--version'], stdout: `${version} (Claude Code)\n`,
      })));
      const result = harness.run(['add', source, '--target', 'claude-code', '--dry-run', '--json'], {
        env: { OPEN_PLUGIN_CLAUDE_CODE_BIN: claude.path },
      });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(0);
      expect(report.outcomes[0]?.reason).toBe(null);
    });
  }
});

test('Claude lifecycle refuses a parsed but unevidenced release without native or ledger mutation', async () => {
  for (const version of ['0.0.1', '2.1.276', '99.0.0']) {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.claude/.keep': '' });
      const source = harness.source('claude-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const claude = harness.fakeNative('claude', Array.from({ length: 4 }, () => ({
        args: ['--version'], stdout: `${version} (Claude Code)\n`,
      })));
      const result = harness.run(['add', source, '--target', 'claude-code', '--json'], {
        env: { OPEN_PLUGIN_CLAUDE_CODE_BIN: claude.path },
      });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect({
        code: result.exitCode,
        reason: report.outcomes[0]?.reason?.code,
        storeUnchanged: JSON.stringify(result.stores['claude-code'].before) === JSON.stringify(result.stores['claude-code'].after),
        ledgerUnchanged: JSON.stringify(result.state.before) === JSON.stringify(result.state.after),
      }).toEqual({ code: 1, reason: 'capability.unverified', storeUnchanged: true, ledgerUnchanged: true });
      expect(report.outcomes[0]?.reason?.diagnostic).toContain(version);
    });
  }
});

test('a Hermes config alone cannot claim a runtime profile or mutate native state', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('hermes-profile', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
    });
    const result = harness.run(['add', source, '--target', 'hermes', '--json'], {
      env: { OPEN_PLUGIN_HERMES_BIN: '' },
    });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect({
      code: result.exitCode,
      reason: report.outcomes[0]?.reason?.code,
      storeUnchanged: JSON.stringify(result.stores.hermes.before) === JSON.stringify(result.stores.hermes.after),
      ledgerUnchanged: JSON.stringify(result.state.before) === JSON.stringify(result.state.after),
    }).toEqual({ code: 1, reason: 'capability.unverified', storeUnchanged: true, ledgerUnchanged: true });
  });
});
