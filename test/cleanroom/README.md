# Real-model hook cleanroom

These opt-in probes install an authored portable hook package through the public `plugnz install` command, launch the actual native harness, and forward its model requests to Gemini through CLIProxyAPI. They incur real model usage and are separate from `bun test`.

Each run starts with an empty home directory. Hook handlers mint random markers only when a native event fires. The initial user prompt contains none of those markers. The probe verifies their delivery in model requests and their use in the model's answer, together with a file read through the native tool. Stop-capable adapters must request one continuation and then settle. OpenCode instead verifies its asynchronous stop check.

## Images and pinned inputs

| Input | Pin |
| --- | --- |
| Base | Node 24.21.0 Bookworm slim, digest in `Dockerfile.base` |
| Bun | 1.4.3 |
| CLIProxyAPI | v8.0.26, release archive SHA256 in `Dockerfile.proxy` |
| Claude Code | `@anthropic-ai/claude-code@2.1.285` |
| Codex | `@openai/codex@0.161.0` |
| OMP | `@oh-my-pi/pi-coding-agent@18.8.7` |
| Pi | `@earendil-works/pi-coding-agent@1.1.0` |
| OpenCode | `opencode-ai@1.19.0` |
| ZCode CLI | Official source revision pinned in `Dockerfile.zcode`; expected CLI 0.16.9 |

The five npm-distributed harnesses are acquired inside the image. ZCode uses an exact archive of its official committed source and official SEA packaging, with source revision and runtime version retained. Its dependencies and binary are built inside Docker. The recorded run used an existing verified Git checkout after fresh network retrieval timed out; no checkout files, dependencies, or installed runtime were copied into the image. The candidate plugnz tarball replaces the bootstrap release in the runner image.

Build from the repository root. Choose a fresh working directory outside the checkout; these commands assume a Linux Docker host with permission to assign files to container UID 1000.

```sh
export HOOK_CLEANROOM_DIR="$(mktemp -d /tmp/plugnz-live-hooks.XXXXXXXX)"
docker build --network=host -f test/cleanroom/Dockerfile.base -t plugnz-hook-cleanroom-base:20261012 .
docker build --network=host -f test/cleanroom/Dockerfile.proxy -t plugnz-hook-cleanroom-proxy:20261012 .
docker build --network=host -f test/cleanroom/Dockerfile.harnesses -t plugnz-hook-cleanroom-harnesses:20261012 .
```

`--network=host` is used only for dependency acquisition during image builds on the tested Docker/VPN host. Runtime containers use a dedicated bridge network. No host home directory, installed harness binary, or original repository is mounted into a runner.

## Build the official ZCode CLI

