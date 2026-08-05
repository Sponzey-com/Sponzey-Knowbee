import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const orchestrationDispatchSource = readFileSync(
  new URL("../packages/core/src/runs/orchestration-dispatch.ts", import.meta.url),
  "utf-8",
)
const subSessionRunnerSource = readFileSync(
  new URL("../packages/core/src/orchestration/sub-session-runner.ts", import.meta.url),
  "utf-8",
)
const diagnosisProviderRuntimeSource = readFileSync(
  new URL("../packages/core/src/runs/diagnosis-provider-runtime.ts", import.meta.url),
  "utf-8",
)
const topologyToolDispatcherSource = readFileSync(
  new URL("../packages/core/src/topology-runtime/tool-dispatcher.ts", import.meta.url),
  "utf-8",
)

describe("task0623 orchestration failure reason redaction", () => {
  it("redacts orchestration dispatch provider and child creation failures", () => {
    expect(orchestrationDispatchSource).toContain("function orchestrationDispatchErrorMessage")
    expect(orchestrationDispatchSource).toContain("function orchestrationDispatchReasonDetail")
    expect(orchestrationDispatchSource).toContain("const reason = orchestrationDispatchReasonDetail(error)")
    expect(orchestrationDispatchSource).toContain("const safeMessage = orchestrationDispatchErrorMessage(error)")
    expect(orchestrationDispatchSource).not.toContain("const safeMessage = error instanceof Error ? error.message : String(error)")
  })

  it("redacts sub-session and diagnosis provider runtime failure details", () => {
    expect(subSessionRunnerSource).toContain("function subSessionReasonDetail")
    expect(subSessionRunnerSource).toContain("redactLogText(error.message)")
    expect(subSessionRunnerSource).toContain("const reason = subSessionReasonDetail(error)")
    expect(diagnosisProviderRuntimeSource).toContain("return redactLogText(message).replace")
  })

  it("redacts topology tool execution reason codes", () => {
    expect(topologyToolDispatcherSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(topologyToolDispatcherSource).toContain("redactLogText(input.result.error)")
    expect(topologyToolDispatcherSource).toContain("redactLogText(input.thrown.message)")
    expect(topologyToolDispatcherSource).not.toContain("input.thrown instanceof Error ? input.thrown.message")
  })
})
