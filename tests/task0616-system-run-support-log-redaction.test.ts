import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const systemCronSource = readFileSync(
  new URL("../packages/core/src/scheduler/system-cron.ts", import.meta.url),
  "utf-8",
)
const startSupportSource = readFileSync(
  new URL("../packages/core/src/runs/start-support.ts", import.meta.url),
  "utf-8",
)

describe("task0616 scheduler and run support log redaction", () => {
  it("routes system scheduler exceptions through redaction", () => {
    expect(systemCronSource).toContain("import { createLogger, redactLogText }")
    expect(systemCronSource).toContain("function systemCronErrorMessage")
    expect(systemCronSource).toContain("systemCronErrorMessage(error)")
    expect(systemCronSource).not.toContain(
      "failed to clear stale windows task for schedule ${schedule.id}: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(systemCronSource).not.toContain(
      "failed to clear stale system cron for schedule ${schedule.id}: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(systemCronSource).not.toContain(
      "failed to register system schedule ${scheduleId}: ${error instanceof Error ? error.message : String(error)}",
    )
  })

  it("routes run support maintenance exceptions through redaction", () => {
    expect(startSupportSource).toContain("import { createLogger, redactLogText }")
    expect(startSupportSource).toContain("function startSupportErrorMessage")
    expect(startSupportSource).toContain("startSupportErrorMessage(error)")
    expect(startSupportSource).not.toContain(
      "flash-feedback record failed: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(startSupportSource).not.toContain(
      "memory writeback enqueue failed: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(startSupportSource).not.toContain(
      "session snapshot upsert failed: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(startSupportSource).not.toContain(
      "task continuity upsert failed: ${error instanceof Error ? error.message : String(error)}",
    )
  })
})
