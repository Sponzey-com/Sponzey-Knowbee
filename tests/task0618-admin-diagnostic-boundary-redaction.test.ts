import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const platformSource = readFileSync(
  new URL("../packages/core/src/runs/admin-platform-inspectors.ts", import.meta.url),
  "utf-8",
)
const runtimeSource = readFileSync(
  new URL("../packages/core/src/runs/admin-runtime-inspectors.ts", import.meta.url),
  "utf-8",
)

describe("task0618 admin diagnostic boundary redaction", () => {
  it("redacts platform inspector degraded and export failure errors", () => {
    expect(platformSource).toContain("degradedReasons.push(adminInspectorErrorMessage(error))")
    expect(platformSource).toContain("const message = adminInspectorErrorMessage(error)")
    expect(platformSource).not.toContain("degradedReasons.push(error instanceof Error ? error.message : String(error))")
    expect(platformSource).not.toContain("const message = sanitizeText(error instanceof Error ? error.message : String(error))")
  })

  it("redacts runtime inspector query degraded reasons with the common log redactor", () => {
    expect(runtimeSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(runtimeSource).toContain("let next = redactLogText(value)")
    expect(runtimeSource).toContain("function adminRuntimeQueryErrorMessage(error: unknown): string")
    expect(runtimeSource).toContain("const message = adminRuntimeQueryErrorMessage(error)")
    expect(runtimeSource).not.toContain("redactText(error instanceof Error ? error.message : String(error))")
    expect(runtimeSource).not.toContain("const message = error instanceof Error ? error.message : String(error)")
  })
})
