import { describe, expect, it } from "vitest"
import {
  buildYeonjangFailureEvidenceRecoveryPayload,
  selectGenericExecutionRecovery,
} from "../packages/core/src/runs/recovery.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import { buildYeonjangEvidenceEnvelope } from "../packages/core/src/yeonjang/evidence.ts"

const yeonjangEvidenceSource = {
  sourceKind: "yeonjang",
  sourceRef: `tool-result:yeonjang:${"b".repeat(64)}`,
  trustClass: "untrusted_external",
  instructionIsolation: "data_only",
} as const

function yeonjangToolEvidence(
  toolName: string,
  evidence: unknown,
): SuccessfulToolEvidence {
  return {
    toolName,
    output: "transport completed but user goal is not verified",
    details: {
      via: "yeonjang",
      rawFileText: "do-not-project-file-body",
      base64_data: "do-not-project-base64",
      expectedText: "do-not-project-patch-before",
      replacementText: "do-not-project-patch-after",
      evidence,
    },
    evidenceSource: yeonjangEvidenceSource,
  }
}

describe("task020 Yeonjang failure evidence recovery projection", () => {
  it("turns failed post-check evidence into generic execution recovery input", () => {
    const payload = buildYeonjangFailureEvidenceRecoveryPayload(yeonjangToolEvidence(
      "yeonjang_file_patch",
      buildYeonjangEvidenceEnvelope({
        targetRef: "yeonjang-main",
        toolName: "yeonjang_file_patch",
        methodIds: ["file.patch"],
        group: "files",
        riskLevel: "moderate",
        requiresApproval: true,
        summary: "file patch changed=false verified=false",
        postCheck: {
          kind: "failed",
          verified: false,
          exists: true,
          reason: "expected_text_not_found",
        },
        collectedAt: 123,
      }),
    ))

    expect(payload).toMatchObject({
      summary: "yeonjang_file_patch Yeonjang evidence failed verification.",
      toolNames: ["yeonjang_file_patch"],
    })
    expect(payload?.reason).toContain("target_ref=sha256:")
    expect(payload?.reason).not.toContain("yeonjang-main")
    expect(payload?.reason).toContain("method=file.patch")
    expect(payload?.reason).toContain("post_check=failed")
    expect(JSON.stringify(payload)).not.toContain("do-not-project")

    const recovery = selectGenericExecutionRecovery({
      executionRecovery: payload!,
      seenKeys: new Set<string>(),
    })
    expect(recovery).not.toBeNull()
    expect(recovery?.alternatives.some((alternative) => alternative.kind === "other_extension")).toBe(true)
  })

  it("turns missing normalized evidence into recovery input without trusting output text", () => {
    const payload = buildYeonjangFailureEvidenceRecoveryPayload({
      toolName: "yeonjang_file_metadata",
      output: "tool says file exists",
      details: { via: "yeonjang" },
      evidenceSource: yeonjangEvidenceSource,
    })

    expect(payload).toMatchObject({
      summary: "yeonjang_file_metadata Yeonjang evidence was not admissible.",
      toolNames: ["yeonjang_file_metadata"],
    })
    expect(payload?.reason).toContain("YEONJANG_EVIDENCE_MISSING")
    expect(payload?.reason).not.toContain("tool says file exists")
  })

  it("turns mismatched evidence into recovery input", () => {
    const payload = buildYeonjangFailureEvidenceRecoveryPayload(yeonjangToolEvidence(
      "yeonjang_file_metadata",
      buildYeonjangEvidenceEnvelope({
        targetRef: "yeonjang-main",
        toolName: "yeonjang_disk_info",
        methodIds: ["disk.info"],
        group: "disk",
        riskLevel: "safe",
        requiresApproval: false,
        summary: "disk info",
        postCheck: { kind: "not_required" },
        collectedAt: 123,
      }),
    ))

    expect(payload).toMatchObject({
      summary: "yeonjang_file_metadata Yeonjang evidence was not admissible.",
      toolNames: ["yeonjang_file_metadata"],
    })
    expect(payload?.reason).toContain("YEONJANG_EVIDENCE_TOOL_MISMATCH")
  })
})
