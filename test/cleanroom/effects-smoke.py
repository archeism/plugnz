#!/usr/bin/env python3
"""Credential-free public-package checks for v2 admission, reporting and known regressions."""
import argparse, hashlib, json, os, pathlib, subprocess
P = pathlib.Path
parser = argparse.ArgumentParser()
parser.add_argument('--tarball', type=P, required=True)
parser.add_argument('--out', type=P, default=P('/evidence'))
a = parser.parse_args()
if not P('/.dockerenv').exists() or os.getuid() != 1000:
    raise SystemExit('Run in a disposable UID-1000 Docker container')
a.out.mkdir(parents=True, exist_ok=True)
home = P('/work/home'); source = P('/work/source')
if home.exists() and any(home.iterdir()): raise SystemExit('HOME must start empty')
home.mkdir(parents=True, exist_ok=True); source.mkdir()
expected = ['claude-code', 'codex', 'omp', 'pi', 'opencode']
env = {'HOME': str(home), 'PATH': ':'.join('/opt/harnesses/'+h+'/node_modules/.bin' for h in expected)+':/usr/local/bin:/usr/bin:/bin',
       'npm_config_cache': '/work/npm-cache', 'XDG_CONFIG_HOME': str(home/'.config'),
       'XDG_CACHE_HOME': str(home/'.cache'), 'XDG_DATA_HOME': str(home/'.local/share'),
       'XDG_STATE_HOME': str(home/'.local/state'), 'NODE_DISABLE_COMPILE_CACHE': '1', 'LANG': 'C.UTF-8'}
checks = {}; invocations = []
def check(name, value):
    checks[name] = bool(value)
    if not value: raise AssertionError(name)
def hashes(path):
    return {str(p.relative_to(path)): hashlib.sha256(p.read_bytes()).hexdigest() for p in path.rglob('*') if p.is_file()}
def run(args, expected_code=0, parse=True):
    command = ['npx', '--offline', '--yes', '--package', str(a.tarball), 'plugnz', *args]
    p = subprocess.run(command, cwd=source, env=env, capture_output=True, text=True, timeout=60)
    n = len(invocations); (a.out/f'command-{n}.stdout').write_text(p.stdout); (a.out/f'command-{n}.stderr').write_text(p.stderr)
    invocations.append({'argv': command, 'exit': p.returncode})
    check('exit-'+str(n), p.returncode == expected_code)
    return json.loads(p.stdout) if parse else p

def declaration(event, requires):
    (source/'plugnz.hooks.json').write_text(json.dumps({'version':2,'hooks':{event:[{'command':['node','${PLUGIN_ROOT}/context.mjs'],'requires':requires}]}}))
(source/'plugin.json').write_text(json.dumps({'name':'effects-proof','version':'1.0.0','description':'Owned public-package conformance fixture'}))
handler = 'import {writeFileSync} from "node:fs"; writeFileSync("/work/handler-ran", "unexpected"); console.log(JSON.stringify({context:"first"}));\n'
(source/'context.mjs').write_text(handler)
declaration('session.start', {'context':True})
record = {'tarball_sha256':hashlib.sha256(a.tarball.read_bytes()).hexdigest(),'network':'none','paid_model_calls':0,'uid':os.getuid(),'checks':checks,'invocations':invocations}
try:
    before = hashes(source)
    version = run(['--version','--json'])
    record['version'] = version
    inventory = run(['hooks','targets'])
    check('config-versions', inventory['configVersions'] == [1,2])
    check('empty-native-profiles', not any((home/x).exists() for x in ['.claude','.codex','.omp','.pi','.config/opencode']))
    dry = run(['install','--dry-run','--json'])
    check('dry-admitted-all-five', sorted(x['scope']['target']['kind'] for x in dry['outcomes'] if x['result']=='succeeded') == sorted(expected))
    check('dry-facts', all(x['compatibility']=='admitted' and x['registration']=='not-checked' and x['executionApproval']=='not-checked' and x['delivery']=='not-observed' for x in dry['verification']['operations']))
    # Real version queries create Codex launch helpers and empty OpenCode
    # directories. They must not activate plugins or create user configuration.
    record['dry_version_probe_files'] = sorted(str(p.relative_to(home)) for p in home.rglob('*') if p.is_file())
    check('dry-no-active-registration', not any((home/x).exists() for x in [
        '.claude/plugins/installed_plugins.json', '.claude/settings.json', '.codex/config.toml',
        '.omp/plugins/installed_plugins.json', '.pi/agent/settings.json', '.config/opencode/plugins']))
    applied = run(['install','--json'])
    check('auto-installed-all-five', sorted(x['scope']['target']['kind'] for x in applied['outcomes'] if x['result']=='succeeded') == sorted(expected))
    check('registration-not-runtime-proof', all(x['registration']=='verified' and x['executionApproval']=='not-checked' and x['delivery']=='not-observed' for x in applied['verification']['operations']))
    check('authored-bytes-preserved', hashes(source)==before)
    settings=home/'.pi/agent/settings.json'; doc=json.loads(settings.read_text()); entry=doc['extensions'][0]
    doc['extensions']=['/other/before.mjs',entry,'/other/after.mjs'];raw=json.dumps(doc,indent='\t')+'\n\n';settings.write_text(raw)
    (source/'context.mjs').write_text(handler.replace('first','updated'))
    run(['update','effects-proof','--target','pi','--json'])
    check('pi-update-preserves-settings-bytes', settings.read_text()==raw)
    check('pi-updated-actual-package', 'updated' in (P(entry).parent/'context.mjs').read_text())
    oc=home/'.config/opencode'; prior=hashes(oc)
    declaration('turn.stop',{'context':True,'continue':True})
    partial=run(['install','--target','codex','--target','opencode','--json'],1)
    check('partial-result-preserved', partial['summary']['changed'] and partial['summary']['mutationStarted'])
    check('codex-stop-admitted', any(x['scope']['target']['kind']=='codex' and x['result']=='succeeded' for x in partial['outcomes']))
    check('opencode-refusal-explicit', any(x['scope']['target']['kind']=='opencode' and x['reason']['code']=='capability.unsupported' for x in partial['outcomes']))
    check('opencode-prior-bytes-preserved', hashes(oc)==prior)
    check('no-handler-execution-during-lifecycle', not P('/work/handler-ran').exists())
    manifest=source/'plugnz.hooks.json'; external=P('/work/external.json');external.write_bytes(manifest.read_bytes());manifest.unlink();manifest.symlink_to(external)
    result=run(['hooks','build',str(source),'--target','pi','--out','/work/refused-build'],2,False)
    check('manifest-symlink-refused', 'symlinks are unsupported' in result.stderr)
    check('no-output-on-manifest-refusal', not P('/work/refused-build').exists())
    record['status']='passed'
except Exception as error:
    record['status']='failed';record['error']=str(error)
finally:
    (a.out/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))
raise SystemExit(0 if record['status']=='passed' else 1)
