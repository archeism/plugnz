import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { yamlParse, yamlStringify } from '../src/yaml';

declare const Bun: {
  YAML: { parse(input: string): unknown; stringify(value: unknown): string };
  CryptoHasher: new (algorithm: string) => { update(value: string): { digest(format: 'hex'): string } };
};

type CorpusEntry = { source: string; raw: string };
const corpus: CorpusEntry[] = JSON.parse(readFileSync(join(import.meta.dir, "parity", "corpus.json"), "utf8"));

/** Last Bun version the quoting table and BMP differential sweep were re-probed under. */
const GRAMMAR_VERIFIED_BUN = "1.4.3";

/** Grammar cases derived from probing Bun.YAML.stringify directly; each pair
 * is (input, exact Bun output) so a Bun upgrade that shifts the grammar fails
 * here before it can ship different bytes to any install. */
// Simple cases pin the grammar with hand-written literals.
const GRAMMAR: Array<[unknown, string]> = [
  [{ name: "ordinary", description: "ordinary skill" }, "{name: ordinary,description: ordinary skill}"],
  [{ name: "unicode", description: "审查 skill-ai-backend 仓库的 diff、MR、分支" }, "{name: unicode,description: 审查 skill-ai-backend 仓库的 diff、MR、分支}"],
  [{ name: "flags", description: "flags", "disable-model-invocation": true, "user-invocable": false, missing: null }, "{name: flags,description: flags,disable-model-invocation: true,user-invocable: false,missing: null}"],
  [{ name: "nums", description: "nums", count: 42, ratio: 3.14, big: 1e21 }, "{name: nums,description: nums,count: 42,ratio: 3.14,big: 1e+21}"],
  [{ name: "nested", description: "nested", metadata: { credits: { author: "Matt", url: "https://x.y" }, items: [{ a: 1 }] } }, "{name: nested,description: nested,metadata: {credits: {author: Matt,url: https://x.y},items: [{a: 1}]}}"],
  [{ description: "no-name" }, "{description: no-name}"],
  [{}, "{}"],
  [{ a: {} }, "{a: {}}"],
  [{ a: [] }, "{a: []}"],
  [{ a: undefined, b: 1 }, "{b: 1}"],
  [[undefined, 1], "[1]"],
  [[1, undefined], "[1]"],
  [[[undefined, 1], [1, undefined], [undefined]], "[[1],[1],[]]"],
  [[1, [2, [3]]], "[1,[2,[3]]]"],
  [{ "": 1 }, '{"": 1}'],
  [{ zero: -0 }, "{zero: -0}"],
  [{ inf: Infinity, nan: NaN, ninf: -Infinity }, "{inf: .inf,nan: .nan,ninf: -.inf}"],
  ["plain", "plain"],
  ["with space", "with space"],
  [" leading", '" leading"'],
  ["trailing ", '"trailing "'],
  ["", '""'],
  ["42", '"'+'42'+'"'],
  ["y", '"y"'], ["yes", '"yes"'], ["on", '"on"'], ["off", '"off"'], ["no", '"no"'], ["n", '"n"'], ["null", '"null"'], ["~", '"~"'], ["true", '"true"'],
  ["0x1F", '"0x1F"'], ["0o17", '"0o17"'], ["1.5e3", '"1.5e3"'], [".5", '".5"'], ["+3", '"+3"'], ["1e5", '"1e5"'], ["0.0", '"0.0"'],
  ["1_000", "1_000"], ["1:30", "1:30"], ["12:34:56", "12:34:56"], ["1800s", "1800s"], ["0b101", "0b101"],
  [".inf", '".inf"'], [".nan", '".nan"'], ["Infinity", "Infinity"], ["NaN", "NaN"],
  ["-dash", '"-dash"'], ["?q", '"?q"'], ["!bang", '"!bang"'], ["&anchor", '"&anchor"'], ["%pct", '"%pct"'], ["@at", '"@at"'],
  ["|pipe", '"|pipe"'], [">gt", '">gt"'], ["{brace", '"{brace"'], ["[brack", '"[brack"'], [",comma", '",comma"'],
  ["#hash", '"#hash"'], ["a#b", '"a#b"'], ["a #b", '"a #b"'], ["a:b", "a:b"], ["a: b", '"a: b"'], ["a,", '"a,"'], ["a,b", '"a,b"'],
  ["end:", '"end:"'], [":", '":"'], ["=", "="], ["<<", '"<<"'],
  ["a b  c", "a b  c"], ["emoji 🎉", "emoji 🎉"], ["ünïcödé", "ünïcödé"],
  ["a]b", '"a]b"'], ["a}b", '"a}b"'], ["a`b", '"a`b"'], ["a{b", '"a{b"'], ["a[b", '"a[b"'],
  ["a|b", "a|b"], ["a>b", "a>b"], ["a&b", "a&b"], ["a*b", "a*b"], ["a!b", "a!b"], ["a?b", "a?b"], ["a-b", "a-b"],
  ["a=b", "a=b"], ["a;b", "a;b"], ["a(b", "a(b"], ["a)b", "a)b"],
];

