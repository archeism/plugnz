# Publishing plugnz

Set up npm Trusted Publishing for the `plugnz` package with these exact GitHub Actions fields: repository owner `archeism`, repository name `plugnz`, workflow filename `publish.yml`, and no environment. In **Allowed actions**, enable direct **`npm publish`**; newly created connections default to staging permission only. See [npm Trusted Publishing setup](https://docs.npmjs.com/trusted-publishers/).

The workflow uses GitHub's OIDC identity; no npm token or repository secret is needed. GitHub-hosted Actions runners are free for public repositories.

For the normal release path, run the local tests and checks and inspect `bun run build && npm pack --dry-run --ignore-scripts` before pushing reviewed changes to `main`. The push authorizes the next patch release: the workflow waits for the same commit's Tests run, then owns the version bump, build, publication, and tag. Do not hand-edit the release version. The packed artifact requires `dist/` to exist.

The published package ships `dist/plugnz.mjs` — one plain-JavaScript ESM bundle with a `node` shebang — so `npx plugnz` works on any machine with Node >= 22 and `bunx plugnz` keeps working. Bun remains the build and development toolchain only: the workflow installs with Bun, builds with `bun run build` (scripts/build.mjs, `--target=node`), and smoke-checks the bundle under plain Node before publishing. Never commit `dist/`; the artifact exists only inside the publish run.

## Automated releases (merge = publish) — early-stage velocity policy

**This supersedes the manual-dispatch-only release rule (owner decision,
2026-10-10).** Every push to `main` publishes the next `0.0.x` patch
automatically: build -> registry check (loop guard) -> patch bump ->
Trusted Publishing publish -> `v<version>` tag -> bump commit back with
`[skip ci]`. Two guards make the loop safe: the release-bot's own bump
commits are recognized by their `chore(release): v` subject and skip, and
any re-run that would re-publish an existing version skips via the
registry check. Manual dispatch is a deliberate operator override: it
skips the same-SHA Tests gate and can target a ref without a successful
push test run. Before dispatching, independently verify the exact selected
commit and intended version; dispatch itself provides no test evidence. Manual dispatch (version must
match `package.json`) remains for exact-version releases. Never hand-edit
`package.json`'s version on main; the release-bot owns it. When the
project outgrows this, move to tag-triggered releases before reinstating
any manual gate.

## Name guard (pluginz)

`guards/pluginz` reserves the alternate spelling. Its release workflow is
`publish-guards.yml`; the actual `plugnz` package is published from the root
through `publish.yml`.

## Rename compatibility

The previous `plgnz` executable remains an alias. Existing `.open-plugin` state,
`.plgnz` ownership markers and host-managed directories retain their names so
installed plugins continue to be recognized. `plugnz` is the public package,
repository and preferred command name.

<!-- verified: auto-publish fires on the next push after the trigger commit -->
