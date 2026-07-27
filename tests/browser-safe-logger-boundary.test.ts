import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("browser-safe logger boundary", () => {
  it("captures the optional Node process once instead of reading process globals directly", () => {
    const source = readFileSync("packages/core/src/logger/index.ts", "utf8")

    expect(source).toContain('typeof process === "undefined" ? undefined : process')
    expect(source).toContain("const LOGGER_PROCESS")
    expect(source).not.toContain('logLevel: process.env["KNOWBEE_LOG_LEVEL"]')
    expect(source).not.toContain("stdoutIsTty: process.stdout.isTTY")
  })

  it("uses a browser output fallback when the Node process snapshot is unavailable", () => {
    const source = readFileSync("packages/core/src/logger/index.ts", "utf8")

    expect(source).toContain("if (LOGGER_PROCESS)")
    expect(source).toContain("console.error(line)")
    expect(source).toContain("console.log(line)")
  })
})