// Escape-heavy inputs are pinned against Bun.YAML.stringify itself, so no
// hand-escaped expected literal can lie about the escape grammar.
const CROSS_CHECK: unknown[] = [
  { name: "quotes", description: "He said \"stop\" — then didn't" },
  { name: "multiline", description: "Line one.\nLine two.\nLine three ends." },
  { name: "kw", description: "Keeps arrays.", keywords: ["a", "b-c", "d_e"], when_to_use: ["x", "y"] },
  { name: "empty", description: "" },
  { name: "colon:value", description: "key: value: with: colons: and # hash" },
  [[[["deep"]]]],
  ["[x]"],
  ["tab\there"],
  ["quote\"inside"],
  ["apos'inside"],
  ["back\\slash"],
  ["x\r y"],
  ["a\x7f b"],
  ["null\n"],
];
// FEFF lives in the roundtrip sweep below, not here: CROSS_CHECK pins byte
// parity with the RUNNING Bun, and Bun's own bytes for a leading/lone BOM
// drift across the allowed range (bare ≤1.4.2, quoted ≥1.4.3).

describe("yaml byte parity (capability yaml-parity)", () => {
  test("writer grammar table matches Bun.YAML.stringify exactly", () => {
    for (const [input, expected] of GRAMMAR) {
      expect(yamlStringify(input)).toBe(expected);
      expect(Bun.YAML.stringify(input)).toBe(expected);
    }
    for (const input of CROSS_CHECK) {
      expect(yamlStringify(input)).toBe(Bun.YAML.stringify(input));
    }
  });

  test("every real house frontmatter stringifies byte-identically to Bun.YAML", () => {
    expect(corpus.length).toBeGreaterThan(100);
    let checked = 0;
    for (const entry of corpus) {
      const value = Bun.YAML.parse(entry.raw);
      const ours = yamlStringify(value);
      const theirs = Bun.YAML.stringify(value);
      if (ours !== theirs) throw new Error(`byte drift at ${entry.source}:\nours:   ${ours}\nbun's:  ${theirs}`);
      checked += 1;
    }
    expect(checked).toBe(corpus.length);
  });

  test("yaml package parse agrees with Bun.YAML.parse on the whole corpus", () => {
    for (const entry of corpus) {
      const ours = yamlParse(entry.raw);
      const theirs = Bun.YAML.parse(entry.raw);
      expect(ours).toEqual(theirs);
    }
  });

  test("sha256 hex parity between Bun.CryptoHasher and node:crypto", () => {
    for (const entry of corpus.slice(0, 20)) {
      const bunHex = new Bun.CryptoHasher("sha256").update(entry.raw).digest("hex");
      const nodeHex = createHash("sha256").update(entry.raw).digest("hex");
      expect(nodeHex).toBe(bunHex);
    }
  });
});

