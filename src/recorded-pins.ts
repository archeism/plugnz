/** Shared read-only pin resolution for a frozen Source, before any native writes. */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { which } from './exec';
import { createLifecycleReason, type LifecycleReason } from './lifecycle-report';

export function resolveRecordedPinExecutables(
  packageRoot: string,
  servers: readonly string[],
): { kind: 'ready'; pins: { server: string; executable: string }[]; dropped: string[] } | { kind: 'refused'; reason: LifecycleReason } {
  const pins: { server: string; executable: string }[] = [];
  const dropped: string[] = [];
  for (const server of servers) {
    const command = recordedPinCommand(packageRoot, server);
    if (command === null) { dropped.push(server); continue; }
    const executable = absolutePinExecutable(command);
    if (executable === null) return { kind: 'refused', reason: createLifecycleReason('runtime', 'runtime.operation-failed', `pin server '${server}' command '${command}' does not resolve`) };
    pins.push({ server, executable });
  }
  pins.sort((left, right) => left.server < right.server ? -1 : left.server > right.server ? 1 : left.executable < right.executable ? -1 : left.executable > right.executable ? 1 : 0);
  dropped.sort();
  return { kind: 'ready', pins, dropped };
}

function recordedPinCommand(packageRoot: string, server: string): string | null {
  for (const name of ['.mcp.json', 'mcp.json']) {
    const file = join(packageRoot, name);
    if (!existsSync(file)) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const definitions = (parsed as Record<string, unknown>)['mcpServers'];
    if (typeof definitions !== 'object' || definitions === null || Array.isArray(definitions)) continue;
    const definition = (definitions as Record<string, unknown>)[server];
    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) continue;
    const command = (definition as Record<string, unknown>)['command'];
    if (typeof command === 'string' && command.length > 0) return command;
  }
  return null;
}

function absolutePinExecutable(command: string): string | null {
  if (command.includes('/')) {
    if (!isAbsolute(command)) return null;
    const canonical = resolve(command);
    return canonical === command ? command : null;
  }
  const found = which(command);
  return found === null ? null : resolve(found);
}
