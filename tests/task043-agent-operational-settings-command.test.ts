import { describe, expect, it } from "vitest"
import type {
  AgentOperationalSettingsCommand,
  AgentOperationalSettingsCommandPorts,
  AgentOperationalSettingsMutationReceipt,
  AgentOperationalSettingsState,
} from "../packages/core/src/agents/agent-operational-settings-command.js"
import {
  executeAgentOperationalSettingsCommand,
  projectAgentOperationalSettingsMutationLog,
} from "../packages/core/src/agents/agent-operational-settings-command.js"

const agentRef = `agent_v1_${"a".repeat(24)}`
const current: AgentOperationalSettingsState = {
  internalAgentId: "agent:private",
  active: true,
  root: false,
  revision: 4,
  modelProfile: { providerId: "openai", modelId: "gpt-4" },
  memoryPolicy: {
    owner: { ownerType: "sub_agent", ownerId: "agent:private" },
    visibility: "private",
    readScopes: [{ ownerType: "sub_agent", ownerId: "agent:private" }],
    writeScope: { ownerType: "sub_agent", ownerId: "agent:private" },
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
    rawWindowSize: 20,
    compactThreshold: 40,
    capsuleMode: "rolling_summary",
    lastCompactedAt: 900,
    capsuleCount: 3,
  },
  permissionProfile: {
    profileId: "permission:private",
    riskCeiling: "safe",
    approvalRequiredFrom: "external",
    allowExternalNetwork: false,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: ["/private/path"],
  },
}

function envelope(kind: string, scope = "agent_settings:write") {
  return {
    actorRef: "webui",
    scope,
    mutationId: `mutation-${kind}`,
    targetRevision: 5,
    purpose: `agent_settings_${kind}`,
    issuedAt: 1_000,
    nonce: `nonce-${kind}`,
  }
}

function command(kind: "update_model" | "clear_model" | "update_memory" | "update_permission") {
  if (kind === "update_model")
    return {
      kind,
      agentRef,
      envelope: envelope(kind),
      value: { providerName: "openai", modelName: "gpt-5", effort: "high" },
    } satisfies AgentOperationalSettingsCommand
  if (kind === "clear_model") return { kind, agentRef, envelope: envelope(kind) }
  if (kind === "update_memory")
    return {
      kind,
      agentRef,
      envelope: envelope(kind),
      value: {
        retentionPolicy: "short_term",
        capsuleMode: "session_compaction",
        rawWindowSize: 12,
        compactThreshold: 30,
        writebackReviewRequired: false,
      },
    } satisfies AgentOperationalSettingsCommand
  return {
    kind,
    agentRef,
    envelope: envelope(kind),
    value: {
      riskCeiling: "safe",
      approvalRequiredFrom: "moderate",
      allowExternalNetwork: false,
      allowFilesystemWrite: false,
      allowShellExecution: false,
      allowScreenControl: false,
    },
  } satisfies AgentOperationalSettingsCommand
}

function ports(overrides: Partial<AgentOperationalSettingsCommandPorts> = {}) {
  let state = structuredClone(current)
  const receipts = new Map<
    string,
    {
      mutationId: string
      requestFingerprint: string
      receipt: AgentOperationalSettingsMutationReceipt
    }
  >()
  const value: AgentOperationalSettingsCommandPorts = {
    now: () => 1_000,
    receiptByNonce: (nonce) => receipts.get(nonce) ?? null,
    reserveReceipt: (input) => {
      if (receipts.has(input.envelope.nonce)) return false
      receipts.set(input.envelope.nonce, {
        mutationId: input.envelope.mutationId,
        requestFingerprint: input.requestFingerprint,
        receipt: null as never,
      })
      return true
    },
    finishReceipt: (input) => {
      const reserved = [...receipts.entries()].find(
        ([, item]) => item.mutationId === input.mutationId,
      )
      if (reserved) reserved[1].receipt = input.receipt
    },
    current: () => structuredClone(state),
    persist: (input) => {
      if (state.revision !== input.expectedRevision)
        return { ok: false, revision: state.revision, reasonCode: "agent_revision_conflict" }
      state = structuredClone(input.next)
      return { ok: true, revision: input.targetRevision }
    },
    verify: (input) => ({
      ok:
        state.revision === input.targetRevision && state.internalAgentId === input.internalAgentId,
    }),
    rollback: (input) => {
      state = structuredClone(input.previous)
      return { ok: true }
    },
    ...overrides,
  }
  return { ports: value, state: () => structuredClone(state), receipts }
}

