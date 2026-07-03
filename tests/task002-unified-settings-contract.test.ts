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

  it("treats single Knowbee without sub-agents as skipped, not an error", () => {
    const readiness = evaluateUnifiedSettingsReadiness({
      mode: "single_knowbee",
      rootAgent: { id: "agent:knowbee", displayName: "Knowbee", nickname: "노비" },
      agents: [],
    })

    expect(readiness.status).toBe("skipped")
    expect(readiness.issues).toEqual([])
    expect(readiness.reasonCodes).toContain("single_knowbee_without_sub_agents")
  })

  it("requires at least one valid sub-agent when orchestration is enabled", () => {
    const empty = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", displayName: "Knowbee", nickname: "노비" },
      agents: [],
    })

    expect(empty.status).toBe("needs_attention")
    expect(empty.issues.map((issue) => issue.code)).toContain("sub_agent_required")

    const ready = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", displayName: "Knowbee", nickname: "노비" },
      agents: [agent()],
    })

    expect(ready.status).toBe("ready")
    expect(ready.issues).toEqual([])
  })

  it("blocks duplicate names, duplicate nicknames, and reserved Knowbee names", () => {
    const readiness = evaluateUnifiedSettingsReadiness({
      mode: "orchestration",
      rootAgent: { id: "agent:knowbee", displayName: "Knowbee", nickname: "노비" },
      agents: [
        agent({ id: "agent:a", displayName: "Researcher", nickname: "조사" }),
        agent({ id: "agent:b", displayName: "Researcher", nickname: "조사" }),
        agent({ id: "agent:c", displayName: "노비", nickname: "Knowbee" }),
      ],
    })

    expect(readiness.status).toBe("blocked")
    expect(readiness.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "display_name_duplicate",
      "nickname_duplicate",
      "reserved_root_name",
    ]))
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

