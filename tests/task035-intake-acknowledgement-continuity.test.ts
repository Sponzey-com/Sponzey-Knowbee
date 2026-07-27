import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { startIngressRun } from "../packages/core/src/runs/ingress.ts"
import { deliverIntakeAcknowledgementControl } from "../packages/core/src/channels/intake-acknowledgement-control.ts"

describe("task035 intake acknowledgement continuity", () => {
  it("starts canonical execution before acknowledgement delivery and preserves it on delivery failure", async () => {
    const events: string[] = []
    const finished = Promise.resolve(undefined)
    const started = startIngressRun({
      artifactStorage: {} as never,
      memoryJournal: {} as never,
      hierarchyStorage: {} as never,
      config: DEFAULT_CONFIG,
      runId: "run-task035",
      message: "SK 하이닉스의 현재 주가를 확인해줘",
      sessionId: "session-task035",
      source: "telegram",
      model: undefined,
    }, {
      startRootRun: (params) => {
        events.push("execution_started")
        return {
          runId: params.runId ?? "unexpected-run",
          sessionId: params.sessionId ?? "unexpected-session",
          status: "started",
          finished,
        }
      },
    })

    const delivery = await deliverIntakeAcknowledgementControl({
      control: started.acknowledgement,
      deliver: vi.fn(async () => {
        events.push("acknowledgement_delivery_attempted")
        throw new Error("telegram unavailable")
      }),
    })

    expect(events).toEqual(["execution_started", "acknowledgement_delivery_attempted"])
    expect(started.started.status).toBe("started")
    expect(started.started.finished).toBe(finished)
    expect(delivery).toEqual({ status: "failed" })
  })

  it("keeps CLI, WebUI, Slack, and Telegram on the same acknowledgement contract", () => {
    const cases = [
      { source: "cli" as const, message: "check status", language: "en" },
      { source: "webui" as const, message: "상태 확인", language: "ko" },
      { source: "slack" as const, message: "check status", language: "en" },
      { source: "telegram" as const, message: "상태 확인", language: "ko" },
    ]

    for (const item of cases) {
      const ingress = startIngressRun({
        artifactStorage: {} as never,
        memoryJournal: {} as never,
        hierarchyStorage: {} as never,
        config: DEFAULT_CONFIG,
        runId: `run-${item.source}`,
        message: item.message,
        sessionId: `session-${item.source}`,
        source: item.source,
        model: undefined,
      }, {
        startRootRun: (params) => ({
          runId: params.runId ?? "unexpected-run",
          sessionId: params.sessionId ?? "unexpected-session",
          status: "started",
          finished: Promise.resolve(undefined),
        }),
      })

      expect(ingress.acknowledgement).toEqual({
        kind: "intake_acknowledgement",
        state: "request_received",
        language: item.language,
        deliveryMode: "interactive_control",
        finalAnswer: false,
        assistantIdentityClaim: false,
      })
    }
  })
})