describe("Task 043 agent operational settings command", () => {
  it.each(["update_model", "clear_model", "update_memory", "update_permission"] as const)(
    "executes %s through persist and verify",
    async (kind) => {
      const fixture = ports()
      const receipt = await executeAgentOperationalSettingsCommand(command(kind), fixture.ports)
      expect(receipt).toMatchObject({ kind, state: "active", revision: 5, agentRef })
      expect(fixture.state().revision).toBe(5)
    },
  )

  it("preserves memory ownership/runtime fields and permission identity/path fields", async () => {
    const memoryFixture = ports()
    await executeAgentOperationalSettingsCommand(command("update_memory"), memoryFixture.ports)
    expect(memoryFixture.state().memoryPolicy).toMatchObject({
      owner: current.memoryPolicy.owner,
      readScopes: current.memoryPolicy.readScopes,
      writeScope: current.memoryPolicy.writeScope,
      lastCompactedAt: 900,
      capsuleCount: 3,
    })
    const permissionFixture = ports()
    await executeAgentOperationalSettingsCommand(
      command("update_permission"),
      permissionFixture.ports,
    )
    expect(permissionFixture.state().permissionProfile).toMatchObject({
      profileId: "permission:private",
      allowedPaths: ["/private/path"],
    })
  })

  it("rejects invalid memory invariants and denied fields before persistence", async () => {
    let calls = 0
    const fixture = ports({
      persist: () => {
        calls += 1
        return { ok: true, revision: 5 }
      },
    })
    const invalid = command("update_memory")
    if (invalid.kind !== "update_memory") throw new Error("test command mismatch")
    const receipt = await executeAgentOperationalSettingsCommand(
      {
        ...invalid,
        value: { ...invalid.value, rawWindowSize: 40, compactThreshold: 40 },
      },
      fixture.ports,
    )
    expect(receipt).toMatchObject({ state: "rejected", reasonCode: "agent_update_memory_invalid" })
    expect(calls).toBe(0)
  })

  it("requires elevated scope for permission expansion", async () => {
    const fixture = ports()
    const elevated = command("update_permission")
    if (elevated.kind !== "update_permission") throw new Error("test command mismatch")
    const denied = await executeAgentOperationalSettingsCommand(
      { ...elevated, value: { ...elevated.value, allowExternalNetwork: true } },
      fixture.ports,
    )
    expect(denied).toMatchObject({ state: "rejected", reasonCode: "mutation_scope_denied" })
    const allowedFixture = ports()
    const allowed = await executeAgentOperationalSettingsCommand(
      {
        ...elevated,
        envelope: envelope("update_permission", "agent_permission:elevate"),
        value: { ...elevated.value, allowExternalNetwork: true },
      },
      allowedFixture.ports,
    )
    expect(allowed.state).toBe("active")
  })

  it("maps stale revision to conflict and rejects inactive agents", async () => {
    const stale = command("update_model")
    stale.envelope.targetRevision = 7
    expect(await executeAgentOperationalSettingsCommand(stale, ports().ports)).toMatchObject({
      state: "conflict",
      reasonCode: "mutation_revision_conflict",
    })
    const inactive = ports({ current: () => ({ ...current, active: false }) })
    expect(
      await executeAgentOperationalSettingsCommand(command("update_model"), inactive.ports),
    ).toMatchObject({ state: "rejected", reasonCode: "agent_settings_inactive" })
  })

  it("replays an exact request and rejects nonce collisions", async () => {
    const fixture = ports()
    const firstCommand = command("update_model")
    const first = await executeAgentOperationalSettingsCommand(firstCommand, fixture.ports)
    const replay = await executeAgentOperationalSettingsCommand(firstCommand, fixture.ports)
    expect(replay).toEqual(first)
    const collision = command("clear_model")
    collision.envelope.nonce = firstCommand.envelope.nonce
    expect(await executeAgentOperationalSettingsCommand(collision, fixture.ports)).toMatchObject({
      state: "conflict",
      reasonCode: "mutation_nonce_conflict",
    })
  })

  it("rolls back when verification fails", async () => {
    const fixture = ports({ verify: () => ({ ok: false, reasonCode: "settings_verify_failed" }) })
    const receipt = await executeAgentOperationalSettingsCommand(
      command("update_model"),
      fixture.ports,
    )
    expect(receipt).toMatchObject({ state: "rolled_back", reasonCode: "settings_verify_failed" })
    expect(fixture.state()).toEqual(current)
  })

  it("rejects runtime, ownership and permission identity fields supplied through unsafe callers", async () => {
    const model = command("update_model")
    if (model.kind !== "update_model") throw new Error("test command mismatch")
    expect(
      await executeAgentOperationalSettingsCommand(
        { ...model, value: { ...model.value, timeoutMs: 5_000 } } as never,
        ports().ports,
      ),
    ).toMatchObject({ state: "rejected", reasonCode: "agent_update_model_invalid" })

    const memory = command("update_memory")
    if (memory.kind !== "update_memory") throw new Error("test command mismatch")
    expect(
      await executeAgentOperationalSettingsCommand(
        {
          ...memory,
          value: { ...memory.value, owner: { ownerType: "system", ownerId: "all" } },
        } as never,
        ports().ports,
      ),
    ).toMatchObject({ state: "rejected", reasonCode: "agent_update_memory_invalid" })

    const permission = command("update_permission")
    if (permission.kind !== "update_permission") throw new Error("test command mismatch")
    expect(
      await executeAgentOperationalSettingsCommand(
        { ...permission, value: { ...permission.value, allowedPaths: ["/"] } } as never,
        ports().ports,
      ),
    ).toMatchObject({ state: "rejected", reasonCode: "agent_update_permission_invalid" })
  })

  it("rejects the root agent and keeps all three log levels free of payloads and internal ids", async () => {
    const rootFixture = ports({ current: () => ({ ...current, root: true }) })
    expect(
      await executeAgentOperationalSettingsCommand(command("update_model"), rootFixture.ports),
    ).toMatchObject({ state: "rejected", reasonCode: "agent_settings_inactive" })

    const receipt = await executeAgentOperationalSettingsCommand(
      command("update_model"),
      ports().ports,
    )
    for (const level of ["product", "field_debug", "development"] as const) {
      const serialized = JSON.stringify(projectAgentOperationalSettingsMutationLog(level, receipt))
      expect(serialized).not.toContain("agent:private")
      expect(serialized).not.toContain("gpt-5")
      expect(serialized).not.toContain("providerName")
    }
    expect(projectAgentOperationalSettingsMutationLog("product", receipt)).not.toHaveProperty(
      "mutationId",
    )
  })
})
