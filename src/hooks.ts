import { spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const HOOK_EVENTS = ['session.start', 'turn.stop', 'tool.before', 'tool.after'] as const;
export type HookEvent = typeof HOOK_EVENTS[number];
export const HOOK_CONFIG_FILE = 'plugnz.hooks.json';
export const DEFAULT_HOOK_TIMEOUT_MS = 10_000;
export const MAX_HOOK_TIMEOUT_MS = 60_000;
export const MAX_HOOK_OUTPUT_BYTES = 1_048_576;

/** Capabilities this handler may use; absence means no effect in config v2. */
export interface HookEffects { context?: boolean; continue?: boolean }
export const HOOK_EFFECTS = ['context', 'continue'] as const;

/** Shared comparison used by package admission and explicit compilation. */
export function hookEffectGap(required: HookEffects | undefined, supported: HookEffects | undefined): {
  effect: typeof HOOK_EFFECTS[number]; status: 'unsupported' | 'unverified';
} | null {
  for (const effect of HOOK_EFFECTS) {
    if (required?.[effect] !== true) continue;
    if (supported?.[effect] !== true) return { effect, status: supported?.[effect] === false ? 'unsupported' : 'unverified' };
  }
  return null;
}

export interface HookHandler {
  command: string[];
  tools?: string[];
  timeoutMs?: number;
  requires?: HookEffects;
}
export interface HookConfig {
  version: 1 | 2;
  hooks: Partial<Record<HookEvent, HookHandler[]>>;
}
export interface HookInput {
  version: 1;
  event: HookEvent;
  harness: string;
  sessionId?: string;
  cwd: string;
  reason?: string;
  tool?: { name: string; id?: string; input?: unknown; output?: unknown; isError?: boolean };
  stop?: { active: boolean };
}
export interface HookResult {
  context?: string;
  continue?: boolean;
}
export type HookCapabilities = Record<HookEvent, { nativeEvent: string; context: boolean; continue: boolean; delivery?: string }>;
export interface HookAdapter {
  id: string;
  baselineVersion: string;
  capabilities: HookCapabilities;
  /** Deliberate native metadata projection inside a caller-owned staging directory. */
  prepare?(stagingRoot: string): void;
  emit(config: HookConfig): Record<string, string>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(label + ' must be an object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown !== undefined) throw new Error(label + ': unsupported field "' + unknown + '"');
}
function text(value: unknown, label: string, nonblank = true): string {
  if (typeof value !== 'string' || value.includes('\0') || (nonblank && !value.trim())) throw new Error(label + ' must be a nonblank string without NUL');
  return value;
}
function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : text(value, label, false);
}
function isHookEvent(value: unknown): value is HookEvent {
  return typeof value === 'string' && (HOOK_EVENTS as readonly string[]).includes(value);
}

/** Validate only the portable contract; native hook JSON is a separate input format. */
export function validateHookConfig(value: unknown): HookConfig {
  const root = record(value, 'Hook configuration');
  keys(root, ['version', 'hooks'], 'Hook configuration');
  const version = root['version'];
  if (version !== 1 && version !== 2) throw new Error('Hook configuration version must be 1 or 2');
  const sourceHooks = record(root['hooks'], 'hooks');
  keys(sourceHooks, HOOK_EVENTS, 'hooks');
  const hooks: HookConfig['hooks'] = {};
  for (const event of HOOK_EVENTS) {
    const handlers = sourceHooks[event];
    if (handlers === undefined) continue;
    if (!Array.isArray(handlers)) throw new Error(event + ' handlers must be an array');
    hooks[event] = handlers.map((value, index) => {
      const label = event + '[' + index + ']';
      const handler = record(value, label);
      keys(handler, version === 1 ? ['command', 'tools', 'timeoutMs'] : ['command', 'tools', 'timeoutMs', 'requires'], label);
      let requires: HookEffects | undefined;
      if (version === 2) {
        const effects = handler['requires'] === undefined ? {} : record(handler['requires'], label + '.requires');
        keys(effects, HOOK_EFFECTS, label + '.requires');
        for (const effect of HOOK_EFFECTS) {
          if (effects[effect] !== undefined && typeof effects[effect] !== 'boolean') throw new Error(label + '.requires.' + effect + ' must be boolean');
        }
        requires = { ...effects } as HookEffects;
        if (requires.continue === true && event !== 'turn.stop') throw new Error(label + ': continue is only available at turn.stop');
        if (event === 'turn.stop' && (requires.context === true) !== (requires.continue === true)) {
          throw new Error(label + ': turn.stop requires context:true and continue:true together');
        }
      }
      const command = handler['command'];
      if (!Array.isArray(command) || command.length === 0) throw new Error(label + '.command must be a nonempty argv array');
      const argv = command.map((argument, i) => text(argument, label + '.command[' + i + ']', i === 0));
      const filter = handler['tools'];
      let tools: string[] | undefined;
      if (filter !== undefined) {
        if (event !== 'tool.before' && event !== 'tool.after') throw new Error(label + '.tools is only valid for tool events');
        if (!Array.isArray(filter)) throw new Error(label + '.tools must be an array of exact tool names');
        tools = filter.map((name, i) => text(name, label + '.tools[' + i + ']'));
      }
      const timeout = handler['timeoutMs'];
      if (timeout !== undefined && (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1 || timeout > MAX_HOOK_TIMEOUT_MS)) {
        throw new Error(label + '.timeoutMs must be an integer from 1 to ' + MAX_HOOK_TIMEOUT_MS);
      }
      return { command: argv, ...(tools === undefined ? {} : { tools }), ...(timeout === undefined ? {} : { timeoutMs: timeout as number }), ...(requires === undefined ? {} : { requires }) };
    });
  }
  return { version, hooks };
}

export function readHookConfig(pluginRoot: string): HookConfig | undefined {
  const path = join(pluginRoot, HOOK_CONFIG_FILE);
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error('Hook source symlinks are unsupported: ' + path);
  if (!stat.isFile()) throw new Error('Hook manifest must be a regular file: ' + path);
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error('Cannot read ' + HOOK_CONFIG_FILE + ': ' + (error as Error).message); }
  return validateHookConfig(value);
}

