// Fresh homes in the same disposable Sandbox; retain the prior failed trial.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const root = '/vercel/sandbox/codex-permissions-proof';
assert(!existsSync(root));
mkdirSync(root);
// Keep the original pre-supplier baseline: do not reset the growth allowance.
cpSync('/vercel/sandbox/codex-final-proof/baseline-disk.json', `${root}/baseline-disk.json`);
console.log('Fresh proof root prepared; previous stores untouched');
