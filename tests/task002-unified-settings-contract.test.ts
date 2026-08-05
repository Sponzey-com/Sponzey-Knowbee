import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  evaluateUnifiedSettingsReadiness,
  transitionUnifiedSettingsState,
  type UnifiedSettingsAgentInput,
} from "../packages/core/src/ui/unified-settings.ts"

const repoRoot = process.cwd()

function source(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8")
}

function agent(input: Partial<UnifiedSettingsAgentInput> = {}): UnifiedSettingsAgentInput {
  return {
    id: input.id ?? "agent:research",
    agentName: input.agentName,
    displayName: input.displayName ?? "Researcher",
    nickname: input.nickname ?? "리서처",
    role: input.role ?? "research",
    workDescription: input.workDescription ?? "자료를 조사하고 요약한다.",
    parentId: input.parentId,
  }
}

describe("task002 unified settings contracts", () => {
  it("models the explicit settings lifecycle without direct draft-to-active transitions", () => {
    const started = transitionUnifiedSettingsState("empty", { type: "draft_started" })
    expect(started).toEqual({ state: "drafting" })

    const validating = transitionUnifiedSettingsState(started.state, { type: "validation_requested" })
    expect(validating).toEqual({ state: "validating" })

    const ready = transitionUnifiedSettingsState(validating.state, { type: "validation_succeeded" })
    expect(ready).toEqual({ state: "ready_to_save" })

    const saving = transitionUnifiedSettingsState(ready.state, { type: "save_requested" })
    expect(saving).toEqual({ state: "saving" })

    const saved = transitionUnifiedSettingsState(saving.state, { type: "save_succeeded" })
    expect(saved).toEqual({ state: "saved" })

    const activating = transitionUnifiedSettingsState(saved.state, { type: "activation_requested" })
    expect(activating).toEqual({ state: "activating" })

    expect(transitionUnifiedSettingsState(activating.state, { type: "activation_succeeded" })).toEqual({ state: "active" })
    expect(transitionUnifiedSettingsState("drafting", { type: "activation_succeeded" })).toEqual({
      state: "failed",
      reasonCode: "invalid_transition",
    })
  })

  it("treats direct main-agent mode without sub-agents as skipped, not an error", () => {
    const readiness = evaluateUnifiedSettingsReadiness({
      mode: "direct_main_agent",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [],
    })

    expect(readiness.status).toBe("skipped")
    expect(readiness.issues).toEqual([])
    expect(readiness.reasonCodes).toContain("direct_main_agent_without_sub_agents")
  })

  it("requires at least one valid sub-agent when orchestration is enabled", () => {
    const empty = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [],
    })

    expect(empty.status).toBe("needs_attention")
    expect(empty.issues.map((issue) => issue.code)).toContain("sub_agent_required")

    const ready = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [agent({ agentName: "조사" })],
    })

    expect(ready.status).toBe("ready")
    expect(ready.issues).toEqual([])
  })

  it("requires an explicit agentName and does not accept nickname or displayName as a name fallback", () => {
    const readiness = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [
        agent({ id: "agent:a", displayName: "Researcher", nickname: "조사" }),
      ],
    })

    expect(readiness.status).toBe("needs_attention")
    expect(readiness.issues).toContainEqual({
      code: "agent_name_required",
      severity: "attention",
      agentId: "agent:a",
      field: "agentName",
    })
  })

  it("blocks duplicate canonical agent names and reserved main-agent names", () => {
    const readiness = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠", displayName: "Knowbee", nickname: "노비" },
      agents: [
        agent({ id: "agent:a", agentName: "조사", displayName: "Researcher", nickname: "legacy-a" }),
        agent({ id: "agent:b", agentName: " 조사 ", displayName: "Writer", nickname: "legacy-b" }),
        agent({ id: "agent:c", agentName: "마당쇠", displayName: "Planner", nickname: "legacy-c" }),
      ],
    })

    expect(readiness.status).toBe("blocked")
    expect(readiness.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "agent_name_duplicate",
      "reserved_root_name",
    ]))
    expect(readiness.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(["agentName"]))
  })

  it("does not reserve root legacy displayName or nickname when root agentName is explicit", () => {
    const legacyRootNames = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: {
        id: "agent:knowbee",
        agentName: "마당쇠",
        displayName: "Legacy Root Display",
        nickname: "Legacy Root Nickname",
      },
      agents: [
        agent({ id: "agent:a", agentName: "Legacy Root Display" }),
        agent({ id: "agent:b", agentName: "Legacy Root Nickname" }),
      ],
    })
    const productDefaultNames = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: {
        id: "agent:knowbee",
        agentName: "마당쇠",
        displayName: "Legacy Root Display",
        nickname: "Legacy Root Nickname",
      },
      agents: [
        agent({ id: "agent:a", agentName: "Knowbee" }),
        agent({ id: "agent:b", agentName: "노비" }),
      ],
    })

    expect(legacyRootNames.status).toBe("ready")
    expect(legacyRootNames.issues).toEqual([])
    expect(productDefaultNames.status).toBe("blocked")
    expect(productDefaultNames.issues.map((issue) => issue.code)).toEqual([
      "reserved_root_name",
      "reserved_root_name",
    ])
  })

  it("does not treat legacy nickname or displayName duplicates as agentName duplicates", () => {
    const duplicateLegacyNickname = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [
        agent({ id: "agent:a", displayName: "Researcher", nickname: "조사" }),
        agent({ id: "agent:b", displayName: "Writer", nickname: " 조사 " }),
      ],
    })
    const duplicateLegacyDisplayName = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", agentName: "마당쇠" },
      agents: [
        agent({ id: "agent:a", displayName: "Researcher", nickname: "" }),
        agent({ id: "agent:b", displayName: " researcher ", nickname: "" }),
      ],
    })

    expect(duplicateLegacyNickname.issues.map((issue) => issue.code)).not.toContain("agent_name_duplicate")
    expect(duplicateLegacyDisplayName.issues.map((issue) => issue.code)).not.toContain("agent_name_duplicate")
    expect(duplicateLegacyNickname.issues.map((issue) => issue.code)).toEqual([
      "agent_name_required",
      "agent_name_required",
    ])
    expect(duplicateLegacyDisplayName.issues.map((issue) => issue.code)).toEqual([
      "agent_name_required",
      "agent_name_required",
    ])
  })

  it("keeps the contract independent from external frameworks, hidden IO, and env reads", () => {
    const text = source("packages/core/src/ui/unified-settings.ts")
    const forbidden = [
      "react",
      "fastify",
      "process.env",
      "readFile",
      "writeFile",
      "fetch(",
      "../db/",
      "../api/",
      "../channels/",
    ]

    for (const token of forbidden) {
      expect(text, `unified settings contract should not depend on ${token}`).not.toContain(token)
    }
  })
})
