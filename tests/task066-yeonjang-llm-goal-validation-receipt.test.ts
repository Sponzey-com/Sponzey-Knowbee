import { describe, expect, it } from "vitest"
import { buildCompletionReviewEvidenceBlock } from "../packages/core/src/agent/completion-review.ts"
import type { ToolResult } from "../packages/core/src/tools/types.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"
import { admitYeonjangEvidenceForReview } from "../packages/core/src/yeonjang/evidence-admission.ts"

const yeonjangEvidenceSource = {
  sourceKind: "yeonjang",
  sourceRef: `tool-result:yeonjang:${"c".repeat(64)}`,
  trustClass: "untrusted_external",
  instructionIsolation: "data_only",
} as const

function resultWithEvidence(evidence: unknown): ToolResult {
  return {
    success: true,
    output: "command accepted",
    details: {
      via: "yeonjang",
      rawUiTree: "do-not-project",
      evidence,
    },
    evidenceSource: yeonjangEvidenceSource,
  }
}

describe("Task 066 Yeonjang LLM goal validation receipt", () => {
  it("keeps unverifiable mouse side-effect evidence out of completion review", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "mouse_click",
      methodIds: ["mouse.click"],
      group: "input",
      riskLevel: "moderate",
      requiresApproval: true,
      summary: "mouse click command accepted but user goal still requires diagnosis",
      postCheck: { kind: "unverifiable", verified: false, reason: "llm_goal_validation_required" },
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "mouse_click",
    })

    expect(decision).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_POST_CHECK_UNVERIFIED",
    })
  })

  it("admits mouse side-effect evidence after result diagnosis receipt validates the user goal", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "mouse_click",
      methodIds: ["mouse.click"],
      group: "input",
      riskLevel: "moderate",
      requiresApproval: true,
      summary: "mouse click command accepted and goal validated by result diagnosis",
      postCheck: buildYeonjangGoalValidatedPostCheck({
        diagnosisReceiptId: "diagnosis:work-066:step-click:result",
        diagnosisSubjectKind: "tool_result",
        evidenceRefs: ["operation-evidence:post-state:cursor"],
      }),
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "mouse_click",
    })

    expect(decision).toMatchObject({
      status: "admitted",
      evidence,
    })

    const block = buildCompletionReviewEvidenceBlock([
      {
        toolName: "mouse_click",
        output: "command accepted",
        details: {
          via: "yeonjang",
          rawUiTree: "do-not-project",
          evidence,
        },
        evidenceSource: yeonjangEvidenceSource,
      },
    ])

    expect(block).toContain("yeonjang_evidence")
    expect(block).toContain("mouse.click")
    expect(block).toContain("goal_validated")
    expect(block).not.toContain("rawUiTree")
    expect(block).not.toContain("do-not-project")
  })
})
