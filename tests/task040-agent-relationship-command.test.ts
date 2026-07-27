import { describe, expect, it } from "vitest"
import {
  type AgentRelationshipCommandPorts,
  type AgentRelationshipMutationReceipt,
  executeAgentRelationshipCommand,
} from "../packages/core/src/agents/agent-relationship-command.js"

const childRef = `agent_v1_${"a".repeat(24)}`
const rootRef = `agent_v1_${"b".repeat(24)}`
const parentRef = `agent_v1_${"c".repeat(24)}`
const now = 1_800_000_000_000

function command(kind: "connect" | "reparent" | "disconnect", targetRevision = 8) {
  return {
    kind,
    childRef,
    parentRef: kind === "disconnect" ? null : kind === "connect" ? rootRef : parentRef,
    envelope: {
      actorRef: "webui",
      scope: "agent_relationship:write" as const,
      mutationId: `mutation-${kind}`,
      targetRevision,
      purpose: `relationship_${kind}`,
      issuedAt: now,
      nonce: `nonce-${kind}`,
    },
  }
}

function ports(
  input: {
    currentParent?: string | null
    revision?: number
    prior?: {
      mutationId: string
      requestFingerprint: string
      receipt: AgentRelationshipMutationReceipt
    }
    validate?: { ok: boolean; reasonCode?: string }
    verify?: { ok: boolean; reasonCode?: string }
  } = {},
): AgentRelationshipCommandPorts & { persisted: Array<Record<string, unknown>> } {
  let revision = input.revision ?? 7
  let currentParent = input.currentParent === undefined ? null : input.currentParent
  const persisted: Array<Record<string, unknown>> = []
  return {
    persisted,
    now: () => now,
    currentRevision: () => revision,
    receiptByNonce: () => input.prior ?? null,
    reserveReceipt: () => true,
    finishReceipt: () => undefined,
    resolveAgent: (ref) =>
      ref === childRef
        ? { internalAgentId: "agent:child", active: true, root: false }
        : ref === rootRef
          ? { internalAgentId: "agent:root", active: true, root: true }
          : ref === parentRef
            ? { internalAgentId: "agent:parent", active: true, root: false }
            : null,
    currentRelationship: () =>
      currentParent
        ? {
            internalEdgeId: "relationship:child",
            internalParentAgentId: currentParent,
            active: true,
            sortOrder: 0,
          }
        : null,
    validate: () => input.validate ?? { ok: true },
    persist: (value) => {
      persisted.push(value)
      currentParent = value.internalParentAgentId
      revision = value.targetRevision
      return { ok: true, revision }
    },
    verify: () => input.verify ?? { ok: true },
    rollback: () => ({ ok: true }),
  }
}

describe("Task 040 agent relationship command", () => {
  it.each([
    ["connect", null, "agent:root"],
    ["reparent", "agent:root", "agent:parent"],
    ["disconnect", "agent:root", null],
  ] as const)("executes %s through persist and verify", async (kind, currentParent, nextParent) => {
    const adapter = ports({ currentParent })
    const result = await executeAgentRelationshipCommand(command(kind), adapter)
    expect(result).toMatchObject({
      kind,
      state: "active",
      childRef,
      parentRef: kind === "disconnect" ? null : kind === "connect" ? rootRef : parentRef,
      revision: 8,
    })
    expect(adapter.persisted).toEqual([
      expect.objectContaining({
        internalChildAgentId: "agent:child",
        internalParentAgentId: nextParent,
        expectedRevision: 7,
        targetRevision: 8,
      }),
    ])
    expect(JSON.stringify(result)).not.toMatch(/agent:child|agent:root|agent:parent|internal/iu)
  })

  it.each([
    ["mutation_revision_conflict", command("connect", 9), ports()],
    [
      "agent_relationship_transition_invalid",
      command("connect"),
      ports({ currentParent: "agent:root" }),
    ],
    [
      "cycle_detected",
      command("reparent"),
      ports({ currentParent: "agent:root", validate: { ok: false, reasonCode: "cycle_detected" } }),
    ],
  ])("rejects %s without persistence", async (reasonCode, input, adapter) => {
    const result = await executeAgentRelationshipCommand(input, adapter)
    expect(result).toMatchObject({ state: expect.stringMatching(/rejected|conflict/), reasonCode })
    expect(adapter.persisted).toHaveLength(0)
  })

  it("replays the exact request and rejects nonce reuse for another target", async () => {
    const receipt: AgentRelationshipMutationReceipt = {
      mutationId: "mutation-connect",
      kind: "connect",
      state: "active",
      reasonCode: null,
      revision: 8,
      childRef,
      parentRef: rootRef,
      allowedActions: [],
    }
    const first = command("connect")
    const fingerprint = JSON.stringify([
      first.kind,
      first.childRef,
      first.parentRef,
      first.envelope.targetRevision,
    ])
    expect(
      await executeAgentRelationshipCommand(
        first,
        ports({
          prior: {
            mutationId: first.envelope.mutationId,
            requestFingerprint: fingerprint,
            receipt,
          },
        }),
      ),
    ).toEqual(receipt)
    const collision = command("connect")
    collision.parentRef = parentRef
    expect(
      await executeAgentRelationshipCommand(
        collision,
        ports({
          prior: {
            mutationId: first.envelope.mutationId,
            requestFingerprint: fingerprint,
            receipt,
          },
        }),
      ),
    ).toMatchObject({ state: "conflict", reasonCode: "mutation_nonce_conflict" })
  })

  it("returns failed after verification and requests rollback", async () => {
    let rolledBack = false
    const adapter = ports({ verify: { ok: false, reasonCode: "relationship_verification_failed" } })
    adapter.rollback = () => {
      rolledBack = true
      return { ok: true }
    }
    const result = await executeAgentRelationshipCommand(command("connect"), adapter)
    expect(result).toMatchObject({
      state: "rolled_back",
      reasonCode: "relationship_verification_failed",
    })
    expect(rolledBack).toBe(true)
  })
})
