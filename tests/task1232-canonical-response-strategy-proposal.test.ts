import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildCanonicalResponseStrategyProposal,
  buildResponseStrategyImprovementIntake,
  RESPONSE_STRATEGY_CANONICAL_MODULES,
  type ResponseEvidenceSignal,
  type ResponseStrategyCanonicalModule,
  type ResponseStrategyCategory,
  type ResponseStrategyImprovementIntake,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 14, 0, 0)

function signal(kind: ResponseEvidenceSignal["kind"], suffix = "1"): ResponseEvidenceSignal {
  return {
    kind,
    interactionReceiptRef: `interaction:${kind}:${suffix}`,
    observedBehavior: "현재 동작",
    expectedBehavior: "기대 동작",
    occurrenceCount: 2,
    windowStartedAt: now - 1_000,
    windowEndedAt: now,
  }
}

function intake(category: ResponseStrategyCategory, evidence = [signal("repeated_failure")]): ResponseStrategyImprovementIntake {
  const target = "prompt:owned"
  const decision = buildResponseStrategyImprovementIntake({
    agent: { agentId: "agent:main", agentName: "마당쇠", agentType: "main" },
    ownedPromptSourceRefs: [target],
    ownershipSnapshotFingerprint: "ownership:v1",
    trigger: { triggerId: "trigger:1", source: "explicit_user_request", targetAgentId: "agent:main", requestedPromptSourceRefs: [target] },
    evidence,
    candidate: {
      category,
      targetPromptSourceRef: target,
      currentBehavior: "현재 동작",
      desiredBehavior: "기대 동작",
      successCriterion: "회귀 테스트가 통과한다.",
      evidenceReceiptRefs: evidence.map((item) => item.interactionReceiptRef),
    },
  })
  if (decision.status !== "ready") throw new Error("expected ready intake")
  return decision.intake
}

function proposalInput(category: ResponseStrategyCategory, targetModule: ResponseStrategyCanonicalModule) {
  return {
    intake: intake(category),
    targetModules: [targetModule],
    changePurpose: "반복 실패 뒤 허용된 해결 경로를 선택하게 한다.",
    exactScope: `rule:${category}.selection`,
    evidenceReceiptRefs: ["interaction:repeated_failure:1"],
    validationCriteria: [{ inputCondition: "첫 실행이 실패한다", expectedResult: "대체 경로를 검토한다", passCondition: "허용 후보가 기록된다" }],
  }
}

describe("task1232 canonical response-strategy proposal", () => {
  it("defines only the five GOAL canonical response modules", () => {
    expect(RESPONSE_STRATEGY_CANONICAL_MODULES).toEqual([
      "prompts/task_intake.md", "prompts/workflow.md", "prompts/sub_agent_delegation.md",
      "prompts/result_review.md", "prompts/final_response.md",
    ])
  })

  it.each([
    ["request_analysis", "prompts/task_intake.md"],
    ["clarification", "prompts/task_intake.md"],
    ["solution_path", "prompts/workflow.md"],
    ["next_action", "prompts/result_review.md"],
    ["delegation", "prompts/sub_agent_delegation.md"],
  ] as const)("maps %s to its single canonical owner", (category, targetModule) => {
    expect(buildCanonicalResponseStrategyProposal(proposalInput(category, targetModule))).toMatchObject({
      status: "ready", proposal: { strategyCategory: category, targetModule },
    })
  })

  it("requires failure-report purpose and selects review or final wording ownership", () => {
    expect(buildCanonicalResponseStrategyProposal(proposalInput("failure_report", "prompts/result_review.md"))).toEqual({
      status: "rejected", reasonCode: "failure_report_purpose_required",
    })
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("failure_report", "prompts/result_review.md"), failureReportPurpose: "result_review",
    })).toMatchObject({ status: "ready", proposal: { targetModule: "prompts/result_review.md" } })
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("failure_report", "prompts/final_response.md"), failureReportPurpose: "user_output",
    })).toMatchObject({ status: "ready", proposal: { targetModule: "prompts/final_response.md" } })
  })

  it("projects one exact module plus evidence, purpose, scope, and executable validation", () => {
    const decision = buildCanonicalResponseStrategyProposal(proposalInput("solution_path", "prompts/workflow.md"))
    if (decision.status !== "ready") throw new Error("expected ready proposal")
    expect(decision.proposal).toMatchObject({
      changePurpose: expect.any(String), exactScope: "rule:solution_path.selection",
      evidenceReceiptRefs: ["interaction:repeated_failure:1"],
      harnessProjection: {
        targetPromptSources: ["prompts/workflow.md"], allowedChangeScope: ["prompts/workflow.md"],
        requiredTests: [expect.stringContaining("pass=")],
      },
    })
  })

  it("rejects multiple modules, the wrong owner, and broad or untyped scope", () => {
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"),
      targetModules: ["prompts/workflow.md", "prompts/final_response.md"],
    })).toEqual({ status: "rejected", reasonCode: "canonical_module_mismatch" })
    expect(buildCanonicalResponseStrategyProposal(proposalInput("delegation", "prompts/workflow.md"))).toEqual({
      status: "rejected", reasonCode: "canonical_module_mismatch",
    })
    for (const exactScope of ["global response", "all", "make it better"]) {
      expect(buildCanonicalResponseStrategyProposal({
        ...proposalInput("solution_path", "prompts/workflow.md"), exactScope,
      })).toEqual({ status: "rejected", reasonCode: "broad_scope_rejected" })
    }
  })

  it("requires proposal evidence to be present in the reviewed intake", () => {
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"), evidenceReceiptRefs: ["interaction:unknown:1"],
    })).toEqual({ status: "rejected", reasonCode: "evidence_not_in_intake" })
  })

  it("rejects one emotional interaction but accepts two independent repeated receipts", () => {
    const one = signal("dissatisfaction")
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"),
      intake: intake("solution_path", [one]), evidenceReceiptRefs: [one.interactionReceiptRef],
    })).toEqual({ status: "rejected", reasonCode: "one_off_emotion_global_change" })
    const two = [signal("dissatisfaction", "1"), signal("dissatisfaction", "2")]
    expect(buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"),
      intake: intake("solution_path", two), evidenceReceiptRefs: two.map((item) => item.interactionReceiptRef),
    }).status).toBe("ready")
  })

  it("requires a purpose and fully executable validation criteria", () => {
    expect(() => buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"), changePurpose: "",
    })).toThrow(/change purpose is required/i)
    expect(() => buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"), validationCriteria: [],
    })).toThrow(/validation criterion/i)
    expect(() => buildCanonicalResponseStrategyProposal({
      ...proposalInput("solution_path", "prompts/workflow.md"),
      validationCriteria: [{ inputCondition: "", expectedResult: "결과", passCondition: "통과" }],
    })).toThrow(/input condition is required/i)
  })

  it("keeps proposal selection independent from prompts, files, storage, and external state", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/canonical-response-strategy-proposal.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
