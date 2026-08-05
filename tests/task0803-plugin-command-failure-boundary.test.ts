import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { formatCliCommandFailure } from "../packages/cli/src/command-error.ts"

describe("task0803 plugin command failure boundary", () => {
  it("routes plugin command failures through the shared CLI reporter", () => {
    const source = readFileSync(join(process.cwd(), "packages/cli/src/commands/plugin.ts"), "utf-8")

    expect(source).toContain("reportCliCommandFailure")
    expect(source).not.toContain("console.error")
    expect(source).not.toContain("process.exit(1)")
  })

  it("sanitizes plugin path failures through the CLI command formatter", () => {
    const text = formatCliCommandFailure("파일이 존재하지 않습니다: /Users/me/private/plugin.js")

    expect(text).toContain("CLI command failed. Reason:")
    expect(text).not.toContain("/Users/me/private")
    expect(text).not.toContain("plugin.js")
  })
})
