import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { canonicalizeLegacyTeamIdentity } from "../packages/core/src/adapters/legacy-team-identity.ts"
import {
  SUB_AGENT_CONTRACT_SCHEMA_VERSION,
  validateTeamConfig,
  validateTeamExecutionPlan,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"

describe("task1184 canonical team naming contract", () => {
  it("maps legacy team nickname input to the one canonical display name", () => {
    expect(canonicalizeLegacyTeamIdentity({
      teamId: "team:legacy",
      nickname: " Legacy Review Team ",
      normalizedNickname: "legacy review team",
    })).toEqual({
      teamId: "team:legacy",
      displayName: "Legacy Review Team",
    })
  })

  it("rejects legacy team name aliases from the canonical TeamConfig contract", () => {
    const base = {
      schemaVersion: SUB_AGENT_CONTRACT_SCHEMA_VERSION,
      teamId: "team:review",
      displayName: "Review Team",
      status: "enabled",
      purpose: "Review",
      ownerAgentId: "agent:owner",
      leadAgentId: "agent:reviewer",
      memberAgentIds: ["agent:reviewer"],
      roleHints: ["reviewer"],
      profileVersion: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    const validation = validateTeamConfig(base)
    expect(validation.issues).toEqual([])
    expect(validation.ok).toBe(true)
    expect(validateTeamConfig({ ...base, nickname: "Alias" }).ok).toBe(false)
    expect(validateTeamConfig({ ...base, normalizedNickname: "alias" }).ok).toBe(false)
  })

  it("uses teamNameSnapshot instead of an agent-name alias in execution plans", () => {
    const plan = {
      teamExecutionPlanId: "team-plan:1",
      parentRunId: "run:1",
      teamId: "team:review",
      teamNameSnapshot: "Review Team",
      ownerAgentId: "agent:owner",
      leadAgentId: "agent:reviewer",
      memberTaskAssignments: [],
      reviewerAgentIds: [],
      verifierAgentIds: [],
      fallbackAssignments: [],
      coverageReport: {},
      conflictPolicySnapshot: "lead_decides",
      resultPolicySnapshot: "lead_synthesis",
      createdAt: 1,
    }
    expect(validateTeamExecutionPlan(plan).ok).toBe(true)
    expect(validateTeamExecutionPlan({ ...plan, teamNameSnapshot: undefined, teamAgentNameSnapshot: "Alias" }).ok).toBe(false)
  })

  it("keeps canonical public contracts free of legacy team naming fields", () => {
    const source = readFileSync("packages/core/src/contracts/sub-agent-orchestration.ts", "utf8")
    const teamConfig = source.slice(source.indexOf("export interface TeamConfig"), source.indexOf("export interface TeamExecutionPlanAssignment"))
    const teamPlan = source.slice(source.indexOf("export interface TeamExecutionPlan {"), source.indexOf("export interface ExpectedOutputContract"))

    expect(teamConfig).toContain("displayName: string")
    expect(teamConfig).not.toMatch(/nickname|normalizedNickname/)
    expect(teamPlan).toContain("teamNameSnapshot?: string")
    expect(teamPlan).not.toContain("teamAgentNameSnapshot")
  })
})
