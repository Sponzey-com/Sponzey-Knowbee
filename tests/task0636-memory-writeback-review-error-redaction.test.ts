import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const memoryRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/memory.ts", import.meta.url),
  "utf-8",
)

describe("task0636 memory writeback review error redaction", () => {
  it("redacts writeback review failures before building API error responses", () => {
    expect(memoryRouteSource).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(memoryRouteSource).toContain("function memoryWritebackReviewErrorMessage(error: unknown): string")
    expect(memoryRouteSource).toContain("return redactLogText(rawMessage)")
    expect(memoryRouteSource).toContain("function memoryWritebackReviewErrorStatus(message: string): 400 | 404")
    expect(memoryRouteSource).toContain("const message = memoryWritebackReviewErrorMessage(error)")
    expect(memoryRouteSource).toContain("reply.status(memoryWritebackReviewErrorStatus(message)).send")
    expect(memoryRouteSource).not.toContain("const message = error instanceof Error ? error.message : String(error)")
    expect(memoryRouteSource).not.toContain("const status = /not found/i.test(message) ? 404 : 400")
  })
})
