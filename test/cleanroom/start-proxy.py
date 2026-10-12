#!/usr/bin/env python3
"""Start the pinned cleanroom proxy; upstream credentials never enter runner containers."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--state', type=Path, required=True, help='New private directory outside the repository')
p.add_argument('--key-file', type=Path, default=Path.home() / '.air/gemini-api-key')
p.add_argument('--network', default='plugnz-hook-cleanroom')
p.add_argument('--name', default='plugnz-live-proxy')
p.add_argument('--model', default='gemini-3.8-flash')
p.add_argument('--image', default='plugnz-hook-cleanroom-proxy:20261012')
a = p.parse_args()
state = a.state.resolve()
repo = Path(__file__).resolve().parents[2]
if state == repo or repo in state.parents:
    p.error('--state must be outside the repository')
state.mkdir(mode=0o700, parents=True, exist_ok=False)
key = a.key_file.read_text().strip()
if not key:
    p.error('The upstream key file is empty')
token = secrets.token_urlsafe(32)
config = {
    'config-version': 8,
    'server': {'host': '0.0.0.0', 'port': 8317, 'max-request-body-bytes': 2097152,
               'discovery': {'enabled': False}},
    'management': {'allow-remote': False, 'secret-key': '', 'disable-control-panel': True},
    'access': {'api-keys': [token]},
    'api-keys': {'gemini': [{
        'name': 'plugnz-gemini-cleanroom',
        'base-url': 'https://generativelanguage.googleapis.com',
        'models': [{'name': a.model, 'alias': a.model}],
        'request-retry': 0, 'keys': [{'api-key': key, 'request-retry': 0}],
    }]},
    'oauth': {'auth-dir': '/tmp/proxy-auth', 'providers': {}},
    'routing': {'retry': {'request-retry': 0, 'max-retry-credentials': 1, 'max-retry-interval': 0}},
    'requests': {'payload': {'override': [{
        'models': [{'name': a.model, 'protocol': 'gemini'}],
        'params': {'generationConfig.maxOutputTokens': 4096},
    }]}},
    'observability': {
        'logs': {'debug': False, 'logging-to-file': False, 'request-log': False, 'error-logs-max-files': 1},
        'usage': {'usage-statistics-enabled': False},
    },
    'plugins': {'enabled': False},
    'multimedia': {'disable-image-generation': True},
}
config_path = state / 'proxy.yaml'
config_path.write_text(json.dumps(config, indent=2) + '\n')
config_path.chmod(0o400)
os.chown(config_path, 1000, 1000)
env_path = state / 'live.env'
env_path.write_text(f'LIVE_PROXY_TOKEN={token}\nLIVE_PROXY_BASE=http://{a.name}:8317/v1\nLIVE_MODEL={a.model}\n')
env_path.chmod(0o600)
redacted = json.loads(json.dumps(config))
redacted['access']['api-keys'] = ['[disposable client token]']
redacted['api-keys']['gemini'][0]['keys'][0]['api-key'] = '[upstream key file]'
(state / 'proxy-config.redacted.json').write_text(json.dumps(redacted, indent=2) + '\n')
subprocess.run(['docker', 'network', 'inspect', a.network], check=True, stdout=subprocess.DEVNULL)
argv = [
    'docker', 'run', '-d', '--name', a.name, '--label', 'owner=plugnz-hook-cleanroom',
    '--init', '--network', a.network, '--dns', '1.1.1.1', '--memory', '512m', '--cpus', '1',
    '--pids-limit', '128', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,uid=1000,gid=1000',
    '--mount', f'type=bind,src={config_path},dst=/run/secrets/proxy.yaml,readonly',
    '-p', '127.0.0.1::8317', '--log-opt', 'max-size=2m', '--log-opt', 'max-file=1', a.image,
]
container = subprocess.check_output(argv, text=True).strip()
port = subprocess.check_output(['docker', 'port', a.name, '8317'], text=True).strip()
print(json.dumps({'container': container, 'name': a.name, 'loopback': port,
                  'envFile': str(env_path), 'model': a.model, 'secretValuesLogged': False}))
