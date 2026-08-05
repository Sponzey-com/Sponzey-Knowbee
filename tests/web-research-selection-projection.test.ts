import { describe, expect, it } from "vitest"
import type { OrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { projectCapabilitySelectionSnapshot } from "../packages/core/src/runs/capability-selection-snapshot.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"

const mainAgentId = "agent:custom-main"

function registry(): OrchestrationRegistrySnapshot {
  return {
    generatedAt: 1000,
    agents: [],
    teams: [],
    membershipEdges: [],
    diagnostics: [],
  }
}

function tool(name: string): AnyTool {
  return {
    name,
    description: name,
    riskLevel: "safe",
    requiresApproval: false,
  } as AnyTool
}

function canonical() {
  return projectCanonicalCapabilitySnapshot({
    rootAgentId: mainAgentId,
    actionCapabilityIds: ["action:run_task"],
    registry: registry(),
    tools: [tool("web_search"), tool("web_fetch"), tool("memory_search")],
  })
}

const webDefinition = {
  capabilityId: "skill:web-research",
  toolNames: ["web_search", "web_fetch"],
} as const

describe("web research capability selection projection", () => {
  it("keeps canonical tool evidence but gives selection one enabled web Skill candidate", () => {
    const policySnapshot = canonical()
    expect(policySnapshot.bindings).toEqual(expect.arrayContaining([
      { capabilityId: "web_search", targetId: mainAgentId, risk: "safe" },
      { capabilityId: "web_fetch", targetId: mainAgentId, risk: "safe" },
    ]))

    const selection = projectCapabilitySelectionSnapshot({
      snapshotId: "selection:run-1",
      ownerAgentId: mainAgentId,
      canonicalSnapshot: policySnapshot,
      skillDefinitions: [webDefinition],
      skillBindings: [{
        capabilityId: "skill:web-research",
        targetId: mainAgentId,
        status: "enabled",
        risk: "safe",
        sourceSupported: true,
      }],
    })

    expect(selection.bindings).toEqual([
      { capabilityId: "memory_search", targetId: mainAgentId, risk: "safe" },
      { capabilityId: "skill:web-research", targetId: mainAgentId, risk: "safe" },
    ])
    expect(selection.bindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: "web_search" }),
      expect.objectContaining({ capabilityId: "web_fetch" }),
    ]))
    expect(selection.candidateContexts).toEqual([
      {
        kind: "tool_bundle_skill",
        capabilityId: "skill:web-research",
        targetId: mainAgentId,
        toolNames: ["web_fetch", "web_search"],
      },
    ])
    expect(selection.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })

  it("projects instruction candidates, isolates load failures, and fingerprints instruction content", () => {
    const instructionSkill = {
      capabilityId: "skill:ui-guidance",
      targetId: mainAgentId,
      risk: "safe" as const,
      content: "Use clear controls.",
      checksum: `sha256:${"b".repeat(64)}` as const,
    }
    const input = {
      snapshotId: "selection:run-instruction",
      ownerAgentId: mainAgentId,
      canonicalSnapshot: canonical(),
      skillDefinitions: [webDefinition],
      skillBindings: [
        {
          capabilityId: "skill:web-research",
          targetId: mainAgentId,
          status: "enabled" as const,
          risk: "safe" as const,
          sourceSupported: true,
        },
      ],
      instructionSkills: [instructionSkill],
      instructionSkillFindings: [
        {
          capabilityId: "skill:broken-guidance",
          reasonCode: "instruction_source_not_utf8" as const,
        },
      ],
    }
    const selection = projectCapabilitySelectionSnapshot(input)

    expect(selection.bindings).toEqual(
      expect.arrayContaining([
        { capabilityId: "skill:ui-guidance", targetId: mainAgentId, risk: "safe" },
        { capabilityId: "skill:web-research", targetId: mainAgentId, risk: "safe" },
      ]),
    )
    expect(selection.candidateContexts).toEqual([
      {
        kind: "instruction_skill",
        capabilityId: "skill:ui-guidance",
        targetId: mainAgentId,
        content: "Use clear controls.",
        checksum: `sha256:${"b".repeat(64)}`,
      },
      {
        kind: "tool_bundle_skill",
        capabilityId: "skill:web-research",
        targetId: mainAgentId,
        toolNames: ["web_fetch", "web_search"],
      },
    ])
    expect(selection.exclusions).toContainEqual({
      capabilityId: "skill:broken-guidance",
      targetId: mainAgentId,
      reasonCodes: ["instruction_source_not_utf8"],
    })

    const changed = projectCapabilitySelectionSnapshot({
      ...input,
      instructionSkills: [
        {
          ...instructionSkill,
          content: "Use different controls.",
          checksum: `sha256:${"c".repeat(64)}`,
        },
      ],
    })
    expect(changed.fingerprint).not.toBe(selection.fingerprint)
  })

  it.each([
    ["disabled", "skill_binding_disabled"],
    ["archived", "skill_binding_archived"],
  ] as const)("fails closed for a %s owner binding", (status, reasonCode) => {
    const selection = projectCapabilitySelectionSnapshot({
      snapshotId: "selection:run-2",
      ownerAgentId: mainAgentId,
      canonicalSnapshot: canonical(),
      skillDefinitions: [webDefinition],
      skillBindings: [{
        capabilityId: "skill:web-research",
        targetId: mainAgentId,
        status,
        risk: "safe",
        sourceSupported: true,
      }],
    })

    expect(selection.bindings.map((item) => item.capabilityId)).toEqual(["memory_search"])
    expect(selection.exclusions).toContainEqual({
      capabilityId: "skill:web-research",
      targetId: mainAgentId,
      reasonCodes: [reasonCode],
    })
  })

  it("does not treat another agent's binding as the main agent binding", () => {
    const selection = projectCapabilitySelectionSnapshot({
      snapshotId: "selection:run-3",
      ownerAgentId: mainAgentId,
      canonicalSnapshot: canonical(),
      skillDefinitions: [webDefinition],
      skillBindings: [{
        capabilityId: "skill:web-research",
        targetId: "agent:child",
        status: "enabled",
        risk: "safe",
        sourceSupported: true,
      }],
    })

    expect(selection.bindings.map((item) => item.capabilityId)).toEqual(["memory_search"])
    expect(selection.exclusions).toContainEqual({
      capabilityId: "skill:web-research",
      targetId: mainAgentId,
      reasonCodes: ["skill_binding_missing"],
    })
  })
})