export function validateHookInput(value: unknown): HookInput {
  const input = record(value, 'Hook input');
  keys(input, ['version', 'event', 'harness', 'sessionId', 'cwd', 'reason', 'tool', 'stop'], 'Hook input');
  if (input['version'] !== 1) throw new Error('Hook input version must be 1');
  const event = input['event'];
  if (!isHookEvent(event)) throw new Error('Hook input event is unsupported');
  const harness = text(input['harness'], 'Hook input harness');
  const cwd = text(input['cwd'], 'Hook input cwd');
  if (!isAbsolute(cwd)) throw new Error('Hook input cwd must be absolute');
  const sessionId = optionalText(input['sessionId'], 'Hook input sessionId');
  const reason = optionalText(input['reason'], 'Hook input reason');
  let tool: HookInput['tool'];
  if (input['tool'] !== undefined) {
    const source = record(input['tool'], 'Hook input tool');
    keys(source, ['name', 'id', 'input', 'output', 'isError'], 'Hook input tool');
    const name = text(source['name'], 'Hook input tool.name');
    const id = optionalText(source['id'], 'Hook input tool.id');
    if (source['isError'] !== undefined && typeof source['isError'] !== 'boolean') throw new Error('Hook input tool.isError must be boolean');
    tool = {
      name, ...(id === undefined ? {} : { id }),
      ...(source['input'] === undefined ? {} : { input: source['input'] }),
      ...(source['output'] === undefined ? {} : { output: source['output'] }),
      ...(source['isError'] === undefined ? {} : { isError: source['isError'] as boolean }),
    };
  }
  if ((event === 'tool.before' || event === 'tool.after') && tool === undefined) throw new Error(event + ' requires tool.name');
  let stop: HookInput['stop'];
  if (input['stop'] !== undefined) {
    const source = record(input['stop'], 'Hook input stop');
    keys(source, ['active'], 'Hook input stop');
    if (typeof source['active'] !== 'boolean') throw new Error('Hook input stop.active must be boolean');
    stop = { active: source['active'] };
  }
  if (event === 'turn.stop' && stop === undefined) throw new Error('turn.stop requires stop.active');
  return {
    version: 1, event, harness, cwd,
    ...(sessionId === undefined ? {} : { sessionId }), ...(reason === undefined ? {} : { reason }),
    ...(tool === undefined ? {} : { tool }), ...(stop === undefined ? {} : { stop }),
  };
}