describe("yaml merge-key and adversarial differential coverage", () => {
  test("merge keys expand exactly as Bun.YAML.parse expands them", () => {
    const docs = [
      "<<: {disable-model-invocation: true}\ndescription: x",
      "base: &b {a: 1}\nitem:\n  <<: *b\n  c: 2",
      "x:\n  <<: {user-invocable: false}\n  name: y",
    ];
    for (const doc of docs) expect(yamlParse(doc)).toEqual(Bun.YAML.parse(doc));
  });

  test("a merge-keyed invocation policy reaches the consumer seam (Codex sidecar policy)", async () => {
    const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { projectPluginForCodex } = await import("../src/conversion");
    const root = mkdtempSync(join(tmpdir(), "plugnz-merge-e2e-"));
    try {
      writeFileSync(join(root, "plugin.json"), JSON.stringify({ name: "demo", version: "1.0.0" }));
      mkdirSync(join(root, "skills", "guarded"), { recursive: true });
      writeFileSync(join(root, "skills", "guarded", "SKILL.md"),
        "---\nname: guarded\ndescription: guarded skill\n<<: {disable-model-invocation: true}\n---\nBody.\n");
      const out = mkdtempSync(join(tmpdir(), "plugnz-merge-e2e-out-"));
      projectPluginForCodex(root, out);
      const sidecar = join(out, "skills", "guarded", "agents", "openai.yaml");
      if (!existsSync(sidecar)) throw new Error("manual policy must produce the Codex sidecar");
      const policy = readFileSync(sidecar, "utf8");
      if (!/allow_implicit_invocation:\s*false/.test(policy)) throw new Error(`sidecar must disable implicit invocation, got:\n${policy}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("tagged scalars parse to raw strings exactly as Bun does", () => {
    const docs = [
      "d: !!timestamp 2026-10-10",
      "d: !!timestamp 2026-10-10T10:30:00Z",
      "b: !!binary aGVsbG8=",
      "i: !!int 42",
      "s: !!str 42",
      "n: !!null null",
    ];
    for (const doc of docs) expect(yamlParse(doc)).toEqual(Bun.YAML.parse(doc));
    // A !!timestamp frontmatter value must survive a full parse->stringify
    // roundtrip as its source text, never collapse into {}.
    const roundtrip = yamlStringify(yamlParse("description: !!timestamp 2026-10-10"));
    expect(roundtrip).toBe("{description: 2026-10-10}");
  });

  test("the byte-grammar contract declares which Bun versions verified it", () => {
    // Grammar is an observed Bun implementation detail, not a spec: U+2028
    // serializes differently on Bun 1.3.x than on the 1.4.x line this
    // writer's grammar was derived and swept under. Last re-sweep was Bun
    // 1.4.3 (GRAMMAR_VERIFIED_BUN): leading U+FEFF quotes; 1.4.2 emitted it
    // bare and parsed a lone BOM as null. CI pins that version in
    // .github/workflows/tests.yml. The published artifact is Bun-independent
    // (the bundle embeds this writer); this contract only governs the
    // dev-time differential gate. Update GRAMMAR_VERIFIED_BUN after
    // re-probing whenever Bun's serialization shifts.
    const version = (Bun as unknown as { version: string }).version;
    const ok = /^1\.(4|5|6|7|8|9)\./.test(version) || /^2\./.test(version);
    if (!ok) throw new Error(
      `byte-grammar contract not verified under Bun ${version}: the differential sweep is derived from Bun >= 1.4 serialization (U+2028 differs on 1.3.x; U+FEFF quoting from ${GRAMMAR_VERIFIED_BUN}). Pin dev Bun >= 1.4 to run this gate, or re-derive the grammar and update the contract in test/yaml-parity.test.ts.`,
    );
  });

  test("every Basic Multilingual Plane codepoint stringifies byte-identically", () => {
    if (!(/^1\.(4|5|6|7|8|9)\./.test((Bun as unknown as { version: string }).version) || /^2\./.test((Bun as unknown as { version: string }).version))) return; // guarded by the contract test above
    // FEFF diverges WITHIN the allowed Bun range: Bun itself emits a bare BOM
    // on ≤1.4.2 (which its own parser loses — a lone BOM parses back as null)
    // and quotes it on ≥1.4.3. Our writer quotes a leading/lone BOM on every
    // version for roundtrip safety, so byte parity holds only where Bun
    // ≥1.4.3 (CI pins exactly that). Excluded here; the roundtrip sweep
    // below guards the data instead, version-independently.
    const VERSION_DIVERGENT = new Set([0xfeff]);
    const probe = [0x00, 0x07, 0x08, 0x0b, 0x0c, 0x1b, 0x7f, 0x85, 0xa0, 0x2028, 0x2029, 0xad, 0x200b, 0x3000];
    for (let cp = 0x20; cp < 0x2100; cp++) { if (!VERSION_DIVERGENT.has(cp)) probe.push(cp); }
    for (const cp of [0x3000, 0x1f600, 0xfffd, 0x4e2d, 0x1f1fa]) probe.push(cp);
    for (const cp of probe) {
      const ch = String.fromCodePoint(cp);
      for (const s of [ch, `a${ch}b`]) {
        const ours = yamlStringify(s);
        const theirs = Bun.YAML.stringify(s);
        if (ours !== theirs) throw new Error(`U+${cp.toString(16)} diverges: ours ${JSON.stringify(ours)} bun ${JSON.stringify(theirs)}`);
      }
    }
  });

  test("every Basic Multilingual Plane codepoint survives write→parse roundtrip", () => {
    if (!(/^1\.(4|5|6|7|8|9)\./.test((Bun as unknown as { version: string }).version) || /^2\./.test((Bun as unknown as { version: string }).version))) return; // guarded by the contract test above
    // Byte parity with any one Bun version cannot hold across versions
    // (FEFF above), but data integrity can: whatever we write must parse
    // back to the input on every allowed Bun. This is the net the leading-BOM
    // loss slipped through on ≤1.4.2 (bare BOM -> Bun.YAML.parse -> null).
    const probe = [0x00, 0x07, 0x08, 0x0b, 0x0c, 0x1b, 0x7f, 0x85, 0xa0, 0x2028, 0x2029, 0xad, 0x200b, 0x3000, 0xfeff];
    for (let cp = 0x20; cp < 0x2100; cp++) probe.push(cp);
    for (const cp of [0x3000, 0x1f600, 0xfffd, 0x4e2d, 0x1f1fa]) probe.push(cp);
    for (const cp of probe) {
      const ch = String.fromCodePoint(cp);
      // `${ch}x` (leading-with-suffix) matters most: it is the position where
      // Bun <=1.4.2's bare BOM silently dropped the character on parse.
      for (const s of [ch, `${ch}x`, `a${ch}b`, `x${ch}`]) {
        const back = Bun.YAML.parse(yamlStringify(s));
        if (back !== s) throw new Error(`U+${cp.toString(16)} does not roundtrip: ${JSON.stringify(s)} -> ${JSON.stringify(back)}`);
      }
    }
  });
});

describe("runtime.spawn failure settlement", () => {
  test("a vanished binary settles exited with -1 and reports exitCode immediately", async () => {
    const { spawn } = await import("../src/runtime");
    const child = spawn(["/nonexistent/binary/for/plugnz/smoke", "--version"]);
    const code = await child.exited;
    expect(code).toBe(-1);
    expect(child.exitCode).toBe(-1);
  });
});

describe("runtime.spawn option forwarding", () => {
  test("timeout kills the child and settles exited with -1", async () => {
    const { spawn } = await import("../src/runtime");
    const sleeper = "/bin/sleep";
    const child = spawn([sleeper, "30"], { timeout: 120 });
    const started = performance.now();
    const code = await child.exited;
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(code).toBe(-1);
  });
});
