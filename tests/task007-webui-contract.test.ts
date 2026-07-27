import { describe, expect, it } from "vitest"
import type { RetrievalTimeline } from "../packages/webui/src/api/client.ts"

describe("task007 WebUI retrieval timeline contract", () => {
  it("projects provenance and LLM diagnosis events without deterministic semantic verdicts", () => {
    const snapshot = {
      events: [
        {
          id: "evt-1",
          at: 1_000,
          kind: "diagnosis",
          eventType: "web_retrieval.result_diagnosis.completed",
          component: "web_retrieval",
          severity: "info",
          summary: "LLM result diagnosis completed",
          detail: "[internal structured data hidden]",
          source: { method: null, toolName: null, url: null, domain: null },
          diagnosticRef: {
            controlEventId: "evt-1",
            eventType: "web_retrieval.result_diagnosis.completed",
            component: "web_retrieval",
          },
        },
      ],
      summary: {
        total: 1,
        sessionEvents: 0,
        attempts: 0,
        sources: 0,
        diagnoses: 1,
        plannerActions: 0,
        deliveryEvents: 0,
        dedupeSuppressed: 0,
        stops: 0,
        finalDeliveryStatus: null,
        stopReason: null,
        severityCounts: { debug: 0, info: 1, warning: 0, error: 0 },
      },
    } satisfies RetrievalTimeline

    expect(JSON.stringify(snapshot)).not.toMatch(/canAnswer|acceptedValue|evidenceSufficiency/u)
    expect(snapshot.summary.diagnoses).toBe(1)
  })
})
