import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0589 app process shell tool error redaction", () => {
  it("routes app process and shell failure details through the built-in tool redaction helper", () => {
    const app = source("packages/core/src/tools/builtin/app.ts")
    const processTool = source("packages/core/src/tools/builtin/process.ts")
    const shell = source("packages/core/src/tools/builtin/shell.ts")
    const combined = [app, processTool, shell].join("\n")

    expect(app).toContain("const message = toolUserFacingErrorMessage(error)")
    expect(app).toContain("const msg = toolUserFacingErrorMessage(err)")
    expect(processTool).toContain("const msg = toolUserFacingErrorMessage(err)")
    expect(shell).toContain("const message = toolUserFacingErrorMessage(error)")
    expect(combined).not.toContain("error instanceof Error ? error.message : String(error)")
    expect(combined).not.toContain("err instanceof Error ? err.message : String(err)")
  })
})