Point `HOOK_ZCODE_REPO` at a verified clone of [the official repository](https://github.com/zai-org/ZCode) containing commit `aac4755666d09fdcd70272fcf063c077a639015f`. The helper reads that commit with `git archive`; it does not package the working tree. It verifies the embedded Git PAX commit and records the archive hash.

```sh
python3 test/cleanroom/prepare-zcode-source.py \
  --repo "$HOOK_ZCODE_REPO" --out "$HOOK_CLEANROOM_DIR/zcode-source"
docker build --network=host \
  -f "$PWD/test/cleanroom/Dockerfile.zcode" \
  -t plugnz-hook-cleanroom-zcode:20261012 "$HOOK_CLEANROOM_DIR/zcode-source"
```

The pinned source has nested build-tool boundaries, so the verified recipe installs its locked dependencies at the repository root, runs the selected packages' own build scripts in dependency order, compiles the shared package with its authored `tsconfig`, and invokes the official SEA script. The recipe does not patch source, manifests, or the archive. The resulting CLI must report `0.16.9` before the image build succeeds.

## Start the conversion proxy

```sh
docker network create plugnz-hook-cleanroom
python3 test/cleanroom/start-proxy.py \
  --state "$HOOK_CLEANROOM_DIR/private" \
  --key-file "$HOME/.air/gemini-api-key"
```

The helper reads the existing upstream key without printing it. Only the proxy receives that key through a private read-only config mount. Runner containers receive a disposable frontend token via the generated `live.env`. The proxy disables management, discovery, plugins, request logging, and provider retries; its Gemini output cap is 4096 tokens per response. This allowance includes Gemini reasoning tokens; the retained earlier 2048-token Pi attempt exhausted its budget before completing the visible answer. Its published port binds only to loopback.

The helper prints the proxy container ID, loopback address, environment-file path, and model name. The redacted configuration is safe to retain; `proxy.yaml` and `live.env` are private runtime files and must stay outside the repository and evidence archives.

## Stage the candidate

Build and pack the intended source revision using the repository's build command and `npm pack --ignore-scripts`. Record the exact commit and tarball SHA256. Set `HOOK_CANDIDATE_TGZ` to that absolute tarball path and `HOOK_CANDIDATE_COMMIT` to the source commit.

```sh
mkdir -p "$HOOK_CLEANROOM_DIR/build/test/cleanroom"
cp "$HOOK_CANDIDATE_TGZ" "$HOOK_CLEANROOM_DIR/build/plugnz-candidate.tgz"
cp test/cleanroom/Dockerfile.runner "$HOOK_CLEANROOM_DIR/build/Dockerfile"
cp test/live-extension-cleanroom.py "$HOOK_CLEANROOM_DIR/build/test/"
cp test/cleanroom/*.py "$HOOK_CLEANROOM_DIR/build/test/cleanroom/"
docker build --network=none -t plugnz-hook-cleanroom-runner:local "$HOOK_CLEANROOM_DIR/build"
```

For ZCode, build the same staged context with `--build-arg BASE_IMAGE=plugnz-hook-cleanroom-zcode:20261012` and a separate runner tag. The staged image contains the candidate tarball's contents and probe code. Credentials are supplied only when the final container is launched.

## Exercise the public npx entry point without inference

The runner retains the exact candidate tarball at `/opt/plugnz-candidate.tgz`. This smoke test creates a portable package, runs `npx` from that package without a source argument, and checks an empty pre-install home, native Pi registration, preserved source bytes, and that installation did not execute the handler. It does not create a native profile directory before installation. It needs no proxy token or network.

```sh
mkdir -p "$HOOK_CLEANROOM_DIR/npx"
chown 1000:1000 "$HOOK_CLEANROOM_DIR/npx"
docker run --name plugnz-live-npx --init --user 1000:1000 \
  --network none --memory 4g --cpus 2 --pids-limit 256 \
  --cap-drop ALL --security-opt no-new-privileges --read-only \
  --tmpfs /work:rw,exec,nosuid,nodev,size=512m,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,uid=1000,gid=1000 \
  --mount "type=bind,src=$HOOK_CLEANROOM_DIR/npx,dst=/evidence" \
  plugnz-hook-cleanroom-runner:local \
  python3 /app/test/cleanroom/npx-smoke.py \
  --candidate-commit "$HOOK_CANDIDATE_COMMIT"
```

The actual invocation is `npx --offline --yes --package /opt/plugnz-candidate.tgz plugnz install --target pi --json`. Testing the local tarball avoids confusing an unpublished candidate with the current registry release. The owned `/work` tmpfs needs `exec` because npm launches the package executable from its cache there; Docker's default tmpfs is otherwise `noexec`.

## Run an extension harness

This example runs Pi. Substitute `omp` or `opencode` in the harness, runtime, evidence directory, and container name for the other extension adapters.

```sh
mkdir -p "$HOOK_CLEANROOM_DIR/pi"
chown 1000:1000 "$HOOK_CLEANROOM_DIR/pi"
docker run --name plugnz-live-pi --init --user 1000:1000 \
  --network plugnz-hook-cleanroom --dns 1.1.1.1 \
  --memory 4g --cpus 2 --pids-limit 256 \
  --cap-drop ALL --security-opt no-new-privileges --read-only \
  --tmpfs /work:rw,exec,nosuid,nodev,size=512m,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,uid=1000,gid=1000 \
  --mount "type=bind,src=$HOOK_CLEANROOM_DIR/pi,dst=/evidence" \
  --env-file "$HOOK_CLEANROOM_DIR/private/live.env" \
  plugnz-hook-cleanroom-runner:local \
  python3 /app/test/live-extension-cleanroom.py \
  --harness pi --repo /opt/plugnz/package --runtime /opt/harnesses/pi \
  --out /evidence/attempt01 --candidate-commit "$HOOK_CANDIDATE_COMMIT" \
  --proxy-base http://plugnz-live-proxy:8317/v1 --model gemini-3.8-flash \
  --max-output-tokens 4096 \
  --install-argv-json '["node","/opt/plugnz/package/dist/plugnz.mjs","install","{source}","--target","{harness}","--json"]'
```

The helper configures only the model provider. Hook loading comes from the installed native registration: OMP plugins, Pi's extension settings, and OpenCode's local plugin loader. There is no manual hook extension argument in these runs. OMP uses a separate provider-only extension to register its test model.

## Command-hook harnesses

Use the same fresh-container flags and an empty evidence directory, with the helper `/app/test/cleanroom/command_live.py` and harness `claude-code`, `codex`, or `zcode-cli`. Run `--help` for its required candidate identity arguments. Use the separate ZCode runner image for that target.

The command-hook helper records native lifecycle events, model protocol requests and responses without authentication headers, random hook markers, and an inotify witness of the actual file read. Native project and hook trust rules still apply. A rejected native trust decision is a blocked result, not a successful context-delivery result.

For Codex, add `--codex-review` to the helper and keep Docker's stdin attached with `-i` (`-it` from an interactive terminal). Do not consume that stdin with a Python here-document. The helper opens the ordinary Codex UI in the disposable project before sending the model task. Review the owned `/work/project` folder and the installed fixture's four exact hook definitions individually. Verify the fixture identity, generated wrapper command, and six-second native timeout before approving each definition; do not use the table's blanket trust action.

The helper relays the observed UI and supplied keyboard input; it does not create trust hashes, select approval choices, or automatically close the UI. After approving each definition, verify that all four definitions are active and that the native approval state has been persisted. Then terminate only the owned setup UI process, without submitting a quit command as a model prompt. The helper refuses to start the model task without all four individual native trust confirmations. Native UI setup has a separate 600-second bound. The subsequent model run still has its 180-second/six-request bound.

The Codex fixture uses the Responses API with `web_search = "disabled"`, so the model sees function tools for the read task. The retained default-web-search attempt was rejected by Gemini for combining built-in search with function calling. This test does not establish compatibility for that combination.

### Codex's nested read-only sandbox in Docker

On the tested Docker 26.1.5 Linux host, the default container seccomp/AppArmor combination prevented Codex's native sandbox from creating its nested namespace. A credential-free probe first verified native reads and a denied write with a container-specific policy. Codex's read-only policy remains enabled.

The following inspection uses a fresh, credential-free container and extracts only its seccomp baseline. Access to that owned container's runtime metadata is required. The containerd metadata path shown is the one verified on the test host; other Docker installations may use a different path.

```sh
python3 - "$HOOK_CLEANROOM_DIR/codex-baseline.json" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

cid = subprocess.check_output([
    "docker", "run", "-d", "--rm", "--name", "plugnz-seccomp-inspect",
    "--user", "1000:1000", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--network", "none",
    "--memory", "128m", "--pids-limit", "16",
    "plugnz-hook-cleanroom-runner:local", "sleep", "45",
], text=True).strip()
try:
    config_path = Path("/run/containerd/io.containerd.runtime.v2.task/moby") / cid / "config.json"
    config = json.loads(config_path.read_text())
    Path(sys.argv[1]).write_text(json.dumps(config["linux"]["seccomp"], indent=2) + "\n")
finally:
    subprocess.run(["docker", "rm", "-f", cid], stdout=subprocess.DEVNULL, check=False)
PY
python3 test/cleanroom/prepare-codex-seccomp.py \
  --base-profile "$HOOK_CLEANROOM_DIR/codex-baseline.json" \
  --output "$HOOK_CLEANROOM_DIR/codex-nested-seccomp.json"
```

The transform retains the restrictive default action and existing rules, adds the scoped nested-namespace operations, and records input/output hashes and its changes. For this Codex container, add these two options to the normal bounded runner flags:

```sh
--security-opt "seccomp=$HOOK_CLEANROOM_DIR/codex-nested-seccomp.json"
--security-opt apparmor=unconfined
```

These options apply only to that disposable container. The tested run retains UID 1000, zero capabilities, no-new-privileges, a read-only outer root, and Codex's native read-only sandbox. The probe does not change host AppArmor profiles, daemon configuration, or sysctls. Check the native sandbox without a model before paying for a case:

```sh
codex -c 'sandbox_mode="read-only"' sandbox -- cat /work/harmless.txt
```

Run that command inside the prepared container with an owned fixture. The evidence also includes a write attempt denied by the native policy.

## Bounds, evidence, and cleanup

A case allows at most six inference requests, three minutes for its bounded model run, 32 MiB of retained evidence, 4 GiB of container memory, two CPUs, and 256 processes. Its home and project live on a 512 MiB tmpfs. The forwarding layer passes through live upstream responses; it does not supply generated fixtures as model completions. Request and response bodies are bounded and retained separately from native stdout and stderr.

Retain the receipt, invocation, candidate hashes, native registration, authored fixture hashes, and request/response transcripts in the private run directory. Before committing or sharing evidence, select fields that contain no credentials, opaque provider reasoning signatures, or full native system prompts. The checked-in report uses a small allowlisted receipt bundle. Failed attempts remain failed evidence when a defect is fixed and a new fresh case is run. Logs demonstrate the exact tested versions and configuration; they do not establish every harness mode, version, tool, failure path, or subagent behavior.

After collecting evidence, remove only containers and the network created for this run, then delete generated private runtime files. For the example above:

```sh
docker rm -f plugnz-live-pi plugnz-live-npx plugnz-live-proxy
docker network rm plugnz-hook-cleanroom
rm -rf "$HOOK_CLEANROOM_DIR/private"
```

The original upstream key file is never changed. Images and redacted run evidence can be retained for reproduction.


## Version-2 admission and regression smoke (no inference)

`effects-smoke.py` exercises the public npm tarball via offline `npx` in the same five-harness image. Mount the tarball at `/input/plugnz.tgz`, this helper at `/input/effects-smoke.py`, and an owned writable evidence directory at `/evidence`. Reuse the UID-1000, read-only-root, capability-drop, writable `/work` and `/tmp` tmpfs flags above, with `--network none`:

```sh
python3 /input/effects-smoke.py --tarball /input/plugnz.tgz --out /evidence
```

It covers version-2 automatic target selection, required startup context, dry-run versus installed evidence, Pi settings order/byte preservation on update, mixed Codex success/OpenCode Stop-effect refusal, prior OpenCode preservation, no handler execution during installation, and manifest-symlink refusal. The native version queries may create native housekeeping/cache paths; the dry-run assertion checks active registration/configuration, not the absence of every directory.

The deterministic native extension probes now author version-2 fixtures. They still exercise the real generated adapter and native tools against a bounded localhost protocol server:

```sh
python3 test/omp-hooks-native-probe.py --harness pi --pi-runtime /path/to/pi-package --evidence /new/evidence/pi
python3 test/omp-hooks-native-probe.py --harness pi --pi-runtime /path/to/pi-package --structured --evidence /new/evidence/pi-structured
python3 test/omp-hooks-native-probe.py --harness omp --omp-bin /path/to/omp --evidence /new/evidence/omp
python3 test/native-hook-probe-opencode.py --repo /path/to/plugnz --runtime /path/to/opencode-package --bun /path/to/bun --out /new/evidence/opencode
```

Run these in a disposable container/home. Pi/OMP compile through Bun on `PATH`; OpenCode accepts an explicit Bun path and keeps its cache under the selected evidence directory. Unlike the paid live probes above, these use scripted model-protocol responses and do not evaluate a model's comprehension. Version-1 and version-2 generated wrapper contracts are both covered by the ordinary repository tests and plain-Node smoke.


OpenCode performs its own `@opencode-ai/plugin` SDK dependency installation when creating a session, even when the hook plugin is a local file. For a fully offline probe, provision the exact official SDK version into an isolated directory with `npm install --ignore-scripts --no-audit --no-fund --prefix /path/to/seed @opencode-ai/plugin@1.19.0`, then pass `--dependency-seed /path/to/seed` to the OpenCode helper. It copies the real package/lock/modules into the fresh native config directory and records the lock hash. This seeds dependencies, not credentials, sessions, approvals, or hook results. The existing 64 MiB runtime-growth limit excludes the separately recorded setup footprint. A cold session whose dependency acquisition stalls is retained as a failed setup attempt, not counted as hook-delivery evidence.
