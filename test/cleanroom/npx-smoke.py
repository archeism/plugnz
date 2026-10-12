#!/usr/bin/env python3
"""Exercise the npm tarball and default-source install command without inference."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--candidate-commit', required=True)
p.add_argument('--tarball', type=Path, default=Path('/opt/plugnz-candidate.tgz'))
p.add_argument('--out', type=Path, default=Path('/evidence'))
a = p.parse_args()
if not Path('/.dockerenv').exists() or os.getuid() != 1000:
    p.error('Run in a fresh disposable container as UID 1000')
home = Path('/work/home')
if home.exists() and any(home.iterdir()):
    p.error('HOME must be fresh')
home.mkdir(parents=True, exist_ok=True)
home_empty_before_install = not any(home.iterdir())
source = Path('/work/fixture')
source.mkdir()
(source / 'plugin.json').write_text(json.dumps({'name': 'npx-context-proof', 'version': '1.0.0', 'description': 'Public npx entrypoint proof'}))
(source / 'plugnz.hooks.json').write_text(json.dumps({'version': 1, 'hooks': {'session.start': [{'command': ['node', '${PLUGIN_ROOT}/context.mjs']}]}}))
(source / 'context.mjs').write_text('import {writeFileSync} from "node:fs"; writeFileSync("/work/handler-invoked", "unexpected"); console.log(JSON.stringify({context:"npx hook context"}));')
def hashes():
    return {x.name: hashlib.sha256(x.read_bytes()).hexdigest() for x in source.iterdir()}
before = hashes()
env = {k: v for k, v in os.environ.items() if k in ['PATH', 'LANG']}
env.update(HOME=str(home), OPEN_PLUGIN_HOME=str(home), PI_CODING_AGENT_DIR=str(home / '.pi/agent'), PI_OFFLINE='1', NO_COLOR='1', NODE_DISABLE_COMPILE_CACHE='1')
argv = ['npx', '--offline', '--yes', '--package', str(a.tarball), 'plugnz', 'install', '--target', 'pi', '--json']
r = subprocess.run(argv, cwd=source, env=env, text=True, capture_output=True, timeout=90)
(a.out / 'npx.stdout').write_text(r.stdout)
(a.out / 'npx.stderr').write_text(r.stderr)
settings = home / '.pi/agent/settings.json'
config = json.loads(settings.read_text()) if settings.exists() else {}
entries = config.get('extensions', [])
checks = {'home_empty_before_install': home_empty_before_install, 'npx_exit_zero': r.returncode == 0, 'default_source_installed': r.returncode == 0 and len(entries) == 1 and (Path(entries[0]).parent / 'context.mjs').is_file() and (Path(entries[0]).parent / 'context.mjs').read_bytes() == (source / 'context.mjs').read_bytes(), 'authored_source_preserved': before == hashes(), 'native_extension_exists': len(entries) == 1 and Path(entries[0]).is_file(), 'handler_not_executed_during_install': not Path('/work/handler-invoked').exists()}
report = {'status': 'passed' if all(checks.values()) else 'failed', 'candidate_commit': a.candidate_commit, 'candidate_tar_sha256': hashlib.sha256(a.tarball.read_bytes()).hexdigest(), 'helper_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'argv': argv, 'cwd': str(source), 'checks': checks, 'native_settings': config, 'authored_hashes': before, 'inference_requests': 0, 'native_profile_scaffolded': False, 'exit_code': r.returncode}
(a.out / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
raise SystemExit(0 if all(checks.values()) else 1)
