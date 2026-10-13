import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { codexWriter } from "../src/hosts/codex-writer.ts";
import { test, expect } from "bun:test";
import assert from "node:assert/strict";
const nativeTest = process.env.CODEX_NATIVE_POLICY === "1" ? test : () => {};
nativeTest(
  "Codex 0.162.0 preserves manual invocation policy and plugin MCP native discovery",
  async () => {
    const saved = {
      home: process.env.OPEN_PLUGIN_HOME,
      codex: process.env.OPEN_PLUGIN_CODEX_HOME,
    };
    const binary =
      process.env.CODEX_POLICY_BIN ?? "/Users/cfeng1/.bun/bin/codex";
    assert.equal(
      spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout.trim(),
      "codex-cli 0.162.0",
    );
    const root = mkdtempSync(join(tmpdir(), "codex-policy-"));
    const home = join(root, "home");
    const ch = join(home, ".codex");
    const src = join(root, "source");
    mkdirSync(ch, { recursive: true });
    mkdirSync(src, { recursive: true });
    function write(path, text) {
      mkdirSync(join(src, path, ".."), { recursive: true });
      writeFileSync(join(src, path), text);
    }
    write(
      "plugin.json",
      JSON.stringify({ name: "policy-probe", version: "1.0.0" }),
    );
    for (const name of ["ordinary", "manual", "sidecar"])
      write(
        `skills/${name}/SKILL.md`,
        `---\nname: ${name}\ndescription: ${name} proof\n${name === "manual" ? "disable-model-invocation: true\n" : ""}---\nproof ${name}\n`,
      );
    write(
      ".claude/commands/run.md",
      "---\ndescription: manual command proof\n---\ncommand-proof $ARGUMENTS\n",
    );
    write(
      "skills/sidecar/agents/openai.yaml",
      "policy:\n  allow_implicit_invocation: false\n",
    );
    const server = join(root, "server.js");
    writeFileSync(
      server,
      `let b='';process.stdin.on('data',d=>{b+=d;let n;while((n=b.indexOf('\\n'))>=0){const l=b.slice(0,n);b=b.slice(n+1);if(!l)continue;const m=JSON.parse(l);if(m.id===undefined)continue;let result=m.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'local-probe',version:'1'}}:m.method==='tools/list'?{tools:[{name:'probe_echo',description:'Local probe',inputSchema:{type:'object',properties:{}}}]}:m.method==='resources/list'?{resources:[]}:m.method==='prompts/list'?{prompts:[]}:{};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n')}});`,
    );
    write(
      "mcp.json",
      JSON.stringify({
        mcpServers: {
          probe: { command: "/Users/cfeng1/.bun/bin/bun", args: [server] },
        },
      }),
    );
    process.env.OPEN_PLUGIN_CODEX_HOME = ch;
    process.env.OPEN_PLUGIN_HOME = home;
    await codexWriter.add(
      {
        dir: src,
        name: "policy-probe",
        marketplace: "audit",
        version: "1.0.0",
        contentFingerprint: "probe",
      },
      { sourceUri: src, sha: "local", isGit: false, plugins: [] },
    );
    const child = spawn(binary, ["app-server"], {
      cwd: root,
      env: { ...process.env, HOME: home, CODEX_HOME: ch, OPENAI_API_KEY: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let b = "",
      err = "",
      id = 0;
    const pending = new Map();
    const messages = [];
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => {
      b += d;
      let n;
      while ((n = b.indexOf("\n")) >= 0) {
        const l = b.slice(0, n);
        b = b.slice(n + 1);
        if (!l) continue;
        const m = JSON.parse(l);
        messages.push(m);
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          m.error ? p.reject(m.error) : p.resolve(m.result);
        }
      }
    });
    const call = (method, params) =>
      new Promise((resolve, reject) => {
        const key = id++;
        pending.set(key, { resolve, reject });
        child.stdin.write(JSON.stringify({ id: key, method, params }) + "\n");
        setTimeout(() => {
          if (pending.has(key)) {
            pending.delete(key);
            reject(new Error("timeout " + method));
          }
        }, 15000);
      });
    try {
      await call("initialize", {
        clientInfo: { name: "policy-probe", version: "1" },
        capabilities: { experimentalApi: true },
      });
      child.stdin.write(
        JSON.stringify({ method: "initialized", params: {} }) + "\n",
      );
      const skills = await call("skills/list", {
        cwds: [root],
        forceReload: true,
      });
      const mcp = await call("mcpServerStatus/list", {});
      assert.equal(mcp.data.length, 1);
      assert.equal(mcp.data[0].pluginId, "policy-probe@audit");
      assert.ok(mcp.data[0].tools.probe_echo);
      const rows = skills.data[0].skills.filter(
        (row) => row.pluginId === "policy-probe@audit",
      );
      expect(rows.map((row) => row.name).sort()).toEqual([
        "policy-probe:manual",
        "policy-probe:ordinary",
        "policy-probe:run",
        "policy-probe:sidecar",
      ]);
      const requests = [];
      const serverHttp = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (req) => {
          requests.push({ url: req.url, body: await req.text() });
          return new Response(
            JSON.stringify({ error: { message: "local capture complete" } }),
            { status: 400 },
          );
        },
      });
      writeFileSync(
        join(ch, "config.toml"),
        readFileSync(join(ch, "config.toml"), "utf8") +
          `\n[model_providers.probe]\nname="Probe"\nbase_url="http://127.0.0.1:${serverHttp.port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n`,
      );
      async function capture(prompt) {
        const exec = spawn(
          binary,
          [
            "exec",
            "--skip-git-repo-check",
            "--model",
            "gpt-5.4",
            "-c",
            'model_provider="probe"',
            prompt,
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              HOME: home,
              CODEX_HOME: ch,
              OPENAI_API_KEY: "",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        exec.stderr.resume();
        exec.stdout.resume();
        const timer = setTimeout(() => exec.kill("SIGKILL"), 15000);
        await new Promise((resolve) => exec.on("close", resolve));
        clearTimeout(timer);
      }
      await capture("Say hello");
      await capture("$policy-probe:run alpha beta");
      serverHttp.stop();
      assert.equal(requests.length, 2);
      const request = JSON.parse(requests[0].body);
      const text = JSON.stringify(request.input);
      assert.ok(text.includes("policy-probe:ordinary"));
      assert.equal(text.includes("policy-probe:manual"), false);
      assert.equal(text.includes("policy-probe:sidecar"), false);
      assert.equal(text.includes("policy-probe:run"), false);
      const explicit = JSON.stringify(JSON.parse(requests[1].body).input);
      assert.ok(explicit.includes("command-proof"));
      assert.ok(explicit.includes("policy-probe:run"));
    } finally {
      child.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
      if (saved.home === undefined) delete process.env.OPEN_PLUGIN_HOME;
      else process.env.OPEN_PLUGIN_HOME = saved.home;
      if (saved.codex === undefined) delete process.env.OPEN_PLUGIN_CODEX_HOME;
      else process.env.OPEN_PLUGIN_CODEX_HOME = saved.codex;
    }
  },
  30_000,
);
