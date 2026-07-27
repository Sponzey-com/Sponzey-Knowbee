import { describe, expect, it } from "vitest"
import type { ToolResult } from "../packages/core/src/tools/types.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"
import { admitYeonjangEvidenceForReview } from "../packages/core/src/yeonjang/evidence-admission.ts"

function resultWithEvidence(evidence: unknown): ToolResult {
  return {
    success: true,
    output: "ok",
    details: {
      evidence,
    },
  }
}

describe("task016 Yeonjang evidence review admission", () => {
  it("rejects a Yeonjang result without normalized evidence", () => {
    const decision = admitYeonjangEvidenceForReview({
      result: { success: true, output: "tool succeeded", details: { via: "yeonjang" } },
      expectedToolName: "yeonjang_file_metadata",
    })

    expect(decision).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_EVIDENCE_MISSING",
    })
  })

  it("rejects mismatched tool evidence", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "yeonjang_camera_permission_status",
      methodIds: ["camera.permission_status"],
      group: "camera",
      riskLevel: "safe",
      requiresApproval: false,
      summary: "camera status",
      postCheck: { kind: "not_required" },
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "yeonjang_file_metadata",
    })

    expect(decision).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_EVIDENCE_TOOL_MISMATCH",
    })
  })

  it("admits read-only evidence when post-check is not required", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "yeonjang_file_metadata",
      methodIds: ["file.metadata"],
      group: "files",
      riskLevel: "safe",
      requiresApproval: false,
      summary: "file metadata",
      postCheck: { kind: "not_required" },
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "yeonjang_file_metadata",
    })

    expect(decision).toMatchObject({
      status: "admitted",
      evidence,
    })
  })

  it("rejects side-effect evidence without verified post-check", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "yeonjang_file_write",
      methodIds: ["file.write"],
      group: "files",
      riskLevel: "moderate",
      requiresApproval: true,
      summary: "file write",
      postCheck: { kind: "failed", verified: false, exists: true },
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "yeonjang_file_write",
    })

    expect(decision).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_POST_CHECK_UNVERIFIED",
    })
  })

  it("admits side-effect evidence with verified post-check", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "yeonjang_file_write",
      methodIds: ["file.write"],
      group: "files",
      riskLevel: "moderate",
      requiresApproval: true,
      summary: "file write",
      postCheck: { kind: "verified", verified: true, exists: true, bytes: 11 },
      collectedAt: 123,
    })

    const decision = admitYeonjangEvidenceForReview({
      result: resultWithEvidence(evidence),
      expectedToolName: "yeonjang_file_write",
    })

    expect(decision).toMatchObject({
      status: "admitted",
      evidence,
    })
  })

  it("admits side-effect evidence only when LLM result diagnosis validated the user goal", () => {
    const evidence = buildYeonjangEvidenceEnvelope({
      targetRef: "yeonjang-main",
      toolName: "mouse_click",
      methodIds: ["mouse.click"],
      group: "input",
      riskLevel: "moderate",
      requiresApproval: true,
      summary: "mouse click command accepted and goal validated by LLM diagnosis",
      postCheck: buildYeonjangGoalValidatedPostCheck({
        diagnosisReceiptId: "diagnosis:work-016:step-click:result",
        diagnosisSubjectKind: "tool_result",
        evidenceRefs: ["operation-evidence:post-state:abc"],
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
  })
})
