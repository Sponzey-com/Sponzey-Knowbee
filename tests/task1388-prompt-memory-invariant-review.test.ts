import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  AGENT_MEMORY_STORE_KINDS,
  COMPACTION_PRESERVATION_CATEGORIES,
  evaluateAgentMemoryOwnership,
  evaluateCompactionPreservation,
  evaluateLongTermMemoryMutation,
  evaluateWorkBoundMemoryHandoff,
  type CompactionPreservationEntry,
  type LongTermMemoryMutationReview,
  type WorkBoundMemoryHandoff,
} from "../packages/core/src/index.ts"
import {
  PROMPT_MEMORY_EXCHANGE_METHODS,
  authorizePromptImprovementMemoryInvariant,
  evaluatePromptMemoryExchangeReceipt,
  projectMemoryIsolationInvariantReview,
  type PromptMemoryExchangeReceipt,
} from "../packages/core/src/contracts/prompt-improvement-memory-invariants.ts"

const now = 1_000
const agentIds = ["agent:main", "agent:research"]
const ownership = evaluateAgentMemoryOwnership({
  agents: agentIds.map((agentId) => ({ agentId, lifecycle: "active" as const })),
  bindings: agentIds.flatMap((agentId) => AGENT_MEMORY_STORE_KINDS.map((storeKind) => ({
    agentId, namespaceId: `${agentId}:${storeKind}`, storeKind, lifecycle: "active" as const,
  }))),
  shortTermEntries: [],
})

function handoff(overrides: Partial<WorkBoundMemoryHandoff> = {}): WorkBoundMemoryHandoff {
  return {
    handoffId: "handoff:1388", sourceAgentId: "agent:research", recipientAgentId: "agent:main",
    assignedWorkId: "work:1388", receiptWorkId: "work:1388", purpose: "Return verified result evidence.",
    payloadFieldNames: ["summary", "evidenceRefs"], allowedPayloadFieldNames: ["summary", "evidenceRefs"],
    contextRefs: ["context:work:1388"], allowedContextRefs: ["context:work:1388"], provenanceRefs: ["result:1388"],
    containsRawMemory: false, containsUnrelatedHistory: false, grantsLongTermRetention: false,
    evaluatedAt: now - 10, expiresAt: now + 100, ...overrides,
  }
}

function exchange(method: PromptMemoryExchangeReceipt["method"] = "message_payload", overrides: Partial<PromptMemoryExchangeReceipt> = {}): PromptMemoryExchangeReceipt {
  return {
    schemaVersion: 1,
    exchangeId: method === "message_payload" ? "message:1388" : "handoff:1388",
    method,
    sourceAgentId: "agent:research",
    targetAgentId: "agent:main",
    payloadFingerprint: "payload:1388",
    ...(method === "message_payload"
      ? { messageEvidenceRef: "message-receipt:1388" }
      : {
          approvalRef: "approval:handoff:1388",
          handoff: handoff(),
          handoffDecision: evaluateWorkBoundMemoryHandoff(handoff()),
        }),
    ...overrides,
  } as PromptMemoryExchangeReceipt
}

function preservation(): CompactionPreservationEntry[] {
  return COMPACTION_PRESERVATION_CATEGORIES.map((category) => ({
    category, sourceRefs: [`source:${category}`], outputRefs: [`source:${category}`], explicitEmpty: false,
  }))
}

function mutation(overrides: Partial<LongTermMemoryMutationReview> = {}) {
  return evaluateLongTermMemoryMutation({
    mutationId: "mutation:1388", action: "create", requesterAgentId: "agent:main",
    targetAgentId: "agent:main", expectedTargetAgentId: "agent:main", targetNamespaceId: "agent:main:long_term",
    storageNeedReviewed: true, sensitivity: "personal", userIntent: "explicit_user_request",
    evidenceRefs: ["evidence:retention:1388"], reviewerRef: "reviewer:main", ...overrides,
  })
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptImprovementMemoryInvariant({
    ownership,
    namespaceSeparation: {
      schemaVersion: 1, status: "verified", agentNamespaceIds: agentIds.flatMap((agentId) => AGENT_MEMORY_STORE_KINDS.map((kind) => `${agentId}:${kind}`)),
      userNamespaceIds: ["user:profile:memory"], evidenceRef: "namespace-audit:1388",
    },
    exchanges: [exchange("message_payload"), exchange("approved_handoff_package")],
    compaction: evaluateCompactionPreservation(preservation()),
    longTermPolicy: {
      schemaVersion: 1, storageNeedReviewRequired: true, sensitivityReviewRequired: true,
      userIntentReviewRequired: true, agentOwnerReviewRequired: true, policyFingerprint: "memory-policy:1388",
    },
    longTermMutations: [mutation()],
    proposalFingerprint: "proposal:1388", baselineFingerprint: "memory:baseline",
    proposedFingerprint: "memory:proposed", goalSection3Fingerprint: "goal:section3:v1",
    reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
    ...overrides,
  })
}

