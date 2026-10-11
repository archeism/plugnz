#!/usr/bin/env node
// Fault injector, not a native simulator: every invocation runs released Codex.
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const args = process.argv.slice(2);
const fault = args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'upgrade';
const parent = join(process.env.CODEX_HOME,'plugins/cache/plugnz-proof/lifecycle-probe');
if (fault) chmodSync(parent,0o555);
let result;
try { result=spawnSync('/vercel/sandbox/native-tools/node_modules/.bin/codex',args,{env:process.env,stdio:'inherit'}); }
finally { if(fault) chmodSync(parent,0o755); }
process.exit(result.status ?? 125);
