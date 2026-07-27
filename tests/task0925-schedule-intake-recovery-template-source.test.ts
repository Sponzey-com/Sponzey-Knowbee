import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0925 schedule intake recovery prompt source", () => {
  it("registers schedule intake recovery input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "schedule_intake_recovery_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "schedule_intake_recovery_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/schedule_intake_recovery_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{previousReceipt}}")
    expect(source?.content).toContain("{{reason}}")
  })

  it("does not keep the schedule intake recovery envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(source).toContain('sourceId: "schedule_intake_recovery_user"')
    expect(source).not.toContain("[Schedule Intake Recovery]")
    expect(source).not.toContain("The previous schedule-analysis pass did not create a valid schedule action.")
    expect(source).not.toContain("Produce a concrete create_schedule or cancel_schedule action")
  })
})