/** Stop has no passive context slot across all targets: context means an explicit continuation. */
export function validateHookResult(value: unknown, input: HookInput): HookResult {
  const result = record(value, 'Hook result');
  keys(result, ['context', 'continue'], 'Hook result');
  if (result['context'] !== undefined && typeof result['context'] !== 'string') throw new Error('Hook result context must be a string');
  if (result['continue'] !== undefined && typeof result['continue'] !== 'boolean') throw new Error('Hook result continue must be boolean');
  const context = result['context'] as string | undefined;
  const shouldContinue = result['continue'] as boolean | undefined;
  const hasContext = context !== undefined && context.trim().length > 0;
  if (shouldContinue === true) {
    if (input.event !== 'turn.stop') throw new Error('continue:true is only valid for turn.stop');
    if (!hasContext) throw new Error('turn.stop continuation requires nonblank context');
    if (input.stop?.active) throw new Error('turn.stop cannot continue while stop.active is true');
  }
  if (input.event === 'turn.stop' && hasContext && shouldContinue !== true) {
    throw new Error('turn.stop context requires continue:true; return {} to let the turn settle');
  }
  return { ...(hasContext ? { context } : {}), ...(shouldContinue === undefined ? {} : { continue: shouldContinue }) };
}

/** Commands are argv, never shell code. Every matching handler runs in declaration order. */
export async function runHooks(configValue: unknown, inputValue: unknown, pluginRoot: string): Promise<HookResult> {
  const config = validateHookConfig(configValue);
  const input = validateHookInput(inputValue);
  const root = resolve(text(pluginRoot, 'Plugin root'));
  const contexts: string[] = [];
  let requestedContinuation: boolean | undefined;
  const handlers = config.hooks[input.event] ?? [];
  for (let index = 0; index < handlers.length; index++) {
    const handler = handlers[index]!;
    if (handler.tools !== undefined && !handler.tools.includes(input.tool?.name ?? '')) continue;
    const label = input.event + '[' + index + ']';
    try {
      const stdout = await executeHandler(handler, input, root);
      let raw: unknown = {};
      if (stdout.trim()) {
        try { raw = JSON.parse(stdout); }
        catch { throw new Error('stdout must contain one JSON result object'); }
      }
      const result = validateHookResult(raw, input);
      if (config.version === 2) {
        if (result.context !== undefined && handler.requires?.context !== true) throw new Error('undeclared context effect; declare requires.context:true');
        if (result.continue === true && handler.requires?.continue !== true) throw new Error('undeclared continuation effect; declare requires.continue:true');
      }
      if (result.context !== undefined) contexts.push(result.context);
      if (result.continue !== undefined) requestedContinuation = requestedContinuation === true || result.continue;
    } catch (error) {
      throw new Error(label + ': ' + (error instanceof Error ? error.message : String(error)));
    }
  }
  return {
    ...(contexts.length === 0 ? {} : { context: contexts.join('\n\n') }),
    ...(requestedContinuation === undefined ? {} : { continue: requestedContinuation }),
  };
}

function decode(chunks: Uint8Array[]): string {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(result);
}

function executeHandler(handler: HookHandler, input: HookInput, pluginRoot: string): Promise<string> {
  const token = '$' + '{PLUGIN_ROOT}';
  const argv = handler.command.map(argument => argument.replaceAll(token, pluginRoot));
  const serialized = JSON.stringify(input) + '\n';
  const timeoutMs = handler.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  return new Promise((resolveResult, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: input.cwd, env: process.env, shell: false,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    let bytes = 0;
    let settled = false;
    let timer: unknown;
    const kill = (): void => {
      if (process.platform !== 'win32' && child.pid !== undefined) {
        try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* Child may have already exited. */ }
      }
      child.kill('SIGKILL');
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) {
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        reject(error);
      } else resolveResult(decode(stdout));
    };
    const collect = (chunks: Uint8Array[]) => (chunk: Uint8Array): void => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_HOOK_OUTPUT_BYTES) {
        kill();
        finish(new Error('handler output exceeded ' + MAX_HOOK_OUTPUT_BYTES + ' bytes'));
      } else chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.stdin.on('error', () => { /* A command may exit without consuming its input; exit status is authoritative. */ });
    child.once('error', error => finish(error));
    child.once('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        const diagnostic = decode(stderr).trim().slice(0, 4096);
        finish(new Error('handler exited ' + (signal ?? String(code)) + (diagnostic ? ': ' + diagnostic : '')));
      } else finish();
    });
    timer = setTimeout(() => {
      kill();
      finish(new Error('handler timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);
    child.stdin.end(serialized);
  });
}
