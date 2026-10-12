/** Native-probe setup only: emit the real compiler/runtime beside isolated fixture commands. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HookConfig } from '../src/hooks';
import { emitHooksToDirectory } from '../src/hook-build';
import { hookAdapter as omp } from '../src/hosts/omp-hooks';
import { hookAdapter as pi } from '../src/hosts/pi-hooks';

const [harness, stageArgument, mode] = process.argv.slice(2);
if ((harness !== 'omp' && harness !== 'pi') || !stageArgument || !['baseline', 'context', 'structured'].includes(mode ?? '')) {
  throw new Error('Usage: bun test/omp-hooks-native-emit.ts <omp|pi> <new-stage> <baseline|context|structured>');
}
const stage = resolve(stageArgument);
mkdirSync(stage);
const command = [process.execPath, '${PLUGIN_ROOT}/handler.mjs', '${PLUGIN_ROOT}/handler-receipts.jsonl'];
const tools = mode === 'structured' ? ['read', 'structured_probe'] : ['read'];
const config: HookConfig = { version: 1, hooks: mode === 'baseline' ? {} : {
  'session.start': [{ command }],
  'tool.before': [{ command, tools }],
  'tool.after': [{ command, tools }],
  'turn.stop': [{ command }],
} };
writeFileSync(join(stage, 'handler.mjs'), `import { readFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.version !== 1 || !['omp', 'pi'].includes(input.harness)) throw new Error('Invalid native input');
const nonce = input.event.replaceAll('.', '_').toUpperCase() + '_' + randomUUID();
const result = input.event === 'turn.stop'
  ? (input.stop.active ? {} : {context: nonce, continue: true})
  : {context: nonce};
appendFileSync(process.argv[2], JSON.stringify({pid:process.pid, time:Date.now(), input, nonce, result}) + '\\n');
process.stdout.write(JSON.stringify(result));
`);
writeFileSync(join(stage, 'observer.mjs'), `const harness = ${JSON.stringify(harness)};
const structured = ${JSON.stringify(mode === 'structured')};
export default function (pi) {
  const origin = process.env.PROBE_ORIGIN;
  const observe = async (event, data = {}) => {
    const response = await fetch(origin + '/observe', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({event,...data}), signal:AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Observer HTTP ' + response.status);
  };
  if (harness === 'omp') {
    pi.registerProvider('context-probe', {
      baseUrl:origin + '/v1', api:'openai-completions', apiKey:'FAKE_LOCAL_ONLY',
      models:[{id:'probe-model',name:'Synthetic context probe',api:'openai-completions',
        reasoning:false,input:['text'],contextWindow:32768,maxTokens:512,
        cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}],
    });
  }
  if (structured) {
    pi.registerTool({
      name:'structured_probe', label:'Structured fixture', description:'Return fixed test data',
      parameters:{type:'object',properties:{},additionalProperties:false},
      outputSchema:{type:'object',properties:{fixture:{type:'string'}},required:['fixture'],additionalProperties:false},
      async execute() {
        return {
          content:[{type:'text',text:process.env.PROBE_STRUCTURED}],
          structuredContent:{fixture:process.env.PROBE_STRUCTURED},
          details:{fixture:process.env.PROBE_STRUCTURED},
        };
      },
    });
  }
  pi.on('session_start', async (_event, ctx) => {
    await observe('session_start', {sessionId:ctx.sessionManager.getSessionId()});
  });
  pi.on('tool_call', async event => {
    await observe('tool_call', {toolName:event.toolName,toolCallId:event.toolCallId,input:event.input});
  });
  pi.on('tool_result', async event => {
    await observe('tool_result_original', {toolName:event.toolName,toolCallId:event.toolCallId,
      input:event.input,content:event.content,details:event.details,
      structuredContent:event.structuredContent,isError:event.isError});
  });
  for (const type of ['tool_execution_start','tool_execution_end','agent_start','agent_end','session_shutdown']) {
    pi.on(type, async event => {
      await observe(type, {toolName:event.toolName,toolCallId:event.toolCallId,
        result:type === 'tool_execution_end' ? event.result : undefined, isError:event.isError});
    });
  }
  if (harness === 'omp') pi.on('session_stop', async event => {
    await observe('session_stop', {active:event.stop_hook_active,turnId:event.turn_id,sessionId:event.session_id});
  });
  if (harness === 'pi') pi.on('agent_before_settle', async event => {
    await observe('agent_before_settle', {outcome:event.outcome,continue:event.continue});
  });
}
`);
writeFileSync(join(stage, 'portable-config.json'), JSON.stringify(config, null, 2) + '\n');
const files = emitHooksToDirectory(harness === 'omp' ? omp : pi, config, stage);
console.log(JSON.stringify({ harness, mode, stage, files }));
