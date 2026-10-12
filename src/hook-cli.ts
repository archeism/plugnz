import { buildHooks, hookAdapters } from './hook-build';

const USAGE = [
  'usage: plugnz hooks build <plugin-dir> --target <id>... --out <output-dir>',
  '       plugnz hooks targets',
  '',
  'Builds one native artifact directory at <output-dir>/<target>.',
  'The source must contain plugnz.hooks.json; source files are not changed.',
  'The output must be absent or empty and outside the source directory.',
  'Targets and build results are printed as JSON.',
].join('\n');

export function runHookCli(args: string[]): number {
  try {
    const verb = args[0];
    if (verb === '--help' || verb === '-h' || verb === 'help') {
      console.log(USAGE);
      return 0;
    }
    if (verb === 'targets') {
      if (args.length !== 1) throw new Error('targets takes no arguments');
      console.log(JSON.stringify({
        version: 1,
        targets: hookAdapters.map(({ id, baselineVersion, capabilities }) => ({ id, baselineVersion, capabilities })),
      }, null, 2));
      return 0;
    }
    if (verb !== 'build') throw new Error(USAGE);
    let source: string | undefined;
    let output: string | undefined;
    const targets: string[] = [];
    for (let index = 1; index < args.length; index++) {
      const argument = args[index]!;
      if (argument === '--target' || argument === '--out') {
        const value = args[++index];
        if (value === undefined || !value.trim() || value.startsWith('-')) throw new Error(argument + ' requires a value');
        if (argument === '--target') targets.push(value);
        else {
          if (output !== undefined) throw new Error('--out accepts one directory');
          output = value;
        }
      } else if (argument.startsWith('-')) throw new Error('Unknown hooks build option: ' + argument);
      else {
        if (source !== undefined) throw new Error('hooks build accepts one plugin directory');
        source = argument;
      }
    }
    if (source === undefined || !source.trim()) throw new Error('hooks build requires a plugin directory');
    if (output === undefined) throw new Error('hooks build requires --out');
    console.log(JSON.stringify(buildHooks(source, targets, output), null, 2));
    return 0;
  } catch (error) {
    console.error('plugnz hooks: ' + (error instanceof Error ? error.message : String(error)));
    return 2;
  }
}
