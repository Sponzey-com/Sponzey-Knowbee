import { describe, expect, it } from "vitest"
import {
  projectApprovalRequestForWebUi,
  projectToolBeforeForWebUi,
} from "../packages/core/src/api/ws/stream.ts"

describe("task0356 WebUI websocket params redaction", () => {
  it("redacts tool.before params before WebUI transport", () => {
    const localPath = "/Users/demo/.knowbee/private/tool-output.json"
    const secret = "sk-task0356-tool-secret-value-1234567890"

    const payload = projectToolBeforeForWebUi({
      sessionId: "session-task0356",
      runId: "run-task0356",
      requestGroupId: "group-task0356",
      toolName: "local_shell",
      params: {
        apiKey: secret,
        command: `cat ${localPath}`,
        nested: {
          authorization: `Bearer ${secret}`,
          providerRawResponse: "<html><body>secret body</body></html>",
        },
      },
    })

    const serialized = JSON.stringify(payload)
    expect(payload.type).toBe("tool.before")
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).not.toContain("<html")
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("[redacted-raw-payload]")
  })

  it("redacts approval.request params and guidance before WebUI transport", () => {
    const localPath = "/private/var/folders/task0356/approval/input.json"
    const secret = "sk-task0356-approval-secret-value-1234567890"

    const payload = projectApprovalRequestForWebUi({
      approvalId: "approval-task0356",
      runId: "run-task0356",
      toolName: "file_write",
      params: {
        path: localPath,
        token: secret,
        body: `Bearer ${secret}`,
      },
      kind: "approval",
      guidance: `Write ${localPath} with Bearer ${secret}`,
      expiresAt: 12345,
    })

    const serialized = JSON.stringify(payload)
    expect(payload.type).toBe("approval.request")
    expect(payload.approvalId).toBe("approval-task0356")
    expect(payload.runId).toBe("run-task0356")
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
    expect(serialized).toContain("***MASKED***")
    expect(serialized).toContain("artifact:")
  })

  it("redacts Yeonjang internal evidence from tool.before params before WebUI transport", () => {
    const payload = projectToolBeforeForWebUi({
      sessionId: "session-task0356-yeonjang",
      runId: "run-task0356-yeonjang",
      requestGroupId: "group-task0356-yeonjang",
      toolName: "mouse_click",
      params: {
        evidence:
          "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:ws-tool-before receipt payload raw observed state",
      },
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:ws-tool-before")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
  })
})
