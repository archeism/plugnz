# Kimi final-C72 native proof

This is bounded evidence for Kimi's native Git lifecycle with the frozen C72
artifact. It proves native installation and discovery, unchanged same-HEAD
behavior, and a loud zero-write refusal when the Git Source advances. It does
not prove command invocation, a model turn, or native update delivery.

## Frozen inputs

- Proof preparation: `e24f51e8fca8c3e7e4af4b2f15d373471db0257d`.
- Candidate artifact:
  `/tmp/plugnz-native-git-main-integration/dist/plugnz.mjs`, SHA256
  `c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606`.
- Controlled Source: `https://github.com/archeism/plugnz.git`, ref
  `proof/kimi-native-c72-20261012`; V1
  `f60a45efeab8b608995ec06eb022ced88d42aedf`, advanced by one commit to V2
  `db0237713b2e4d07f5ef3baa65d66b043eab49bc`.
- Actual supplier: `@moonshot-ai/kimi-code@2.0.1`, registry integrity
  `sha512-MiNaN3kQ5t979evcHHFYh6LcsceZ4c67Cv/JDl6Vw+EJd97IazY4pgT0ILHRQ2CGNzQ3rIutgIx7BmBmcjwv/w==`.
- Workflow and oracle snapshots: SHA256
  `7dd2c486d8bd07e1e5063952d52412ad4d269516260f6cf966424d85a4b4c532`
  and
  `551ed9e8eca9f6d1c7dd92d0598d643312e46da7138cf664ebd4e562f099d4e3`.

## Preserved result

The explicitly owned, nonpersistent Sandbox
`plugnz-kimi-final-c72-20261012` stopped after preservation with no snapshot.
The durable local archive is
`/tmp/plugnz-kimi-final-c72-01/evidence.tar.gz`: 68,443,154 bytes, SHA256
`1ec7c0b6e2bc2c7819cdb262818e7e9e7da8ea075cc4d6fa7ae683e7b24ec90a`.
Its local controller receipt is
`/tmp/plugnz-kimi-final-c72-01/receipt.json`; preserved pre/post results are
`trial/kimi-v1.json`, `trial/kimi-v2.json`, and
`trial/workflow.result.json` inside the archive. The controller archived and
restored 4,298 entries after namespace-safe hardlink staging; controller exit
was zero and its stop journal recorded no failure.

V1 used the actual released supplier and C72 artifact. Install converged as
`active-conforming`; same-HEAD preview and apply both returned code zero with
identical before/after native digests, `mutationStarted: false`, and
`changed: false`. Native discovery reported one enabled skill, one command,
and no errors.

V2 resolved the same ref at the one-commit-newer Source. Preview and apply both
returned code one without changing native bytes. Both reported
`capability.unsupported`, capability `operation.update`, evidence
`sha256:754f910c5cfa319ab144e4b7002bfeb67183752b023d28dc6be17bf4737c3452`,
`mutationStarted: false`, and `changed: false`; apply retained the prior active
installation. This is the expected unsupported-update result, not a delivered
update.

## Independent restore

An independent fresh restore at `/tmp/plugnz-kimi-c72-independent-hEy4t4`
verified the archive digest, all 4,519 retained regular trial/supplier files
(165,812,420 bytes), their hashes and modes, every directory and symlink
target, and that exactly the prebound supplier identity body was omitted. It
also rechecked the exact C72/workflow/oracle hashes and every V1/V2 outcome
above. The verifier is retained at
`/tmp/plugnz-kimi-c72-independent.mjs`.

No real home, LLM credential, model turn, or command invocation was used.
