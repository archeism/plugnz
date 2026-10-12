import { randomUUID } from "node:crypto";

export default function (pi) {
  const origin = process.env.PROBE_ORIGIN;
  const harness = process.env.PROBE_HARNESS;
  const mode = process.env.PROBE_CASE;
  const snapshot = value => JSON.parse(JSON.stringify(value));
  const delay = () => new Promise(resolve => setTimeout(resolve, 80));
  const observe = async (event, data = {}) => {
    const response = await fetch(origin + "/observe", {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({event, harness, mode, ...data}),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Probe observer HTTP " + response.status);
  };
  if (harness === "omp") {
    pi.registerProvider("effect-probe", {
      baseUrl: origin + "/v1", api: "openai-completions", apiKey: "FAKE_LOCAL_ONLY",
      models: [{id: "probe-model", name: "Synthetic effect probe", api: "openai-completions",
        reasoning: false, input: ["text"], contextWindow: 32768, maxTokens: 512,
        cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}]
    });
  }
  pi.on("session_start", async (event, ctx) => {
    await observe("session_start", {reason: event.reason,
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile()});
  });
  pi.on("tool_call", async event => {
    await observe("pre_enter", {toolName: event.toolName, toolCallId: event.toolCallId,
      input: snapshot(event.input)});
    if (event.toolName !== "read" || event.toolCallId !== "call_read_once") return;
    await delay();
    if (mode === "deny") {
      const reason = "DENIED_" + randomUUID();
      await observe("pre_deny", {toolCallId: event.toolCallId, reason});
      return {block: true, reason};
    }
    if (mode === "rewrite") {
      if (harness === "pi") {
        event.input.path = "alternate.txt";
        await observe("pre_rewrite", {toolCallId: event.toolCallId,
          effect: "mutate event.input", input: snapshot(event.input)});
        return;
      }
      const input = {path: "alternate.txt"};
      await observe("pre_rewrite", {toolCallId: event.toolCallId,
        effect: "return input", input});
      return {input};
    }
    await observe("pre_no_effect", {toolCallId: event.toolCallId});
  });
  pi.on("tool_result", async event => {
    await observe("post_original", {toolName: event.toolName, toolCallId: event.toolCallId,
      input: snapshot(event.input), content: snapshot(event.content),
      details: event.details, isError: event.isError});
    if (event.toolName !== "read" || event.toolCallId !== "call_read_once") return;
    await delay();
    const nonce = "POST_REPLACED_" + randomUUID();
    await observe("post_decision", {toolCallId: event.toolCallId, nonce,
      returned: mode === "rewrite"});
    if (mode === "rewrite") return {content: [{type: "text", text: nonce}]};
  });
  let stopPass = 0;
  if (harness === "omp") {
    pi.on("session_stop", async event => {
      stopPass++;
      await observe("session_stop", {pass: stopPass, stop_hook_active: event.stop_hook_active,
        turn_id: event.turn_id, session_id: event.session_id});
      if (mode === "rewrite" && stopPass === 1) {
        await delay();
        const nonce = "STOP_CONTINUE_" + randomUUID();
        await observe("stop_decision", {nonce, returned: true, pass: stopPass});
        return {continue: true, additionalContext: nonce};
      }
    });
  }
  for (const name of ["tool_execution_start", "tool_execution_end", "agent_end", "session_shutdown"]) {
    pi.on(name, async event => {
      await observe(name, {toolName: event.toolName, toolCallId: event.toolCallId,
        isError: event.isError, reason: event.reason, willContinue: event.willContinue,
        result: name === "tool_execution_end" ? event.result : undefined});
    });
  }
}
