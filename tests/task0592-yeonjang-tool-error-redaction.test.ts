import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0592 Yeonjang and Telegram tool error redaction", () => {
  it("routes Telegram and Yeonjang failure details through the built-in tool redaction helper", () => {
    const telegram = source("packages/core/src/tools/builtin/telegram-send.ts")
    const yeonjang = source("packages/core/src/tools/builtin/yeonjang.ts")
    const broadcast = source("packages/core/src/tools/builtin/yeonjang-broadcast.ts")
    const combined = [telegram, yeonjang, broadcast].join("\n")

    expect(telegram).toContain("const msg = toolUserFacingErrorMessage(err)")
    expect(yeonjang.match(/toolUserFacingErrorMessage\(error\)/g)?.length).toBe(2)
    expect(broadcast).toContain("const message = toolUserFacingErrorMessage(error)")
    expect(combined).not.toContain("err instanceof Error ? err.message : String(err)")
    expect(combined).not.toContain("error instanceof Error ? error.message : String(error)")
  })
})
