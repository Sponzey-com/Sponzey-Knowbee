import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { projectYeonjangBrowserFocusTarget } from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { deriveCompletionStageState } from "../packages/core/src/runs/completion-state.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import { buildYeonjangEvidenceEnvelope } from "../packages/core/src/yeonjang/evidence.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

const RAW_TITLE = "Private Admin Console"
const RAW_URL = "https://example.test/admin?token=private"
const INTERNAL_TEXT = [
  "yeonjang_browser_focus browser.focus",
  `raw focused title ${RAW_TITLE}`,
  `raw focused URL ${RAW_URL}`,
  "operationId=operation:browser-focus-143",
  "receipt payload",
  "raw observed state",
  "pid=4401 windowId=window-private tabId=tab-private",
].join(" | ")

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-task143-browser-focus-")
})

afterEach(() => {
  dbRuntime.dispose()
})

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

function focusEvidence(postCheck: "verified" | "unverifiable"): SuccessfulToolEvidence {
  const target = focusTarget()
  return {
    toolName: "yeonjang_browser_focus",
    output: postCheck === "verified"
      ? "브라우저 포커스 사후검증 성공"
      : "브라우저 포커스 요청은 전달되었지만 관찰 검증이 필요합니다.",
    details: {
      via: "yeonjang",
      method: "browser.focus",
      commandAccepted: true,
      target,
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
        collectedAt: 143,
      }),
    },
    evidenceSource: {
      sourceKind: "yeonjang",
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
      sourceRef: "tool-result:yeonjang:browserfocus143browserfocus143browserfocus143browserfocus14312",
    },
  }
}

function finalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-task143",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("Task 143 browser.focus final response boundary", () => {
  it("treats verified browser.focus Yeonjang evidence as completion evidence", () => {
    const result = deriveCompletionStageState({
      review: {
        status: "complete",
        summary: "목표 달성",
        reason: "focused target observation이 브라우저 포커스를 검증했습니다.",
        remainingItems: [],
      },
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "external_system",
        artifactDelivery: "none",
        approvalRequired: true,
        approvalTool: "yeonjang_browser_focus",
      },
      preview: "",
      deliverySatisfied: false,
      successfulTools: [focusEvidence("verified")],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(result.executionStatus).toBe("satisfied")
    expect(result.recoveryStatus).toBe("settled")
    expect(result.completionSatisfied).toBe(true)
  })

  it("does not treat unverified browser.focus command acceptance as completion evidence", () => {
    const result = deriveCompletionStageState({
      review: {
        status: "complete",
        summary: "목표 달성",
        reason: "command accepted만 확인되었습니다.",
        remainingItems: [],
      },
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "external_system",
        artifactDelivery: "none",
        approvalRequired: true,
        approvalTool: "yeonjang_browser_focus",
      },
      preview: "",
      deliverySatisfied: false,
      successfulTools: [focusEvidence("unverifiable")],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(result.executionStatus).toBe("missing")
    expect(result.recoveryStatus).toBe("required")
    expect(result.completionSatisfied).toBe(false)
  })

  it("removes browser.focus raw target and internal evidence before final response rendering", async () => {
    const deps = finalizationDependencies()
    const renderFinalResponseText = vi.fn(async (input) => {
      expect(input.rawText).not.toContain(RAW_TITLE)
      expect(input.rawText).not.toContain(RAW_URL)
      expect(input.rawText).not.toContain("token=private")
      expect(input.rawText).not.toContain("operationId")
      expect(input.rawText).not.toContain("receipt payload")
      expect(input.rawText).not.toContain("raw observed state")
      expect(input.rawText).not.toContain("window-private")
      expect(input.rawText).not.toContain("tab-private")
      return buildReviewedFinalResponse(input, "요청한 브라우저를 앞으로 가져왔습니다.")
    })
    const delivered: string[] = []

    const outcome = await completeRunWithAssistantMessage({
      runId: "run-task143-final",
      sessionId: "session-task143-final",
      text: INTERNAL_TEXT,
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "업무 브라우저를 앞으로 가져와줘.",
        model: "test-model",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp",
        identityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "마당쇠",
          promptContext: "",
        },
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn(async (chunk) => {
        if (chunk.type === "text") delivered.push(chunk.delta)
      }),
      dependencies: deps,
    })

    const serialized = JSON.stringify({
      outcome,
      delivered,
      success: deps.rememberRunSuccess.mock.calls,
    })
    expect(outcome.status).toBe("completed")
    expect(serialized).not.toContain(RAW_TITLE)
    expect(serialized).not.toContain(RAW_URL)
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
  })
})
