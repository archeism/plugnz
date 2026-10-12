# plugnz

Open-source installer **and doctor** for agent plugins (Agent Plugins / OpenPlugin spec 1.0.0) and MCP configs — Claude Code, Codex, Cursor, Kimi, and more.

```
npx plugnz add <plugin-dir-or-marketplace-or-git-url>  # native plugin stores
npx plugnz doctor                          # dead commands, shadowed entries, stale installs
npx plugnz pin                             # absolute command paths for GUI hosts
npx plugnz update                          # re-add from the recorded source, re-pin
npx plugnz sync --manifest desired.json    # converge complete Desired sets; retire owned orphans
npx plugnz scopes --json                   # inspect recorded sources, scopes and retained history
```

`pin` rewrites a plugin's bare stdio `command` to the absolute path it resolves
to right now — a macOS GUI host like Cursor starts with no shell PATH, so a
spec-valid bare `command` never launches there. `update` is an idempotent
re-`add` from the source recorded in `state.json`, plus the pins that install
carried. Both refuse rather than guess, and neither will touch a plugin this
tool did not install. Details: `docs/pin-and-update.md`.

**Portable context hooks:** `plugnz hooks build <plugin-dir> --target <host> --out <dir>` compiles session-start, stop, and pre/post-tool handlers for Claude Code, Codex, OMP, Pi v1, OpenCode, and ZCode. Handlers receive normalized JSON and return context; native adapters expose their delivery and continuation limits through `plugnz hooks targets`. See [the contract, usage, and native map](docs/hooks.md).

Why another tool: `npx plugins` is closed-source and its Cursor target does not install into Cursor; nothing in the ecosystem checks that an installed plugin still *works*. See `docs/research/`.

The published CLI runs under Node.js 22 or newer; `npx` needs npm, not Bun. `bunx` also works. Bun is used for development and building. `add` accepts a local plugin or marketplace directory as well as a Git URL. Native plugin targets currently include Claude Code, Codex, Kimi, Cursor, OMP, Hermes, Grok, DCode, and ZCode CLI. Run `plugnz targets --all` to see supported and unsupported capabilities for each host; standalone skill distribution is outside this CLI's scope.

`sync` tracks each Source and its complete Desired plugin set per host. It retires
owned plugins omitted from that set while retaining plugin data, inactive metadata
and lifecycle history. A missing or invalid Source is an error, never permission
to prune. Use an explicit `retire-source` manifest entry when the Source itself
is gone. See [the batch manifest](docs/sync-manifest.md).

General sync/update/retirement is supported. Interrupted legacy installs needing
the unfinished fenced adoption transaction are refused loudly without writes;
successful legacy migration and stronger cross-process exclusion are follow-up
refinements, not delivered guarantees.

Published on npm as `plugnz`; source repository: `archeism/plugnz`.

Maintainers: see [publishing instructions](docs/publishing.md). Pushes to `main`
automatically publish the next patch after local verification.
