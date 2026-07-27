import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0590 file and patch tool exception redaction", () => {
  it("routes file and patch exception details through the built-in tool redaction helper", () => {
    const fileTool = source("packages/core/src/tools/builtin/file.ts")
    const fileSearch = source("packages/core/src/tools/builtin/file-search.ts")
    const patchApplier = source("packages/core/src/tools/builtin/patch-applier.ts")
    const combined = [fileTool, fileSearch, patchApplier].join("\n")

    expect(fileTool.match(/toolUserFacingErrorMessage\(err\)/g)?.length).toBe(5)
    expect(fileSearch.match(/toolUserFacingErrorMessage\(err\)/g)?.length).toBe(1)
    expect(patchApplier.match(/toolUserFacingErrorMessage\(err\)/g)?.length).toBe(5)
    expect(combined).not.toContain("err instanceof Error ? err.message : String(err)")
  })
})
