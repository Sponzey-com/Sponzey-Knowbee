import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  buildCanonicalPolicyBlockedDescriptor,
  recordCanonicalFinalizationTransition,
} from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"

function finalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    deliveryDependencies: {
      now: () => 1,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("Telegram blocked request baseline", () => {
  it("preserves the originating policy cause instead of projecting BLOCKED alone", () => {
    const built = buildCanonicalPolicyBlockedDescriptor({
      runId: "run-policy-blocked",
      reasonCode: "approval_scope_missing",
      policyFingerprint: `sha256:${"a".repeat(64)}`,
      capabilityRefs: ["capability:telegram:reply"],
      safeAlternativesExhausted: true,
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return

    let issuedReceipt: object | undefined
    expect(recordCanonicalFinalizationTransition(built.descriptor, {
      issueReceipt: (receipt) => {
        issuedReceipt = receipt
        return { issued: true as const }
      },
      loadReceipt: () => undefined,
      applyTransition: () => ({ status: "applied" as const }),
    })).toEqual({ ok: true })

    expect(issuedReceipt).toMatchObject({
      terminalCause: {
        schemaVersion: 1,
        originStage: "policy_admission",
        outcomeKind: "policy_block",
        reasonCode: "approval_scope_missing",
        safeAlternativesExhausted: true,
      },
    })
  })

  it("does not stage a renderer failure as a reviewed pending delivery", async () => {
    const stageCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))
    const onChunk = vi.fn()

    const outcome = await completeRunWithAssistantMessage({
      runId: "run-renderer-failure",
      sessionId: "session-renderer-failure",
      text: "final response source",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "답변해줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async () => {
        throw new Error("provider unavailable")
      }),
      source: "telegram",
      onChunk,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse,
      canonicalFinalOutcome: "succeeded",
      dependencies: finalizationDependencies(),
    })

    expect(outcome).toEqual({ status: "blocked_by_final_response_rendering" })
    expect(stageCanonicalPendingResponse).not.toHaveBeenCalled()
    expect(onChunk).not.toHaveBeenCalled()
  })
})
