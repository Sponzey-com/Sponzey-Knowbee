import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AgentRelationship, DelegationPolicy } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  authorizeDelegationInForest,
  validateDelegationForestSnapshot,
  type DelegationForestAgent,
} from "../packages/core/src/orchestration/delegation-forest.ts"

function agent(
  agentId: string,
  agentName: string,
  agentType: DelegationForestAgent["agentType"] = "sub_agent",
  delegationPolicy?: DelegationPolicy,
): DelegationForestAgent {
  return { agentId, agentName, agentType, status: "enabled", ...(delegationPolicy ? { delegationPolicy } : {}) }
}

function edge(parentAgentId: string, childAgentId: string, suffix = childAgentId): AgentRelationship {
  return {
    edgeId: `edge:${suffix}`,
    parentAgentId,
    childAgentId,
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
  }
}

const childPolicy: DelegationPolicy = {
  enabled: true,
  maxParallelSessions: 2,
  directChildOnly: true,
  allowedChildAgentIds: ["agent:leaf"],
  redelegationAllowed: true,
}

function validInput() {
  return {
    rootAgentId: "agent:knowbee",
    agents: [
      agent("agent:knowbee", "마당쇠", "knowbee"),
      agent("agent:research", "연구원", "sub_agent", childPolicy),
      agent("agent:leaf", "검증원"),
      agent("agent:other-root", "독립원"),
      agent("agent:other-child", "기록원"),
    ],
    relationships: [
      edge("agent:knowbee", "agent:research", "root-research"),
      edge("agent:research", "agent:leaf", "research-leaf"),
      edge("agent:other-root", "agent:other-child", "other-child"),
    ],
  }
}

describe("task1223 canonical delegation forest", () => {
  it("validates a multi-tree forest and stable direct-child indexes", () => {
    const snapshot = validateDelegationForestSnapshot(validInput())
    expect(snapshot.rootAgentIds).toEqual(["agent:knowbee", "agent:other-root"])
    expect(snapshot.directChildAgentIdsByParent).toEqual({
      "agent:knowbee": ["agent:research"],
      "agent:other-root": ["agent:other-child"],
      "agent:research": ["agent:leaf"],
    })
    expect(snapshot.snapshotFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it.each([
    ["self edge", [edge("agent:research", "agent:research", "self")]],
    ["cycle", [edge("agent:leaf", "agent:knowbee", "cycle")]],
    ["multiple parent", [edge("agent:other-root", "agent:leaf", "second-parent")]],
    ["unknown endpoint", [edge("agent:missing", "agent:leaf", "missing")]],
    ["duplicate edge", [edge("agent:knowbee", "agent:research", "duplicate")]],
  ])("rejects a %s", (_label, extra) => {
    const input = validInput()
    expect(() => validateDelegationForestSnapshot({
      ...input,
      relationships: [...input.relationships, ...extra],
    })).toThrow(/self|cycle|parent|unknown|duplicate/i)
  })

  it("rejects normalized agent-name collisions across the whole forest", () => {
    const input = validInput()
    expect(() => validateDelegationForestSnapshot({
      ...input,
      agents: [...input.agents, agent("agent:duplicate", "  연구원  ")],
    })).toThrow(/agent name.*unique/i)
  })

  it("authorizes the main agent only for its direct top-level child", () => {
    const snapshot = validateDelegationForestSnapshot(validInput())
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:knowbee",
      targetAgentId: "agent:research",
    })).toMatchObject({ ok: true, callerAgentName: "마당쇠", targetAgentName: "연구원" })
    for (const targetAgentId of ["agent:leaf", "agent:other-root", "agent:other-child"]) {
      expect(authorizeDelegationInForest({
        snapshot,
        expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
        callerAgentId: "agent:knowbee",
        targetAgentId,
      })).toMatchObject({ ok: false, reasonCode: "target_not_direct_child" })
    }
  })

  it("authorizes a sub-agent only for an explicitly allowed direct child", () => {
    const snapshot = validateDelegationForestSnapshot(validInput())
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:research",
      targetAgentId: "agent:leaf",
    })).toMatchObject({ ok: true, callerAgentName: "연구원", targetAgentName: "검증원" })
    for (const targetAgentId of ["agent:knowbee", "agent:research", "agent:other-root", "agent:other-child"]) {
      expect(authorizeDelegationInForest({
        snapshot,
        expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
        callerAgentId: "agent:research",
        targetAgentId,
      }).ok).toBe(false)
    }
  })

  it.each([
    ["disabled", { ...childPolicy, enabled: false }, "delegation_disabled"],
    ["redelegation denied", { ...childPolicy, redelegationAllowed: false }, "redelegation_denied"],
    ["non-direct policy", { ...childPolicy, directChildOnly: false }, "direct_child_policy_required"],
    ["outside allowlist", { ...childPolicy, allowedChildAgentIds: [] }, "target_not_allowed"],
  ] as Array<[string, DelegationPolicy, string]>)
  ("rejects a direct child when policy is %s", (_label, delegationPolicy, reasonCode) => {
    const input = validInput()
    const snapshot = validateDelegationForestSnapshot({
      ...input,
      agents: input.agents.map((item) => item.agentId === "agent:research" ? { ...item, delegationPolicy } : item),
    })
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:research",
      targetAgentId: "agent:leaf",
    })).toMatchObject({ ok: false, reasonCode })
  })

  it("rejects stale snapshot fingerprints and inactive participants", () => {
    const input = validInput()
    const snapshot = validateDelegationForestSnapshot({
      ...input,
      agents: input.agents.map((item) => item.agentId === "agent:leaf" ? { ...item, status: "disabled" as const } : item),
    })
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: "sha256:stale",
      callerAgentId: "agent:research",
      targetAgentId: "agent:leaf",
    })).toMatchObject({ ok: false, reasonCode: "snapshot_fingerprint_mismatch" })
    expect(authorizeDelegationInForest({
      snapshot,
      expectedSnapshotFingerprint: snapshot.snapshotFingerprint,
      callerAgentId: "agent:research",
      targetAgentId: "agent:leaf",
    })).toMatchObject({ ok: false, reasonCode: "target_inactive" })
  })

  it("keeps forest validation independent from storage, providers, and mutable global state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/orchestration/delegation-forest.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:better-sqlite3|node:fs|openai|@anthropic-ai\/sdk)["']/)
    expect(source).not.toMatch(/process\.env|globalThis|fetch\(|readFile/)
  })

  it("requires root and nested runtime dispatch paths to consume forest authorization", () => {
    const rootDispatch = readFileSync(
      new URL("../packages/core/src/runs/orchestration-dispatch.ts", import.meta.url),
      "utf8",
    )
    const nestedDispatch = readFileSync(
      new URL("../packages/core/src/orchestration/nested-delegation.ts", import.meta.url),
      "utf8",
    )
    expect(rootDispatch).toMatch(/authorizeDelegationInForest\([\s\S]*?callerAgentId:[\s\S]*?targetAgentId:/)
    expect(nestedDispatch).toMatch(/authorizeDelegationInForest\([\s\S]*?authorizationReceiptId/)
  })
})
