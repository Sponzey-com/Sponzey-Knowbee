import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0656 candidate and web smoke error boundaries", () => {
  it("keeps candidate provider and web retrieval smoke error conversion out of direct message patterns", () => {
    const candidates = readFileSync("packages/core/src/candidates/index.ts", "utf-8")
    const smoke = readFileSync("packages/core/src/runs/web-retrieval-smoke.ts", "utf-8")

    expect(candidates).toContain("function candidateProviderErrorTrace(error: unknown)")
    expect(candidates).toContain("const raw = error instanceof Error ? error.message : String(error)")
    expect(candidates).not.toContain("const message = error instanceof Error ? error.message : String(error)")

    expect(smoke).toContain("function webRetrievalSmokeErrorReason(error: unknown): string")
    expect(smoke).toContain("const raw = error instanceof Error ? error.message : String(error)")
    expect(smoke).not.toContain("const message = error instanceof Error ? error.message : String(error)")
  })
})
