import { describe, expect, it } from "vitest"
import { projectScheduleEventForWebUi } from "../packages/core/src/api/ws/stream.ts"

describe("task0359 WebUI schedule event redaction", () => {
  it("redacts schedule.created task fields before WebUI transport", () => {
    const localPath = "/Users/demo/.knowbee/private/schedule-input.md"
    const secret = "sk-task0359-schedule-secret-value-1234567890"

    const payload = projectScheduleEventForWebUi("schedule.created", {
      runId: "run-task0359",
      requestGroupId: "group-task0359",
      registrationKind: "recurring" as const,
      title: `Read ${localPath}`,
      task: `Fetch ${localPath} with Bearer ${secret}`,
      source: "webui" as const,
      scheduleText: "<html><body>every minute</body></html>",
      scheduleId: "schedule-task0359",
      cron: "* * * * *",
      targetSessionId: "session-task0359",
      driver: "node",
    })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("schedule.created")
    expect(payload.runId).toBe("run-task0359")
    expect(payload.scheduleId).toBe("schedule-task0359")
    expect(payload.cron).toBe("* * * * *")
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).not.toContain("<html")
    expect(serialized).toContain("Bearer ***")
    expect(serialized).toContain("[redacted-raw-payload]")
    expect(serialized).toContain("artifact:")
  })

  it("redacts schedule.run.failed error fields before WebUI transport", () => {
    const localPath = "/private/var/folders/task0359/schedule-error.log"
    const secret = "sk-task0359-error-secret-value-1234567890"

    const payload = projectScheduleEventForWebUi("schedule.run.failed", {
      scheduleId: "schedule-task0359",
      scheduleRunId: "schedule-run-task0359",
      runId: "run-task0359",
      scheduleName: `Failure at ${localPath}`,
      targetChannel: "webui",
      targetSessionId: "session-task0359",
      originRunId: "origin-task0359",
      originRequestGroupId: "group-task0359",
      trigger: "cron",
      error: `Command failed at ${localPath} with ${secret}`,
      attempts: 2,
    })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("schedule.run.failed")
    expect(payload.scheduleId).toBe("schedule-task0359")
    expect(payload.scheduleRunId).toBe("schedule-run-task0359")
    expect(payload.attempts).toBe(2)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("artifact:")
  })
})
