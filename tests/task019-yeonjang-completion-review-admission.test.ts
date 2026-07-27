import { describe, expect, it } from "vitest"
import {
  buildCompletionReviewEvidenceBlock,
} from "../packages/core/src/agent/completion-review.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import { buildYeonjangEvidenceEnvelope } from "../packages/core/src/yeonjang/evidence.ts"

const yeonjangEvidenceSource = {
  sourceKind: "yeonjang",
  sourceRef: `tool-result:yeonjang:${"a".repeat(64)}`,
  trustClass: "untrusted_external",
  instructionIsolation: "data_only",
} as const

function evidenceTool(
  toolName: string,
  evidence: unknown,
  output = "user-facing output",
): SuccessfulToolEvidence {
  return {
    toolName,
    output,
    details: {
      via: "yeonjang",
      rawSecretLikeField: "do-not-project",
      evidence,
    },
    evidenceSource: yeonjangEvidenceSource,
  }
}

describe("task019 Yeonjang completion review admission", () => {
  it("projects admitted Yeonjang evidence instead of raw tool details", () => {
    const block = buildCompletionReviewEvidenceBlock([
      evidenceTool("yeonjang_file_metadata", buildYeonjangEvidenceEnvelope({
        targetRef: "yeonjang-main",
        toolName: "yeonjang_file_metadata",
        methodIds: ["file.metadata"],
        group: "files",
        riskLevel: "safe",
        requiresApproval: false,
        summary: "file metadata kind=file bytes=12",
        postCheck: { kind: "not_required" },
        collectedAt: 123,
      })),
    ])

    expect(block).toContain("yeonjang_evidence")
    expect(block).toContain("yeonjang_file_metadata")
    expect(block).toContain("file.metadata")
    expect(block).toContain("file metadata kind=file bytes=12")
    expect(block).not.toContain("rawSecretLikeField")
    expect(block).not.toContain("do-not-project")
  })

  it("excludes Yeonjang output from completion review when normalized evidence is missing", () => {
    const block = buildCompletionReviewEvidenceBlock([
      {
        toolName: "yeonjang_file_metadata",
        output: "tool says file exists",
        details: { via: "yeonjang" },
        evidenceSource: yeonjangEvidenceSource,
      },
    ])

    expect(block).toBe("")
  })

  it("excludes Yeonjang evidence with failed post-check from completion review", () => {
    const block = buildCompletionReviewEvidenceBlock([
      evidenceTool("yeonjang_file_patch", buildYeonjangEvidenceEnvelope({
        targetRef: "yeonjang-main",
        toolName: "yeonjang_file_patch",
        methodIds: ["file.patch"],
        group: "files",
        riskLevel: "moderate",
        requiresApproval: true,
        summary: "file patch changed=false verified=false",
        postCheck: { kind: "failed", verified: false, exists: true, reason: "expected_text_not_found" },
        collectedAt: 123,
      }), "patch transport returned"),
    ])

    expect(block).toBe("")
  })
})
