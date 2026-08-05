import { describe, expect, it } from "vitest"
import {
  reviewSubAgentResult,
} from "../packages/core/src/agent/sub-agent-result-review.ts"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.ts"
import { evaluateMemoryExchangeOwnerBinding } from "../packages/core/src/contracts/memory-exchange-owner-binding.ts"
import type {
  AgentRelationship,
  ExpectedOutputContract,
  ResultReport,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  authorizeDelegationInForest,
  validateDelegationForestSnapshot,
} from "../packages/core/src/orchestration/delegation-forest.ts"
import { AggregateChildResult } from "../packages/core/src/runs/aggregate-child-result.ts"

const expectedOutput: ExpectedOutputContract = {
  outputId: "answer",
  kind: "text",
  description: "검증된 결과",
  required: true,
  acceptance: {
    requiredEvidenceKinds: ["source"],
    artifactRequired: false,
    reasonCodes: ["source_verified"],
  },
}

function edge(parentAgentId: string, childAgentId: string): AgentRelationship {
  return {
    edgeId: `edge:${parentAgentId}:${childAgentId}`,
    parentAgentId,
    childAgentId,
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
  }
}

function report(input: {
  parentRunId: string
  subSessionId: string
  sourceAgentId: string
  sourceAgentName: string
  value: string
}): ResultReport {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "sub_session",
      entityId: input.subSessionId,
      owner: { ownerType: "sub_agent", ownerId: input.sourceAgentId },
      idempotencyKey: `result:${input.subSessionId}`,
      parent: { parentRunId: input.parentRunId },
    },
    resultReportId: `result:${input.subSessionId}`,
    parentRunId: input.parentRunId,
    subSessionId: input.subSessionId,
    source: {
      entityType: "sub_agent",
      entityId: input.sourceAgentId,
      agentNameSnapshot: input.sourceAgentName,
    },
    status: "completed",
    outputs: [{ outputId: "answer", status: "satisfied", value: input.value }],
    evidence: [{
      evidenceId: `evidence:${input.subSessionId}`,
      kind: "source",
      sourceRef: `source:${input.subSessionId}`,
    }],
    artifacts: [],
    risksOrGaps: [],
  }
}

describe("three-level delegation continuity", () => {
  it("keeps direct-child, result aggregation and memory provenance level-bound", async () => {
    const snapshot = validateDelegationForestSnapshot({
      rootAgentId: "agent:knowbee",
      agents: [
        { agentId: "agent:knowbee", agentName: "마당쇠", agentType: "knowbee", status: "enabled" },
        {
          agentId: "agent:research",
          agentName: "연구원",
          agentType: "sub_agent",
          status: "enabled",
          delegationPolicy: {
            enabled: true,
            directChildOnly: true,
            redelegationAllowed: true,
            allowedChildAgentIds: ["agent:leaf"],
          },
        },
        { agentId: "agent:leaf", agentName: "검증원", agentType: "sub_agent", status: "enabled" },
      ],
      relationships: [
        edge("agent:knowbee", "agent:research"),
        edge("agent:research", "agent:leaf"),
      ],
    })

    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:knowbee",
      targetAgentId: "agent:research",
    }).ok).toBe(true)
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:research",
      targetAgentId: "agent:leaf",
    }).ok).toBe(true)
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:knowbee",
      targetAgentId: "agent:leaf",
    })).toMatchObject({ ok: false, reasonCode: "target_not_direct_child" })

    const rootMemory = evaluateMemoryExchangeOwnerBinding({
      commandOwner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      sourceOwner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      recipientOwner: { ownerType: "sub_agent", ownerId: "agent:research" },
      targetAgentId: "agent:research",
      handoffId: "handoff:root-research",
      executionSnapshotFingerprint: `sha256:${"a".repeat(64)}`,
    })
    const nestedMemory = evaluateMemoryExchangeOwnerBinding({
      commandOwner: { ownerType: "sub_agent", ownerId: "agent:research" },
      sourceOwner: { ownerType: "sub_agent", ownerId: "agent:research" },
      recipientOwner: { ownerType: "sub_agent", ownerId: "agent:leaf" },
      targetAgentId: "agent:leaf",
      handoffId: "handoff:research-leaf",
      executionSnapshotFingerprint: `sha256:${"b".repeat(64)}`,
    })
    expect(rootMemory.allowed).toBe(true)
    expect(nestedMemory.allowed).toBe(true)
    expect(rootMemory.provenanceRefs).not.toEqual(nestedMemory.provenanceRefs)

    const leafResult = report({
      parentRunId: "run:research",
      subSessionId: "sub:leaf",
      sourceAgentId: "agent:leaf",
      sourceAgentName: "검증원",
      value: "검증된 원천 결과",
    })
    const leafReview = reviewSubAgentResult({
      resultReport: leafResult,
      expectedOutputs: [expectedOutput],
    })
    const researchAggregation = await new AggregateChildResult().execute({
      parentRunId: "run:research",
      parentAgentId: "agent:research",
      directChildAgentIds: ["agent:leaf"],
      childResults: [{ subSessionId: "sub:leaf", resultReport: leafResult, review: leafReview }],
    })
    expect(researchAggregation.finalDeliveryAllowed).toBe(true)

    const forgedDirectLeaf = report({
      parentRunId: "run:root",
      subSessionId: "sub:leaf-direct",
      sourceAgentId: "agent:leaf",
      sourceAgentName: "검증원",
      value: "root로 직접 보낸 원천 결과",
    })
    const forgedReview = reviewSubAgentResult({
      resultReport: forgedDirectLeaf,
      expectedOutputs: [expectedOutput],
    })
    const rejectedAtRoot = await new AggregateChildResult().execute({
      parentRunId: "run:root",
      parentAgentId: "agent:knowbee",
      directChildAgentIds: ["agent:research"],
      childResults: [{
        subSessionId: "sub:leaf-direct",
        resultReport: forgedDirectLeaf,
        review: forgedReview,
      }],
    })
    expect(rejectedAtRoot.finalDeliveryAllowed).toBe(false)
    expect(rejectedAtRoot.trustRejections[0]?.reasonCode).toBe("child_result_not_direct_child")

    const researchResult = report({
      parentRunId: "run:root",
      subSessionId: "sub:research",
      sourceAgentId: "agent:research",
      sourceAgentName: "연구원",
      value: researchAggregation.trace.childResults[0]?.confirmedFacts[0] ?? "",
    })
    const researchReview = reviewSubAgentResult({
      resultReport: researchResult,
      expectedOutputs: [expectedOutput],
    })
    const rootAggregation = await new AggregateChildResult().execute({
      parentRunId: "run:root",
      parentAgentId: "agent:knowbee",
      directChildAgentIds: ["agent:research"],
      childResults: [{
        subSessionId: "sub:research",
        resultReport: researchResult,
        review: researchReview,
      }],
    })
    expect(rootAggregation.finalDeliveryAllowed).toBe(true)
    expect(rootAggregation.trustRejections).toEqual([])
  })
})
