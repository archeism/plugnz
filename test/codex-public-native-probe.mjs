import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = '/vercel/sandbox/codex-native-proof/public-01';
const native = '/vercel/sandbox/native-tools/node_modules/.bin/codex';
const url = 'https://github.com/archeism/plugnz.git';
const source = `${url}#finish/codex-native-proof`;
const phase = process.argv[2], revision = process.argv[3];
assert(['bootstrap', 'upgrade'].includes(phase)); assert(/^[0-9a-f]{40}$/.test(revision));
const home = join(root, 'home'), codexHome = join(home, '.codex');
const env = { ...process.env, HOME: home, CODEX_HOME: codexHome, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_CODEX_HOME: codexHome, OPEN_PLUGIN_CODEX_BIN: native, OPENAI_API_KEY: '' };
const streamsPath = join(root, 'streams.json');
const streams = existsSync(streamsPath) ? JSON.parse(readFileSync(streamsPath, 'utf8')) : [];
function command(label, exe, args) {
  const start = Date.now(); const result = spawnSync(exe, args, { env, cwd: root, encoding: 'utf8', timeout: 150000, maxBuffer: 2 * 1024 * 1024 });
  streams.push({label, args, status: result.status, stdout: result.stdout, stderr: result.stderr, elapsedMs: Date.now()-start});
  writeFileSync(streamsPath, JSON.stringify(streams, null, 2));
  assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`); return result;
}
if (phase === 'bootstrap') {
  assert(!existsSync(root)); mkdirSync(codexHome, { recursive: true });
  command('native-marketplace-config', native, ['plugin','marketplace','add',url,'--ref',revision,'--json']);
} else {
  const configPath = join(codexHome, 'config.toml');
  const config = readFileSync(configPath, 'utf8'); assert(/ref = "[0-9a-f]{40}"/.test(config));
  writeFileSync(configPath, config.replace(/ref = "[0-9a-f]{40}"/, `ref = "${revision}"`));
}
const report = JSON.parse(command(`public-${phase}`, 'node', ['/vercel/sandbox/plugnz-candidate.mjs','sync',source,'--target','codex','--json']).stdout);
writeFileSync(join(root, `${phase}-report.json`), JSON.stringify(report,null,2));
assert.equal(report.summary.result,'converged');
assert.equal(report.outcomes[0].route, phase === 'bootstrap' ? 'managed' : 'native');
assert.equal(report.outcomes[0].activationState,'active-conforming');
const slot = join(codexHome,'plugins/cache/plugnz-proof/lifecycle-probe/0.1.0');
assert(readFileSync(join(slot,'skills/probe/SKILL.md'),'utf8').includes(phase === 'bootstrap' ? 'V1.' : 'V2, unchanged declared version.'));
if (phase === 'upgrade') assert.equal(command('checkout-exact-sha','git',['-C',join(codexHome,'.tmp/marketplaces/plugnz-proof'),'rev-parse','HEAD']).stdout.trim(),revision);
console.log(JSON.stringify({phase, revision, outcome:report.outcomes[0], summary:report.summary}));
