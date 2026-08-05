import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const memoryStoreSource = readFileSync(
  new URL("../packages/core/src/memory/store.ts", import.meta.url),
  "utf-8",
)
const contextPreflightSource = readFileSync(
  new URL("../packages/core/src/runs/context-preflight.ts", import.meta.url),
  "utf-8",
)
const executionHarnessSource = readFileSync(
  new URL("../packages/core/src/orchestration/execution-harness.ts", import.meta.url),
  "utf-8",
)

describe("task0619 memory and execution state error redaction", () => {
  it("redacts memory index job failure messages before persistence", () => {
    expect(memoryStoreSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(memoryStoreSource).toContain("function memoryStoreErrorMessage")
    expect(memoryStoreSource).toContain("markMemoryIndexJobFailed(documentId, memoryStoreErrorMessage(err))")
    expect(memoryStoreSource).not.toContain(
      "markMemoryIndexJobFailed(documentId, err instanceof Error ? err.message : String(err))",
    )
  })

  it("redacts context preflight compaction exception reason codes", () => {
    expect(contextPreflightSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(contextPreflightSource).toContain("function contextPreflightErrorMessage")
    expect(contextPreflightSource).toContain("blockedReasonCodes.push(contextPreflightErrorMessage(error))")
    expect(contextPreflightSource).not.toContain(
      "blockedReasonCodes.push(error instanceof Error ? error.message : String(error))",
    )
  })

  it("redacts execution harness trace and parse issue details", () => {
    expect(executionHarnessSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(executionHarnessSource).toContain("function executionHarnessErrorDetail")
    expect(executionHarnessSource).toContain('detail: executionHarnessErrorDetail(error, "Model call failed.")')
    expect(executionHarnessSource).toContain('issue: executionHarnessErrorDetail(error, "Model output is not valid JSON.")')
    expect(executionHarnessSource).not.toContain('detail: error instanceof Error ? error.message : "Model call failed."')
    expect(executionHarnessSource).not.toContain(
      'issue: error instanceof Error ? error.message : "Model output is not valid JSON."',
    )
  })
})
