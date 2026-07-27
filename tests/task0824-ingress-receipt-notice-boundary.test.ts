import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import {
  buildIngressAcknowledgement,
} from "../packages/core/src/runs/ingress.ts"
import {
  deliverIntakeAcknowledgementControl,
  renderIntakeAcknowledgementControl,
} from "../packages/core/src/channels/intake-acknowledgement-control.ts"

describe("task0824 ingress acknowledgement control boundary", () => {
  it("represents receipt state without user request text or analysis claims", () => {
    const control = buildIngressAcknowledgement("상태 확인해줘")

    expect(control).toEqual({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "ko",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
    expect(control).not.toHaveProperty("text")
    expect(renderIntakeAcknowledgementControl(control)).toBe("요청 접수")
  })

  it("contains acknowledgement delivery failures without failing the active run", async () => {
    const onFailure = vi.fn()
    const result = await deliverIntakeAcknowledgementControl({
      control: buildIngressAcknowledgement("check status"),
      deliver: vi.fn().mockRejectedValue(new Error("channel unavailable")),
      onFailure,
    })

    expect(result).toEqual({ status: "failed" })
    expect(onFailure).toHaveBeenCalledOnce()
  })

  it("does not add WebUI acknowledgement metadata as an assistant message", () => {
    const source = readFileSync("packages/webui/src/pages/ChatPage.tsx", "utf8")

    expect(source).not.toContain("response.receipt")
    expect(source).not.toMatch(/addAssistantMessage\s*\(\s*response\./)
  })
})
