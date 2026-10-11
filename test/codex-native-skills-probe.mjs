import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = '/vercel/sandbox/codex-native-proof/native-primitive-03';
const child = spawn('/vercel/sandbox/native-tools/node_modules/.bin/codex', ['app-server'], { env: { ...process.env, HOME: `${root}/home`, CODEX_HOME: `${root}/home/.codex`, OPENAI_API_KEY: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', stderr = ''; const responses = [];
const timer = setTimeout(() => { child.kill(); throw new Error('skills/list timed out'); }, 20000);
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
child.stderr.on('data', chunk => { stderr += chunk; });
child.stdout.on('data', chunk => {
  buffer += chunk;
  let boundary;
  while ((boundary = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
    if (!line) continue;
    const message = JSON.parse(line); responses.push(message);
    if (message.id === 0) {
      assert(!message.error, line);
      send({ method: 'initialized', params: {} });
      send({ id: 1, method: 'skills/list', params: { cwds: [root], forceReload: true } });
    }
    if (message.id === 1) {
      clearTimeout(timer);
      writeFileSync(`${root}/skills-list.json`, JSON.stringify({ responses, stderr }, null, 2));
      assert(!message.error, line);
      assert(JSON.stringify(message.result).includes('lifecycle-probe'), 'installed plugin skill missing');
      console.log(JSON.stringify(message.result)); child.stdin.end(); child.kill();
    }
  }
});
send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'plugnz-native-proof', version: '1.0.0' }, capabilities: { experimentalApi: true } } });
