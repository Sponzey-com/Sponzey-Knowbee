import { describe, expect, it } from "vitest"
import {
  buildApprovalRequestControl,
  buildToolStatusControl,
  renderApprovalRequestControlText,
  renderToolStatusControlText,
} from "../packages/core/src/channels/interactive-control.ts"

describe("interactive control contract", () => {
  it("renders approval controls without internal IDs, params, or secrets", () => {
    const control = buildApprovalRequestControl({
      runRef: "run:secret-internal",
      language: "ko",
      items: [{
        approvalRef: "approval:internal",
        toolLabel: "screen_capture",
        kind: "approval",
      }],
    })
    const text = renderApprovalRequestControlText(control, "telegram")

    expect(control).toMatchObject({
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
      actions: ["allow_run", "allow_once", "deny"],
    })
    expect(text).toContain("screen_capture")
    expect(text).not.toContain("run:secret-internal")
    expect(text).not.toContain("approval:internal")
  })

  it("projects the same tool state for Slack and Telegram", () => {
    const control = buildToolStatusControl({
      toolLabel: "web_fetch",
      status: "succeeded",
      language: "en",
    })

    expect(control).toMatchObject({
      kind: "tool_status_control",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
      status: "succeeded",
    })
    expect(renderToolStatusControlText(control, "slack")).toBe("Done: web_fetch")
    expect(renderToolStatusControlText(control, "telegram")).toBe("✅ `web_fetch` done")
  })
})
