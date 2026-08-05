import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { buildCompletionReviewEvidenceBlock } from "../packages/core/src/agent/completion-review.ts"
import { projectYeonjangBrowserFocusTarget } from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"
import {
  validateAndAppendYeonjangSideEffectGoalValidationEvidence,
  type YeonjangSideEffectGoalValidationCandidate,
} from "../packages/core/src/yeonjang/side-effect-goal-validation-review.ts"

const RAW_TITLE = "Private Admin Console"
const RAW_URL = "https://example.test/admin?token=private"

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function evidenceSource(toolName: string) {
  return {
    sourceKind: "yeonjang" as const,
    sourceRef: `tool-result:yeonjang:${sha(toolName)}`,
    trustClass: "untrusted_external" as const,
    instructionIsolation: "data_only" as const,
  }
}

function focusTarget() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: RAW_TITLE,
    url: RAW_URL,
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function focusToolEvidence(postCheck: "verified" | "unverifiable"): SuccessfulToolEvidence {
  const target = focusTarget()
  return {
    toolName: "yeonjang_browser_focus",
    output: [
      '연장 "yeonjang-main" 브라우저 포커스 요청이 준비되었습니다.',
      `reason=${postCheck === "verified" ? "focused_target_matched" : "target_observation_required"}`,
      `사후검증: ${postCheck === "verified" ? "성공" : "focused target observation 필요"}`,
    ].join("\n"),
    details: {
      via: "yeonjang",
      method: "browser.focus",
      commandAccepted: true,
      target,
      ...(postCheck === "verified" ? { observedFocusedTarget: target } : {}),
      evidence: buildYeonjangEvidenceEnvelope({
        targetRef: "yeonjang-main",
        toolName: "yeonjang_browser_focus",
        methodIds: ["browser.focus"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
        summary: `browser focus post-check state=${postCheck === "verified" ? "VERIFIED" : "MANUAL_INTERVENTION"} target=${target.displayName}`,
        postCheck: postCheck === "verified"
          ? { kind: "verified", verified: true, reason: "focused_target_matched" }
          : { kind: "unverifiable", verified: false, reason: "target_observation_required" },
        collectedAt: 142,
      }),
    },
    evidenceSource: evidenceSource("yeonjang_browser_focus"),
  }
}

const manualCandidate: YeonjangSideEffectGoalValidationCandidate = {
  toolName: "yeonjang_browser_focus",
  output: [
    '연장 "yeonjang-main" 브라우저 포커스 요청이 준비되었습니다.',
    "reason=target_observation_required",
    "사후검증: focused target observation 필요",
  ].join("\n"),
  details: {
    kind: "side_effect_manual_intervention",
    operationId: "operation:browser-focus-142",
    reasonCode: "target_observation_required",
    goalValidationCandidate: true,
    rawObservedState: {
      rawTitle: RAW_TITLE,
      rawUrl: RAW_URL,
      pid: 4401,
      windowId: "window-private",
      tabId: "tab-private",
      automationScript: "tell application \"System Events\"",
    },
  },
}

describe("Task 142 Yeonjang browser.focus completion review boundary", () => {
  it("admits verified browser.focus evidence into completion review without raw target data", () => {
    const block = buildCompletionReviewEvidenceBlock([focusToolEvidence("verified")])

    expect(block).toContain("yeonjang_browser_focus")
    expect(block).toContain("browser.focus")
    expect(block).toContain("focused_target_matched")
    expect(block).toContain("raw_payload_visibility")
    expect(block).not.toContain(RAW_TITLE)
    expect(block).not.toContain("token=private")
    expect(block).not.toContain("4401")
    expect(block).not.toContain("window-private")
    expect(block).not.toContain("tab-private")
  })

  it("does not admit command-accepted browser.focus evidence when focused target was not verified", () => {
    const block = buildCompletionReviewEvidenceBlock([focusToolEvidence("unverifiable")])

    expect(block).toBe("")
  })

  it("passes only sanitized browser.focus manual-intervention context to LLM goal validation", async () => {
    const successfulTools: SuccessfulToolEvidence[] = []
    const validationInputs: unknown[] = []

    const result = await validateAndAppendYeonjangSideEffectGoalValidationEvidence({
      db: {} as never,
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => null,
      },
      runId: "run-142",
      ownerAgentName: "마당쇠",
      originalRequest: "업무 브라우저를 앞으로 가져와줘.",
      completionConditions: ["업무 브라우저가 현재 포커스된 창이어야 한다."],
      candidates: [manualCandidate],
      successfulTools,
      resolveToolMetadata: () => ({
        methodIds: ["browser.focus"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
      }),
      validateRuntimeGoal: async (input) => {
        validationInputs.push(input)
        const serialized = JSON.stringify(input)
        expect(serialized).not.toContain(RAW_TITLE)
        expect(serialized).not.toContain("token=private")
        expect(serialized).not.toContain("4401")
        expect(serialized).not.toContain("window-private")
        expect(serialized).not.toContain("tab-private")
        expect(serialized).not.toContain("System Events")
        expect(input).toMatchObject({
          toolName: "yeonjang_browser_focus",
          methodIds: ["browser.focus"],
          group: "browser",
          riskLevel: "moderate",
          requiresApproval: true,
          publicToolOutput: manualCandidate.output,
        })
        return {
          status: "validated",
          publicSummary: {
            operationId: "operation:browser-focus-142",
            runId: "run-142",
            workId: "work:root:run-142",
            adapterId: "tool:yeonjang_browser_focus",
            state: "MANUAL_INTERVENTION",
            revision: 3,
            transitionCount: 3,
          },
          evidence: buildYeonjangEvidenceEnvelope({
            targetRef: "tool:yeonjang_browser_focus:side-effect-goal",
            toolName: "yeonjang_browser_focus",
            methodIds: ["browser.focus"],
            group: "browser",
            riskLevel: "moderate",
            requiresApproval: true,
            summary: "yeonjang_browser_focus goal validated by LLM result diagnosis.",
            postCheck: buildYeonjangGoalValidatedPostCheck({
              diagnosisReceiptId: "diagnosis:work:root:run-142:executing:result",
              diagnosisSubjectKind: "tool_result",
              evidenceRefs: ["operation-evidence:browser-focus:142"],
            }),
            collectedAt: 142,
          }),
        }
      },
    })

    expect(result).toEqual({ added: 1, skipped: [] })
    expect(validationInputs).toHaveLength(1)
    expect(successfulTools).toHaveLength(1)
    expect(successfulTools[0]).toMatchObject({
      toolName: "yeonjang_browser_focus",
      details: {
        via: "yeonjang",
        evidence: {
          schemaVersion: "yeonjang-evidence-v1",
          rawPayloadVisibility: "audit_only",
          postCheck: {
            kind: "goal_validated",
            diagnosisReceiptId: "diagnosis:work:root:run-142:executing:result",
          },
        },
      },
    })
    expect(JSON.stringify(successfulTools)).not.toContain(RAW_TITLE)
    expect(JSON.stringify(successfulTools)).not.toContain("token=private")
  })
})
