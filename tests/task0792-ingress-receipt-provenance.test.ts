import { describe, expect, it } from "vitest"
import { buildIngressAcknowledgement } from "../packages/core/src/runs/ingress.ts"

describe("task0792 ingress receipt provenance boundary", () => {
  it("marks Korean ingress receipt as a control notice, not a final answer", () => {
    expect(buildIngressAcknowledgement("상태 확인해줘")).toEqual({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "ko",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("marks English ingress receipt with the same provenance metadata", () => {
    expect(buildIngressAcknowledgement("check status")).toEqual({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "en",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
