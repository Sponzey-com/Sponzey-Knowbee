import { describe, expect, it } from "vitest"
import {
  validateTelegramWebUiSemanticOutcomeMatrix,
} from "../packages/core/src/channels/semantic-outcome-matrix.ts"
import type {
  ChannelSmokeRunResult,
  ChannelSmokeScenario,
} from "../packages/core/src/channels/smoke-runner.ts"

const KINDS: ChannelSmokeScenario["kind"][] = [
  "basic_query",
  "approval_required_tool",
  "artifact_delivery",
  "failure_tool",
  "web_skill",
]

function result(
  channel: "telegram" | "webui",
  kind: ChannelSmokeScenario["kind"],
  overrides: Partial<ChannelSmokeRunResult> = {},
): ChannelSmokeRunResult {
  const failure = kind === "failure_tool"
  return {
    scenario: {
      id: `${channel}.${kind}`,
      channel,
      kind,
      title: kind,
      request: "redacted from matrix output",
      expectedTarget: channel,
      correlationKey: channel === "telegram" ? "telegram_chat_thread" : "webui_run_id",
      requiresExternalCredential: channel === "telegram",
      releaseGate: "automated",
    },
    status: "passed",
    failures: [],
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      semanticOutcome: {
        executionStatus: failure ? "exhausted" : "succeeded",
        deliveryStatus: "delivered",
      },
      semanticReview: {
        requiredCompletionConditionIds: ["condition:answer", "condition:delivery"],
        satisfiedCompletionConditionIds: ["condition:answer", "condition:delivery"],
        reasonCodes: [failure ? "paths_exhausted" : "goal_satisfied"],
        terminalReport: "delivered",
        evidenceRefs: [`evidence:${kind}`],
      },
    },
    ...overrides,
  }
}

function completeMatrix(): ChannelSmokeRunResult[] {
  return KINDS.flatMap((kind) => [
    result("webui", kind),
    result("telegram", kind),
  ])
}

describe("Task 034 channel semantic outcome matrix", () => {
  it("passes only when every Telegram/WebUI scenario pair has the same semantic outcome", () => {
    expect(validateTelegramWebUiSemanticOutcomeMatrix(completeMatrix())).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it.each([
    {
      name: "missing scenario",
      mutate: (items: ChannelSmokeRunResult[]) => items.slice(1),
      failure: "scenario_missing:webui:basic_query",
    },
    {
      name: "duplicate scenario",
      mutate: (items: ChannelSmokeRunResult[]) => [...items, items[0]!],
      failure: "scenario_duplicate:webui:basic_query",
    },
    {
      name: "failed smoke result",
      mutate: (items: ChannelSmokeRunResult[]) =>
        items.map((item) =>
          item.scenario.id === "telegram.artifact_delivery"
            ? { ...item, status: "failed" as const }
            : item,
        ),
      failure: "scenario_result_not_passed:telegram:artifact_delivery",
    },
    {
      name: "missing semantic outcome",
      mutate: (items: ChannelSmokeRunResult[]) =>
        items.map((item) =>
          item.scenario.id === "webui.basic_query"
            ? { ...item, trace: { sourceChannel: "webui" as const } }
            : item,
        ),
      failure: "semantic_outcome_missing:webui:basic_query",
    },
    {
      name: "execution mismatch",
      mutate: (items: ChannelSmokeRunResult[]) =>
        items.map((item) =>
          item.scenario.id === "telegram.basic_query"
            ? {
                ...item,
                trace: {
                  ...item.trace!,
                  semanticOutcome: {
                    executionStatus: "blocked" as const,
                    deliveryStatus: "delivered" as const,
                  },
                },
              }
            : item,
        ),
      failure: "semantic_outcome_mismatch:basic_query:execution",
    },
    {
      name: "delivery mismatch",
      mutate: (items: ChannelSmokeRunResult[]) =>
        items.map((item) =>
          item.scenario.id === "telegram.basic_query"
            ? {
                ...item,
                trace: {
                  ...item.trace!,
                  semanticOutcome: {
                    executionStatus: "succeeded" as const,
                    deliveryStatus: "failed" as const,
                  },
                },
              }
            : item,
        ),
      failure: "semantic_outcome_mismatch:basic_query:delivery",
    },
  ])("fails for $name without projecting request text", ({ mutate, failure }) => {
    const result = validateTelegramWebUiSemanticOutcomeMatrix(mutate(completeMatrix()))
    expect(result.status).toBe("failed")
    expect(result.failures).toContain(failure)
    expect(JSON.stringify(result)).not.toContain("redacted from matrix output")
  })
})
