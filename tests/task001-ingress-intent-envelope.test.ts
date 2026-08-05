import { describe, expect, it } from "vitest"
import { buildIngressAcknowledgement, buildIngressDedupeKey, resolveIngressStartParams } from "../packages/core/src/runs/ingress.ts"

describe("task001 ingress and intent envelope", () => {
  it("builds an immediate ingress receipt without interpreting the task", () => {
    expect(buildIngressAcknowledgement("화면 캡처해서 보여줘")).toEqual({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "ko",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })

    expect(buildIngressAcknowledgement("capture the main display")).toEqual({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "en",
      deliveryMode: "interactive_control",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("resolves request identity in ingress before the run loop starts", () => {
    const resolved = resolveIngressStartParams({
      message: "hello",
      sessionId: undefined,
      source: "cli",
      model: undefined,
    })

    expect(resolved.runId).toBeTypeOf("string")
    expect(resolved.sessionId).toBeTypeOf("string")
    expect(resolved.message).toBe("hello")
    expect(resolved.source).toBe("cli")
  })

  it("preserves explicit identifiers when ingress params already include them", () => {
    const resolved = resolveIngressStartParams({
      runId: "run-123",
      message: "hello",
      sessionId: "session-123",
      source: "telegram",
      model: undefined,
    })

    expect(resolved.runId).toBe("run-123")
    expect(resolved.sessionId).toBe("session-123")
  })

  it("builds a stable ingress dedupe key from channel identity", () => {
    expect(buildIngressDedupeKey({
      source: "slack",
      sessionId: "slack:C123:T456",
      externalChatId: "C123",
      externalThreadId: "T456",
      externalMessageId: "M789",
    })).toBe("slack:slack:C123:T456:C123:T456:M789")
  })

})
