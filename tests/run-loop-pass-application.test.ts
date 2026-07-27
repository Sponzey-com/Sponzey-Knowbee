import { describe, expect, it } from "vitest"
import {
  applyLoopEntryPassResult,
  applyPostExecutionPassResult,
  applyRecoveryEntryPassResult,
  applyReviewCyclePassResult,
} from "../packages/core/src/runs/loop-pass-application.ts"

describe("loop pass application helpers", () => {
  it("resets pending directive and intake flag on loop-entry retry", () => {
    const result = applyLoopEntryPassResult({
      kind: "retry",
      nextMessage: "retry intake",
    })

    expect(result).toEqual({
      kind: "retry",
      nextMessage: "retry intake",
      state: {
        pendingLoopDirective: null,
        intakeProcessed: false,
      },
    })
  })

  it("maps recovery retry state into current execution state", () => {
    const workerRuntime = {
      kind: "internal_ai",
      targetId: "worker:internal_ai",
      label: "코드 작업 보조 세션",
      command: "disabled",
    } as const

    const provider = { id: "openai" } as never
    const result = applyRecoveryEntryPassResult({
      result: {
        kind: "retry",
        nextMessage: "retry with worker runtime",
        nextState: {
          model: "gpt-5",
          providerId: "provider:openai",
          provider,
          targetId: "worker:internal_ai",
          targetLabel: "코드 작업 보조 세션",
          workerRuntime,
        },
      },
      currentMessage: "previous message",
    })

    expect(result).toEqual({
      kind: "retry",
      state: {
        currentMessage: "retry with worker runtime",
        currentModel: "gpt-5",
        currentProviderId: "provider:openai",
        currentProvider: provider,
        currentTargetId: "worker:internal_ai",
        currentTargetLabel: "코드 작업 보조 세션",
        activeWorkerRuntime: workerRuntime,
      },
    })
  })

  it("records seen recovery keys and clears worker runtime on post-execution retry", () => {
    const seenCommandFailureRecoveryKeys = new Set<string>()
    const seenExecutionRecoveryKeys = new Set<string>()
    const seenDeliveryRecoveryKeys = new Set<string>()
    const activeWorkerRuntime = {
      kind: "internal_ai",
      targetId: "worker:internal_ai",
      label: "코드 작업 보조 세션",
      command: "disabled",
    } as const

    const result = applyPostExecutionPassResult({
      result: {
        kind: "retry",
        nextMessage: "retry delivery",
        clearWorkerRuntime: true,
        markMutationRecoveryAttempted: true,
        seenCommandFailureRecoveryKey: "command:key",
        seenExecutionRecoveryKey: "execution:key",
        seenDeliveryRecoveryKey: "delivery:key",
      },
      currentMessage: "previous message",
      filesystemMutationRecoveryAttempted: false,
      activeWorkerRuntime,
      seenCommandFailureRecoveryKeys,
      seenExecutionRecoveryKeys,
      seenDeliveryRecoveryKeys,
    })

    expect([...seenCommandFailureRecoveryKeys]).toEqual(["command:key"])
    expect([...seenExecutionRecoveryKeys]).toEqual(["execution:key"])
    expect([...seenDeliveryRecoveryKeys]).toEqual(["delivery:key"])
    expect(result).toEqual({
      kind: "retry",
      state: {
        currentMessage: "retry delivery",
        filesystemMutationRecoveryAttempted: true,
        activeWorkerRuntime: undefined,
      },
    })
  })

  it("records structured followup keys and clears runtime/provider on review retry", () => {
    const seenFollowupPrompts = new Set<string>()
    const activeWorkerRuntime = {
      kind: "internal_ai",
      targetId: "worker:internal_ai",
      label: "코드 작업 보조 세션",
      command: "disabled",
    } as const
    const currentProvider = { id: "openai" } as never

    const result = applyReviewCyclePassResult({
      result: {
        kind: "retry",
        nextMessage: "follow up with more detail",
        clearWorkerRuntime: true,
        clearProvider: true,
        structuredFollowupKey: "completion-followup:test-key",
        markTruncatedOutputRecoveryAttempted: true,
        requiredToolNames: ["web_fetch"],
      },
      currentMessage: "previous message",
      truncatedOutputRecoveryAttempted: false,
      activeWorkerRuntime,
      currentProvider,
      seenFollowupPrompts,
    })

    expect([...seenFollowupPrompts]).toEqual(["completion-followup:test-key"])
    expect(result).toEqual({
      kind: "retry",
      state: {
        currentMessage: "follow up with more detail",
        requiredToolNames: ["web_fetch"],
        truncatedOutputRecoveryAttempted: true,
        activeWorkerRuntime: undefined,
        currentProvider: undefined,
      },
    })
  })

  it("preserves an explicit empty tool list for a response-only review retry", () => {
    const result = applyReviewCyclePassResult({
      result: {
        kind: "retry",
        nextMessage: "answer from existing evidence",
        clearWorkerRuntime: false,
        requiredToolNames: [],
        nextAttemptToolPolicy: { mode: "forbidden" },
      },
      currentMessage: "previous message",
      truncatedOutputRecoveryAttempted: false,
      activeWorkerRuntime: undefined,
      currentProvider: undefined,
      seenFollowupPrompts: new Set(),
    })

    expect(result).toMatchObject({
      kind: "retry",
      state: {
        requiredToolNames: [],
        nextAttemptToolPolicy: { mode: "forbidden" },
      },
    })
  })
})
