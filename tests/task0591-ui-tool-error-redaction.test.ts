import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0591 UI automation tool error redaction", () => {
  it("routes screen mouse and keyboard failure details through the built-in tool redaction helper", () => {
    const screen = source("packages/core/src/tools/builtin/ui/screen.ts")
    const mouse = source("packages/core/src/tools/builtin/ui/mouse.ts")
    const keyboard = source("packages/core/src/tools/builtin/ui/keyboard.ts")
    const combined = [screen, mouse, keyboard].join("\n")

    expect(screen.match(/toolUserFacingErrorMessage\(/g)?.length).toBe(2)
    expect(mouse.match(/toolUserFacingErrorMessage\(error\)/g)?.length).toBe(3)
    expect(keyboard.match(/toolUserFacingErrorMessage\(error\)/g)?.length).toBe(3)
    expect(combined).not.toContain("error instanceof Error ? error.message : String(error)")
    expect(combined).not.toContain("err instanceof Error ? err.message : String(err)")
  })
})
