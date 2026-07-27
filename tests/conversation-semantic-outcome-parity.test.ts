import { describe, expect, it } from "vitest"
import {
  validateTelegramWebUiSemanticOutcomeMatrix,
} from "../packages/core/src/channels/semantic-outcome-matrix.ts"
import type {
  ChannelSmokeRunResult,
  ChannelSmokeScenarioKind,
} from "../packages/core/src/channels/smoke-runner.ts"

const KINDS: ChannelSmokeScenarioKind[] = [
  "basic_query",
  "web_skill",
  "approval_required_tool",
  "artifact_delivery",
  "failure_tool",
]

function pairedResults(options: {
  includeReview?: boolean
  telegramSatisfied?: readonly string[]
  telegramReasonCodes?: readonly string[]
  telegramReport?: "delivered" | "blocked" | "failed"
} = {}): ChannelSmokeRunResult[] {
  return KINDS.flatMap((kind) =>
    (["webui", "telegram"] as const).map((channel): ChannelSmokeRunResult => ({
      scenario: {
        id: `${channel}.${kind}`,
        channel,
        kind,
        title: kind,
        request: "not projected",
        expectedTarget: channel,
        correlationKey: channel === "webui" ? "webui_run_id" : "telegram_chat_thread",
        requiresExternalCredential: channel === "telegram",
        releaseGate: "automated",
      },
      status: "passed",
      failures: [],
      trace: {
        sourceChannel: channel,
        semanticOutcome: {
          executionStatus: kind === "failure_tool" ? "exhausted" : "succeeded",
          deliveryStatus: "delivered",
        },
        ...(options.includeReview
          ? {
              semanticReview: {
                requiredCompletionConditionIds: ["condition:answer", "condition:delivery"],
                satisfiedCompletionConditionIds:
                  channel === "telegram" && options.telegramSatisfied
                    ? options.telegramSatisfied
                    : ["condition:answer", "condition:delivery"],
                reasonCodes:
                  channel === "telegram" && options.telegramReasonCodes
                    ? options.telegramReasonCodes
                    : [kind === "failure_tool" ? "paths_exhausted" : "goal_satisfied"],
                terminalReport:
                  channel === "telegram" && options.telegramReport
                    ? options.telegramReport
                    : "delivered",
                evidenceRefs: [`evidence:${kind}`],
              },
            }
          : {}),
      },
    })),
  )
}

describe("conversation semantic outcome parity", () => {
  it("rejects broad status parity without structured completion review", () => {
    const result = validateTelegramWebUiSemanticOutcomeMatrix(pairedResults())

    expect(result.status).toBe("failed")
    expect(result.failures).toContain("semantic_review_missing:webui:basic_query")
    expect(JSON.stringify(result)).not.toContain("not projected")
  })

  it("passes complete paired semantic evidence", () => {
    expect(validateTelegramWebUiSemanticOutcomeMatrix(
      pairedResults({ includeReview: true }),
    )).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it.each([
    {
      name: "completion coverage",
      options: {
        includeReview: true,
        telegramSatisfied: ["condition:answer"],
      },
      failure: "semantic_outcome_mismatch:basic_query:completion_coverage",
    },
    {
      name: "reason codes",
      options: {
        includeReview: true,
        telegramReasonCodes: ["transport_succeeded_only"],
      },
      failure: "semantic_outcome_mismatch:basic_query:reason_codes",
    },
    {
      name: "terminal report",
      options: {
        includeReview: true,
        telegramReport: "failed" as const,
      },
      failure: "semantic_outcome_mismatch:basic_query:terminal_report",
    },
  ])("fails paired $name drift", ({ options, failure }) => {
    const result = validateTelegramWebUiSemanticOutcomeMatrix(pairedResults(options))
    expect(result.status).toBe("failed")
    expect(result.failures).toContain(failure)
  })
})
