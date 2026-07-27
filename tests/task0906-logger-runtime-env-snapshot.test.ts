import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0906 logger runtime environment snapshot", () => {
  it("keeps logger policy calculation behind an immutable runtime env snapshot", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/logger/index.ts"),
      "utf-8",
    )
    const policyStart = source.indexOf("const LOG_POLICY")
    const policyEnd = source.indexOf("export function redactLogText", policyStart)
    const policyBlock = source.slice(policyStart, policyEnd)

    expect(source).toContain(
      'typeof process === "undefined" ? undefined : process',
    )
    expect(source).toContain("const LOGGER_RUNTIME_ENV")
    expect(source).toContain('logLevel: LOGGER_PROCESS?.env["KNOWBEE_LOG_LEVEL"]')
    expect(source).toContain('logPurpose: LOGGER_PROCESS?.env["KNOWBEE_LOG_PURPOSE"]')
    expect(source).toContain(
      'noColorDisabled: LOGGER_PROCESS?.env["KNOWBEE_NO_COLOR"] != null',
    )
    expect(policyBlock).toContain("LOGGER_RUNTIME_ENV.logPurpose")
    expect(policyBlock).toContain("!LOGGER_RUNTIME_ENV.noColorDisabled")
    expect(policyBlock).not.toContain("process.env")
    expect(policyBlock).not.toContain("LOGGER_PROCESS?.env")
  })
})
