import { describe, expect, it } from "vitest"
import {
  projectControlEventForWebUi,
  projectOrchestrationEventForWebUi,
} from "../packages/core/src/api/ws/stream.ts"

describe("task0358 WebUI diagnostic event redaction", () => {
  it("redacts control.event detail before WebUI transport", () => {
    const localPath = "/Users/demo/.knowbee/private/control-trace.json"
    const secret = "sk-task0358-control-secret-value-1234567890"

    const payload = projectControlEventForWebUi({
      id: "control-task0358",
      at: 123,
      eventType: "tool.failed",
      correlationId: "corr-task0358",
      runId: "run-task0358",
      requestGroupId: "group-task0358",
      sessionKey: "session-task0358",
      component: "tool.dispatcher",
      severity: "warning",
      summary: `Tool failed near ${localPath}`,
      detail: {
        apiKey: secret,
        outputPath: localPath,
        rawHtml: "<html><body>debug trace</body></html>",
      },
    })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("control.event")
    expect(payload.id).toBe("control-task0358")
    expect(payload.correlationId).toBe("corr-task0358")
    expect(payload.severity).toBe("warning")
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).not.toContain("<html")
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("[redacted-raw-payload]")
    expect(serialized).toContain("artifact:")
  })

  it("redacts orchestration.event payloads and hides raw payload refs before WebUI transport", () => {
    const localPath = "/private/var/folders/task0358/orchestration-raw.json"
    const secret = "sk-task0358-orchestration-secret-value-1234567890"

    const payload = projectOrchestrationEventForWebUi({
      sequence: 7,
      cursor: "7",
      id: "orchestration-task0358",
      createdAt: 100,
      emittedAt: 101,
      eventKind: "data_exchange_created",
      runId: "run-task0358",
      parentRunId: null,
      requestGroupId: "group-task0358",
      subSessionId: null,
      agentId: "agent-task0358",
      teamId: null,
      exchangeId: "exchange-task0358",
      approvalId: null,
      correlationId: "corr-task0358",
      dedupeKey: null,
      source: "test",
      severity: "info",
      summary: `Data exchange created at ${localPath}`,
      payload: {
        token: secret,
        filePath: localPath,
        providerRawResponse: "<html><body>raw provider body</body></html>",
        visible: "redacted view",
      },
      payloadRawRef: "raw-payload://task0358-private-ref",
      producerTask: "task0358",
    })
    const serialized = JSON.stringify(payload)

    expect(payload.type).toBe("orchestration.event")
    expect(payload.id).toBe("orchestration-task0358")
    expect(payload.eventKind).toBe("data_exchange_created")
    expect(payload.payloadRawRef).toBe("[redacted-raw-payload-ref]")
    expect(payload.payload.visible).toBe("redacted view")
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).not.toContain("<html")
    expect(serialized).not.toContain("raw-payload://task0358-private-ref")
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("[redacted-raw-payload]")
    expect(serialized).toContain("artifact:")
  })
})
