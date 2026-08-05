import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { toolUserFacingErrorMessage } from "../packages/core/src/tools/builtin/error-redaction.ts"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0588 built-in tool error redaction", () => {
  it("redacts representative secrets and local paths in built-in tool error details", () => {
    const secret = "sk-task0588-tool-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/tool-output.txt"
    const message = toolUserFacingErrorMessage(
      new Error(`platform command failed token=${secret} path=${localPath}`),
    )

    expect(message).toContain("token=***")
    expect(message).toContain("[internal-path-redacted]")
    expect(message).not.toContain(secret)
    expect(message).not.toContain(localPath)
  })

  it("routes clipboard and window failure outputs through the tool redaction helper", () => {
    const clipboard = source("packages/core/src/tools/builtin/ui/clipboard.ts")
    const window = source("packages/core/src/tools/builtin/ui/window.ts")

    expect(clipboard).toContain("toolUserFacingErrorMessage(err)")
    expect(window).toContain("toolUserFacingErrorMessage(err)")
    expect(clipboard).not.toContain("${err instanceof Error ? err.message : String(err)}")
    expect(window).not.toContain("${err instanceof Error ? err.message : String(err)}")
  })
})
