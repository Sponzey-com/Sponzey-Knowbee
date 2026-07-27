import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createYeonjangLiveTransportAdapter } from "../packages/core/src/runs/yeonjang-live-transport-adapter.ts"
import type { YeonjangLiveSmokeSelection } from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const RUN_ID = "yeonjang-run:029"

function selection(method: "camera.list" | "system.info" = "camera.list"): YeonjangLiveSmokeSelection {
  return {
    scenario: {
      id: `office-mac-${method.replaceAll(".", "-")}`,
      expectedInstanceId: "instance:office-mac",
      expectedSessionId: "session:office-mac:29",
      expectedMethod: method,
      readOnly: true,
    },
    instance: {
      instanceId: "instance:office-mac",
      publicName: "Office Mac",
      sessionId: "session:office-mac:29",
      status: "connected",
      observedAt: 1,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    },
  }
}

describe("Task 029 Yeonjang live transport method dispatch", () => {
  it("dispatches the scenario read-only method instead of hard-coded system.info", async () => {
    const auditEvents: unknown[] = []
    const invoke = vi.fn(async () => ({ devices: [] }))
    const adapter = createYeonjangLiveTransportAdapter({
      invoke,
      timeoutMs: 5_000,
      createCommandId: () => "command:029",
      createAuditCorrelationId: () => "audit-correlation:029",
      recordAuditEvent(event) {
        auditEvents.push(event)
        return "audit:yeonjang:029"
      },
    })

    const result = await adapter({
      runId: RUN_ID,
      selection: selection("camera.list"),
      signal: new AbortController().signal,
    })

    expect(invoke).toHaveBeenCalledWith(
      "camera.list",
      {},
      expect.objectContaining({
        extensionId: "instance:office-mac",
        metadata: expect.objectContaining({
          runId: RUN_ID,
          targetSessionId: "session:office-mac:29",
          commandId: "command:029",
        }),
      }),
    )
    expect(result.command?.method).toBe("camera.list")
    expect(auditEvents).toContainEqual(expect.objectContaining({ method: "camera.list" }))
  })

  it("keeps adapter source free of a hard-coded system.info invoke", () => {
    const source = readFileSync(
      "packages/core/src/runs/yeonjang-live-transport-adapter.ts",
      "utf8",
    )

    expect(source).toContain("scenario.expectedMethod")
    expect(source).not.toContain('input.invoke(\n      "system.info"')
  })
})
