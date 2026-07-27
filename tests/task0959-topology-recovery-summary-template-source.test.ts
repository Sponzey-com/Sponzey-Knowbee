import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  FallbackController,
  RecoveryController,
  RedelegationController,
  ToolRecoveryController,
  type BuildNodeRecoveryReviewInput,
} from "../packages/core/src/topology-runtime/recovery-controller.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function input(overrides: Partial<BuildNodeRecoveryReviewInput> = {}): BuildNodeRecoveryReviewInput {
  return {
    workOrder: {
      permissionScope: {
        allowedToolIds: [],
      },
    },
    nodeContractSnapshot: {
      children: [],
      allowedToolIds: [],
      recoveryPolicy: {},
      failurePolicy: {},
    },
    candidateStatus: "failed",
    stateTransitions: [],
    ...overrides,
  } as BuildNodeRecoveryReviewInput
}

describe("task0959 topology recovery summary prompt source", () => {
  it("registers recovery summary key/value text as an internal English prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "topology_recovery_review_summaries_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "topology_recovery_review_summaries_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("retry_attempted=Retry path was reviewed or attempted.")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders retry, fallback, child, tool, partial, parent, and self summaries from prompt source values", () => {
    expect(new RecoveryController(input({
      options: { retryAttempted: true, requireRetryReview: true },
    })).reviewRetry().summary).toBe("Retry path was reviewed or attempted.")

    expect(new RecoveryController(input({
      nodeContractSnapshot: { children: [], allowedToolIds: [], recoveryPolicy: { retryAllowed: true }, failurePolicy: {} },
      options: { retryAttempted: false },
    })).reviewRetry().summary).toBe("Retry path remains unreviewed.")

    expect(new FallbackController(input({
      nodeContractSnapshot: {
        children: [],
        allowedToolIds: [],
        recoveryPolicy: { fallbackAllowed: true },
        failurePolicy: { fallbackNodeIds: ["node:fallback"] },
      },
    })).reviewFallback().summary).toBe("Fallback path remains unreviewed.")

    expect(new RedelegationController(input({
      nodeContractSnapshot: {
        children: ["node:child"],
        allowedToolIds: [],
        recoveryPolicy: {},
        failurePolicy: {},
      },
      options: { childDelegationAttempted: true },
    })).reviewChildDelegation().summary).toBe("Child delegation or redelegation was reviewed.")

    expect(new ToolRecoveryController(input({
      nodeContractSnapshot: { children: [], allowedToolIds: ["tool:search"], recoveryPolicy: {}, failurePolicy: {} },
    })).reviewToolExecution().summary).toBe("Tool execution possibilities remain unreviewed.")

    expect(new RecoveryController(input({
      options: { partialSuccessChecked: true, requirePartialSuccessReview: true },
    })).reviewPartialSuccess().summary).toBe("Partial success was evaluated.")

    expect(new RecoveryController(input({
      options: { parentRecoveryPossibleChecked: false },
    })).reviewParentRecovery().summary).toBe("Parent recovery propagation has not been reviewed.")

    expect(new RecoveryController(input({
      stateTransitions: [{ state: "self_executing" }],
    })).reviewSelfExecution().summary).toBe("Self execution was attempted before final failure review.")
  })

  it("does not keep recovery summary bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/topology-runtime/recovery-controller.ts", "utf-8")

    expect(source).toContain("topology_recovery_review_summaries_user")
    expect(source).not.toContain("Retry path was reviewed or attempted.")
    expect(source).not.toContain("Retry path remains unreviewed.")
    expect(source).not.toContain("Fallback path remains unreviewed.")
    expect(source).not.toContain("Child delegation or redelegation was reviewed.")
    expect(source).not.toContain("Tool execution possibilities remain unreviewed.")
    expect(source).not.toContain("Partial success was evaluated.")
    expect(source).not.toContain("Parent recovery propagation has not been reviewed.")
    expect(source).not.toContain("Self execution was attempted before final failure review.")
  })
})