describe("task1388 prompt-improvement memory invariant review", () => {
  it.each(PROMPT_MEMORY_EXCHANGE_METHODS)("accepts explicit memory exchange method %s", (method) => {
    expect(evaluatePromptMemoryExchangeReceipt(exchange(method))).toEqual({
      status: "verified", exchangeId: method === "message_payload" ? "message:1388" : "handoff:1388",
      method, sourceAgentId: "agent:research", targetAgentId: "agent:main", payloadFingerprint: "payload:1388",
    })
  })

  it.each([
    [{ sourceAgentId: "agent:main" }, "exchange_owner_same"],
    [{ payloadFingerprint: "" }, "exchange_receipt_invalid"],
    [{ messageEvidenceRef: "" }, "message_evidence_missing"],
    [{ method: "shared_memory" }, "exchange_method_invalid"],
  ] as const)("rejects invalid explicit exchange %#", (overrides, reasonCode) => {
    expect(evaluatePromptMemoryExchangeReceipt(exchange("message_payload", overrides as Partial<PromptMemoryExchangeReceipt>)))
      .toEqual({ status: "blocked", reasonCode })
  })

  it("rejects unapproved or mismatched handoff packages", () => {
    expect(evaluatePromptMemoryExchangeReceipt(exchange("approved_handoff_package", { approvalRef: "" })))
      .toEqual({ status: "blocked", reasonCode: "handoff_approval_missing" })
    expect(evaluatePromptMemoryExchangeReceipt(exchange("approved_handoff_package", {
      handoffDecision: evaluateWorkBoundMemoryHandoff(handoff({ containsRawMemory: true })),
    }))).toEqual({ status: "blocked", reasonCode: "handoff_not_eligible" })
    expect(evaluatePromptMemoryExchangeReceipt(exchange("approved_handoff_package", {
      handoff: handoff({ recipientAgentId: "agent:other" }),
    }))).toEqual({ status: "blocked", reasonCode: "handoff_scope_mismatch" })
  })

  it("creates a memory-isolation review from all verified sub-decisions", () => {
    expect(authorize()).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "memory_isolation", decision: "preserved", proposalFingerprint: "proposal:1388",
        goalSection3Fingerprint: "goal:section3:v1", activeAgentIds: agentIds,
        exchangeIds: ["message:1388", "handoff:1388"], policyFingerprint: "memory-policy:1388",
      },
    })
  })

  it.each([
    [{ ownership: evaluateAgentMemoryOwnership({ agents: [], bindings: [], shortTermEntries: [] }) }, "memory_ownership_incomplete"],
    [{ namespaceSeparation: { schemaVersion: 1, status: "verified", agentNamespaceIds: ["shared"], userNamespaceIds: ["shared"], evidenceRef: "audit" } }, "memory_namespace_mixed"],
    [{ namespaceSeparation: { schemaVersion: 1, status: "verified", agentNamespaceIds: ["agent:main:short_term"], userNamespaceIds: [], evidenceRef: "" } }, "memory_namespace_receipt_invalid"],
    [{ exchanges: [{ ...exchange(), messageEvidenceRef: "" }] }, "memory_exchange_invalid"],
    [{ compaction: evaluateCompactionPreservation(preservation().filter((entry) => entry.category !== "decisions")) }, "compaction_preservation_incomplete"],
    [{ longTermPolicy: { schemaVersion: 1, storageNeedReviewRequired: true, sensitivityReviewRequired: false, userIntentReviewRequired: true, agentOwnerReviewRequired: true, policyFingerprint: "policy" } }, "long_term_policy_incomplete"],
    [{ longTermMutations: [mutation({ storageNeedReviewed: false })] }, "long_term_mutation_ineligible"],
  ] as const)("blocks incomplete memory invariant %#", (overrides, reasonCode) => {
    expect(authorize(overrides)).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects invalid invariant lineage before creating a receipt", () => {
    expect(authorize({ goalSection3Fingerprint: "" })).toEqual({ status: "blocked", reasonCode: "memory_review_lineage_invalid" })
    expect(authorize({ proposedFingerprint: "memory:baseline" })).toEqual({ status: "blocked", reasonCode: "memory_review_lineage_invalid" })
  })

  it("projects only exact current memory-isolation lineage", () => {
    const decision = authorize()
    if (decision.status !== "authorized") throw new Error("Expected memory invariant authorization.")
    expect(projectMemoryIsolationInvariantReview({
      receipt: decision.receipt, expectedProposalFingerprint: "proposal:1388",
      currentGoalSection3Fingerprint: "goal:section3:v1", now,
    })).toMatchObject({ status: "authorized", review: { invariant: "memory_isolation", decision: "preserved" } })
    expect(projectMemoryIsolationInvariantReview({
      receipt: decision.receipt, expectedProposalFingerprint: "proposal:other",
      currentGoalSection3Fingerprint: "goal:section3:v1", now,
    })).toEqual({ status: "blocked", reasonCode: "memory_review_scope_mismatch" })
    expect(projectMemoryIsolationInvariantReview({
      receipt: decision.receipt, expectedProposalFingerprint: "proposal:1388",
      currentGoalSection3Fingerprint: "goal:section3:v2", now,
    })).toEqual({ status: "blocked", reasonCode: "goal_section3_lineage_mismatch" })
  })

  it("uses only injected decisions and receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-memory-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
