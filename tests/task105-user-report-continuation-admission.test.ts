import { describe, expect, it } from "vitest"
import {
  buildBlockedUserReport,
  buildSuccessUserReport,
  decideUserResponseAction,
} from "../packages/core/src/contracts/user-report-continuation-admission.ts"

describe("Task 105 user report and continuation admission", () => {
  it("builds success from actual results and necessary public evidence only", () => {
    expect(
      buildSuccessUserReport({
        actualResults: ["SK hynix current price is 312,000 KRW."],
        evidenceSummaries: ["KRX quote observed at 2026-07-17 15:20 KST."],
      }),
    ).toEqual({
      status: "completed",
      actualResults: ["SK hynix current price is 312,000 KRW."],
      evidenceSummaries: ["KRX quote observed at 2026-07-17 15:20 KST."],
    })
  })

  it("rejects unsupported or internal success-report details", () => {
    expect(() =>
      buildSuccessUserReport({
        actualResults: ["work:103 completed by diagnosis receipt"],
        evidenceSummaries: ["receipt:internal:1"],
      }),
    ).toThrow(/internal or unsupported detail/i)
  })

  it("builds a concise blocked report with unfinished work, cause, paths, and one next action", () => {
    expect(
      buildBlockedUserReport({
        unfinishedItems: ["Save the generated report."],
        directCause: {
          text: "File-write permission was denied.",
          evidenceSummaries: ["The operating system denied the write request."],
        },
        attemptedPaths: [
          {
            pathId: "tool",
            strategyFingerprint: "strategy:file-write:v1",
            outcome: "permission_denied",
          },
          {
            pathId: "yeonjang",
            strategyFingerprint: "strategy:remote-write:v2",
            outcome: "connection_unavailable",
          },
        ],
        nextAction: {
          kind: "minimum_user_input",
          text: "Grant file-write permission.",
        },
      }),
    ).toMatchObject({
      status: "blocked",
      unfinishedItems: ["Save the generated report."],
      directCause: { text: "File-write permission was denied." },
      attemptedPaths: [{ pathId: "tool" }, { pathId: "yeonjang" }],
      nextAction: { kind: "minimum_user_input", text: "Grant file-write permission." },
    })
  })

  it("rejects duplicate path strategies and missing blocked-report facts", () => {
    expect(() =>
      buildBlockedUserReport({
        unfinishedItems: [],
        directCause: { text: "Unknown.", evidenceSummaries: [] },
        attemptedPaths: [
          { pathId: "tool", strategyFingerprint: "same", outcome: "failed" },
          { pathId: "api", strategyFingerprint: "same", outcome: "failed" },
        ],
        nextAction: { kind: "executable_next_method", text: "Use the API." },
      }),
    ).toThrow(/unfinished|evidence|distinct/i)
  })

  it("continues immediately when an executable candidate remains", () => {
    expect(
      decideUserResponseAction({
        continuationDecision: {
          status: "continue",
          viableCandidateIds: ["candidate:official-api"],
        },
        clarificationRequired: true,
        exhaustionAuthorized: true,
      }),
    ).toEqual({ status: "continue_now", candidateId: "candidate:official-api" })
  })

  it("requests input or reports blocked only when continuation is unavailable", () => {
    const noCandidate = {
      status: "reassess" as const,
      reason: "no_viable_changed_candidate" as const,
      scope: {
        kind: "current_runtime_snapshot" as const,
        workId: "work:105",
        evaluatedCandidateIds: [],
      },
      excludedCandidates: [],
    }
    expect(
      decideUserResponseAction({
        continuationDecision: noCandidate,
        clarificationRequired: true,
        exhaustionAuthorized: false,
      }),
    ).toEqual({ status: "request_user_input" })
    expect(
      decideUserResponseAction({
        continuationDecision: noCandidate,
        clarificationRequired: false,
        exhaustionAuthorized: true,
      }),
    ).toEqual({ status: "report_blocked" })
  })
})
