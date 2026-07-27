import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS,
  PROMPT_IMPROVEMENT_REPORT_STATES,
  authorizePromptImprovementReportTransition,
  authorizePromptRuntimeActivation,
  bindPromptImprovementRuntimeContext,
  type PromptImprovementReportReceipt,
} from "../packages/core/src/contracts/prompt-improvement-runtime-context.ts"

const contextInput = {
  schemaVersion: 1 as const,
  runtimeSnapshotId: "runtime:start:1386",
  capturedAt: 1_000,
  promptSourceRoot: "/workspace/prompts",
  promptRegistryHandleId: "registry:prompt:v1",
  activeConversationId: "conversation:current",
  activePromptSetFingerprint: "prompt-set:v1",
  promptSourceRefs: ["prompts/system.md", "prompts/identity.md"],
}

function receipt(kind: PromptImprovementReportReceipt["kind"], overrides: Partial<PromptImprovementReportReceipt> = {}): PromptImprovementReportReceipt {
  return {
    schemaVersion: 1,
    kind,
    proposalFingerprint: "proposal:1386",
    sourceSetFingerprint: "sources:1386",
    evidenceRef: `evidence:${kind}`,
    ...overrides,
  } as PromptImprovementReportReceipt
}

describe("task1386 immutable prompt-improvement runtime context", () => {
  it("binds and freezes the complete startup context", () => {
    const decision = bindPromptImprovementRuntimeContext(contextInput)
    expect(decision).toMatchObject({ status: "bound", context: contextInput })
    if (decision.status !== "bound") throw new Error("Expected bound context.")
    expect(Object.isFrozen(decision.context)).toBe(true)
    expect(Object.isFrozen(decision.context.promptSourceRefs)).toBe(true)
  })

  it.each([
    [{ runtimeSnapshotId: "" }, "startup_context_invalid"],
    [{ capturedAt: -1 }, "startup_context_invalid"],
    [{ promptSourceRoot: "prompts" }, "prompt_source_root_invalid"],
    [{ promptSourceRoot: "/workspace/../private" }, "prompt_source_root_invalid"],
    [{ promptSourceRefs: [] }, "prompt_source_refs_invalid"],
    [{ promptSourceRefs: ["prompts/system.md", "prompts/system.md"] }, "prompt_source_refs_invalid"],
  ] as const)("rejects invalid startup context %#", (overrides, reasonCode) => {
    expect(bindPromptImprovementRuntimeContext({ ...contextInput, ...overrides }))
      .toEqual({ status: "blocked", reasonCode })
  })

  it.each(DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS)("authorizes documented next-run activation method %s", (method) => {
    const bound = bindPromptImprovementRuntimeContext(contextInput)
    if (bound.status !== "bound") throw new Error("Expected bound context.")
    expect(authorizePromptRuntimeActivation({
      context: bound.context,
      proposalRunId: "run:proposal",
      activationRunId: "run:next",
      observedRuntimeSnapshotId: "runtime:start:1386",
      nextRuntimeSnapshotId: "runtime:next:1386",
      observedActivePromptSetFingerprint: "prompt-set:v1",
      nextPromptSetFingerprint: "prompt-set:v2",
      method,
    })).toEqual({
      status: "authorized",
      reportState: "activation_pending",
      activation: {
        method,
        activationRunId: "run:next",
        nextRuntimeSnapshotId: "runtime:next:1386",
        nextPromptSetFingerprint: "prompt-set:v2",
      },
      currentConversation: {
        conversationId: "conversation:current",
        promptSetFingerprint: "prompt-set:v1",
        unchanged: true,
      },
    })
  })

  it.each([
    [{ activationRunId: "run:proposal" }, "current_run_mutation"],
    [{ observedRuntimeSnapshotId: "runtime:replaced" }, "startup_context_mismatch"],
    [{ nextRuntimeSnapshotId: "runtime:start:1386" }, "current_snapshot_mutation"],
    [{ observedActivePromptSetFingerprint: "prompt-set:hidden" }, "startup_context_mismatch"],
    [{ nextPromptSetFingerprint: "prompt-set:v1" }, "current_prompt_set_mutation"],
    [{ method: "hot_patch" }, "activation_method_invalid"],
  ] as const)("blocks current-context mutation %#", (overrides, reasonCode) => {
    const bound = bindPromptImprovementRuntimeContext(contextInput)
    if (bound.status !== "bound") throw new Error("Expected bound context.")
    expect(authorizePromptRuntimeActivation({
      context: bound.context,
      proposalRunId: "run:proposal",
      activationRunId: "run:next",
      observedRuntimeSnapshotId: "runtime:start:1386",
      nextRuntimeSnapshotId: "runtime:next:1386",
      observedActivePromptSetFingerprint: "prompt-set:v1",
      nextPromptSetFingerprint: "prompt-set:v2",
      method: "restart",
      ...overrides,
    })).toEqual({ status: "blocked", reasonCode })
  })

  it("defines and follows the five factual report states", () => {
    expect(PROMPT_IMPROVEMENT_REPORT_STATES).toEqual(["written", "validated", "activation_pending", "activated", "rolled_back"])
    let currentState: (typeof PROMPT_IMPROVEMENT_REPORT_STATES)[number] | undefined
    for (const [kind, nextState] of [
      ["source_written", "written"],
      ["validation_passed", "validated"],
      ["activation_scheduled", "activation_pending"],
      ["activation_confirmed", "activated"],
    ] as const) {
      const decision = authorizePromptImprovementReportTransition({
        currentState,
        receipt: receipt(kind),
        expectedProposalFingerprint: "proposal:1386",
        expectedSourceSetFingerprint: "sources:1386",
      })
      expect(decision).toEqual({ status: "authorized", previousState: currentState, nextState, evidenceRef: `evidence:${kind}` })
      if (decision.status === "authorized") currentState = decision.nextState
    }
    expect(authorizePromptImprovementReportTransition({
      currentState,
      receipt: receipt("rollback_verified"),
      expectedProposalFingerprint: "proposal:1386",
      expectedSourceSetFingerprint: "sources:1386",
    })).toMatchObject({ status: "authorized", previousState: "activated", nextState: "rolled_back" })
  })

  it.each([
    [undefined, "validation_passed", "report_transition_invalid"],
    ["written", "activation_confirmed", "report_transition_invalid"],
    ["validated", "activation_confirmed", "report_transition_invalid"],
    ["activated", "activation_scheduled", "report_transition_invalid"],
  ] as const)("blocks report-state skip %#", (currentState, kind, reasonCode) => {
    expect(authorizePromptImprovementReportTransition({
      currentState,
      receipt: receipt(kind),
      expectedProposalFingerprint: "proposal:1386",
      expectedSourceSetFingerprint: "sources:1386",
    })).toEqual({ status: "blocked", reasonCode })
  })

  it("blocks missing or mismatched report evidence", () => {
    expect(authorizePromptImprovementReportTransition({
      currentState: undefined,
      receipt: receipt("source_written", { evidenceRef: "" }),
      expectedProposalFingerprint: "proposal:1386",
      expectedSourceSetFingerprint: "sources:1386",
    })).toEqual({ status: "blocked", reasonCode: "report_receipt_invalid" })
    expect(authorizePromptImprovementReportTransition({
      currentState: undefined,
      receipt: receipt("source_written", { proposalFingerprint: "proposal:other" }),
      expectedProposalFingerprint: "proposal:1386",
      expectedSourceSetFingerprint: "sources:1386",
    })).toEqual({ status: "blocked", reasonCode: "report_lineage_mismatch" })
  })

  it("depends only on injected context and receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-runtime-context.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
