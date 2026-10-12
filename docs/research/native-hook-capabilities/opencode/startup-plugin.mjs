import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const BoundaryProbe = async () => {
  const action = process.env.PROBE_ACTION;
  const log = async (event, data = {}) => {
    const observation = {event, pid: process.pid, ...data};
    appendFileSync(process.env.PROBE_EVENTS + '.runtime', JSON.stringify(observation) + '\n');
    const response = await fetch(process.env.PROBE_OBSERVER, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify(observation),
    });
    if (!response.ok) throw new Error('Observer rejected event: ' + response.status);
  };
  await log('startup_enter');
  const startupNonce = 'OC_START_' + randomUUID();
  await log('startup_complete', {nonce: startupNonce});
  return {
    'experimental.chat.system.transform': async (input, output) => {
      await log('transform_enter', {sessionId: input.sessionID});
      const transformNonce = 'OC_TRANSFORM_' + randomUUID();
      output.system.push(startupNonce + '\n' + transformNonce);
      await log('transform_complete', {
        nonce: transformNonce, startupNonce, sessionId: input.sessionID, delivered: true,
      });
    },
    'tool.execute.before': async (input, output) => {
      await log('tool_before', {
        tool: input.tool, callId: input.callID, sessionId: input.sessionID,
        args: JSON.parse(JSON.stringify(output.args)),
      });
      if (input.tool !== 'read') return;
      if (action === 'deny') {
        const nonce = 'OC_DENIED_' + randomUUID();
        await log('denied', {nonce, callId: input.callID});
        throw new Error(nonce);
      }
      if (action === 'rewrite-replace') {
        output.args.filePath = process.env.PROBE_ALTERNATE;
        await log('args_mutated', {callId: input.callID, args: JSON.parse(JSON.stringify(output.args))});
      }
      if (action === 'rebind') {
        output.args = {...output.args, filePath: process.env.PROBE_ALTERNATE};
        await log('args_rebound', {callId: input.callID, args: JSON.parse(JSON.stringify(output.args))});
      }
    },
    'tool.execute.after': async (input, output) => {
      await log('tool_after_before_mutation', {
        tool: input.tool, callId: input.callID, sessionId: input.sessionID,
        args: input.args, output: output.output,
      });
      if (action === 'rewrite-replace' && input.tool === 'read') {
        await new Promise(resolve => setTimeout(resolve, 120));
        const nonce = 'OC_REPLACEMENT_' + randomUUID();
        output.output = nonce;
        await log('replacement', {nonce, callId: input.callID});
      }
    },
    event: async ({event}) => {
      if (['session.created','session.idle','session.error'].includes(event.type)) {
        await log(event.type, {eventId: event.id, properties: event.properties});
      }
    },
    dispose: async () => log('dispose'),
  };
};
