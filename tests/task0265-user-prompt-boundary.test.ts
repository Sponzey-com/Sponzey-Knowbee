import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const USER_FORBIDDEN_POLICY_DETAILS = [
  "delegated automatically when an enabled direct child",
  "Do not repeat the same failure path",
  "Trusted settings are explicit config values",
] as const

describe("task0265 user prompt preference boundary", () => {
  it("keeps execution, recovery, and trusted-setting definitions out of user prompt", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const user = readFileSync(join(promptsDir, "user.md"), "utf-8")
    const definitions = readFileSync(join(promptsDir, "definitions.md"), "utf-8")
    const recoveryPolicy = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8")
    const knowbeeExecution = readFileSync(join(promptsDir, "knowbee-execution.md"), "utf-8")

    for (const detail of USER_FORBIDDEN_POLICY_DETAILS) {
      expect(user).not.toContain(detail)
    }

    expect(user).toContain("knowbee-execution.md")
    expect(user).toContain("recovery_policy.md")
    expect(user).toContain("definitions.md")
    expect(definitions).toContain("Trusted settings are limited to")
    expect(recoveryPolicy).toContain("Build recovery keys")
    expect(knowbeeExecution).toContain("## 5. Execution Order")
  })
})
