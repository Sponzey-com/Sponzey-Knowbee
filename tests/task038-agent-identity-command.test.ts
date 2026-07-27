import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type AgentIdentityCommandRepository,
  type AgentIdentityMutationReceipt,
  type AgentIdentityRecord,
  executeAgentIdentityCommand,
  publicAgentIdentityReceipt,
} from "../packages/core/src/agents/agent-identity-command.js"

function repository(seed: AgentIdentityRecord[] = []): AgentIdentityCommandRepository {
  const records = new Map(seed.map((record) => [record.agentRef, { ...record }]))
  const receipts = new Map<string, AgentIdentityMutationReceipt>()
  let sequence = 0
  return {
    receiptByNonce: (nonce) => receipts.get(nonce) ?? null,
    recordByRef: (ref) => records.get(ref) ?? null,
    recordByNormalizedName: (name) =>
      [...records.values()].find(
        (record) => record.name.normalize("NFKC").trim().toLocaleLowerCase() === name,
      ) ?? null,
    create(input) {
      const record: AgentIdentityRecord = {
        agentRef: `agent_v1_${String(++sequence).padStart(24, "0")}`,
        agentType: "sub_agent",
        name: input.name,
        role: input.role,
        status: "enabled",
        revision: 1,
        activeChildCount: 0,
        activeBindingCount: 0,
      }
      records.set(record.agentRef, record)
      return record
    },
    compareAndUpdate(input) {
      const current = records.get(input.agentRef)
      if (!current || current.revision !== input.baseRevision)
        return { reasonCode: "agent_revision_conflict" }
      const updated = {
        ...current,
        name: input.name,
        role: input.role,
        revision: current.revision + 1,
      }
      records.set(input.agentRef, updated)
      return updated
    },
    compareAndArchive(input) {
      const current = records.get(input.agentRef)
      if (!current || current.revision !== input.baseRevision)
        return { reasonCode: "agent_revision_conflict" }
      const updated = { ...current, status: "archived" as const, revision: current.revision + 1 }
      records.set(input.agentRef, updated)
      return updated
    },
    saveReceipt(receipt) {
      receipts.set(receipt.nonce, receipt)
    },
  }
}

const envelope = {
  mutationId: "mutation-1",
  nonce: "nonce-1",
  actorRef: "user",
  scope: "agent_identity" as const,
}
const record: AgentIdentityRecord = {
  agentRef: `agent_v1_${"a".repeat(24)}`,
  agentType: "sub_agent",
  name: "Researcher",
  role: "Research",
  status: "enabled",
  revision: 3,
  activeChildCount: 2,
  activeBindingCount: 4,
}

describe("Task 038 agent identity command", () => {
  it("creates through explicit lifecycle states and redacts receipt internals", () => {
    const result = executeAgentIdentityCommand(
      { kind: "create", envelope, name: " Writer ", role: " Drafts " },
      repository(),
    )
    expect(result).toMatchObject({ state: "active", name: "Writer", role: "Drafts", revision: 1 })
    expect(result.transitions).toEqual(["draft", "validating", "persisting", "verifying", "active"])
    expect(publicAgentIdentityReceipt(result)).not.toHaveProperty("nonce")
    expect(publicAgentIdentityReceipt(result)).not.toHaveProperty("requestSignature")
  })

  it("rejects empty and Unicode-normalized duplicate names", () => {
    expect(
      executeAgentIdentityCommand(
        { kind: "create", envelope, name: " ", role: "Anything" },
        repository(),
      ).reasonCode,
    ).toBe("agent_name_required")
    expect(
      executeAgentIdentityCommand(
        { kind: "create", envelope, name: "ＲＥＳＥＡＲＣＨＥＲ", role: "Other" },
        repository([record]),
      ),
    ).toMatchObject({ state: "conflict", reasonCode: "agent_name_conflict" })
    expect(
      executeAgentIdentityCommand(
        { kind: "create", envelope, name: "Writer", role: " " },
        repository(),
      ).reasonCode,
    ).toBe("agent_role_required")
  })

  it("allows the last character to be deleted in draft but rejects empty only on command", () => {
    const result = executeAgentIdentityCommand(
      {
        kind: "update",
        envelope,
        agentRef: record.agentRef,
        baseRevision: 3,
        name: "",
        role: "Research",
      },
      repository([record]),
    )
    expect(result).toMatchObject({
      state: "failed",
      reasonCode: "agent_name_required",
      name: "Researcher",
    })
  })

  it("fails closed on stale revision and main-agent archive", () => {
    expect(
      executeAgentIdentityCommand(
        {
          kind: "update",
          envelope,
          agentRef: record.agentRef,
          baseRevision: 2,
          name: "New",
          role: "Role",
        },
        repository([record]),
      ),
    ).toMatchObject({ state: "conflict", reasonCode: "agent_revision_conflict", revision: 3 })
    expect(
      executeAgentIdentityCommand(
        { kind: "archive", envelope, agentRef: record.agentRef, baseRevision: 3, confirmed: false },
        repository([record]),
      ),
    ).toMatchObject({
      state: "cancelled",
      reasonCode: "agent_archive_confirmation_required",
      impact: { activeChildCount: 2, activeBindingCount: 4 },
    })
    expect(
      executeAgentIdentityCommand(
        { kind: "archive", envelope, agentRef: record.agentRef, baseRevision: 3, confirmed: true },
        repository([{ ...record, agentType: "knowbee" }]),
      ).reasonCode,
    ).toBe("main_agent_mutation_forbidden")
  })

  it("returns an identical receipt for replay and rejects nonce payload collision", () => {
    const store = repository()
    const command = { kind: "create" as const, envelope, name: "Writer", role: "Drafts" }
    const first = executeAgentIdentityCommand(command, store)
    expect(executeAgentIdentityCommand(command, store)).toEqual(first)
    expect(executeAgentIdentityCommand({ ...command, name: "Other" }, store)).toMatchObject({
      state: "conflict",
      reasonCode: "agent_mutation_nonce_conflict",
    })
  })

  it("has no infrastructure or environment dependency", () => {
    const source = readFileSync("packages/core/src/agents/agent-identity-command.ts", "utf8")
    expect(source).not.toMatch(/node:|process\.env|Fastify|React|db\/|filesystem|mqtt/iu)
  })
})
