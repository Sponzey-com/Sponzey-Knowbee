import {
  type CapabilityBindingAgentRow,
  type CapabilityBindingProjectionRow,
  buildCapabilityBindingProjection,
} from "./capability-binding-projection.js"

export type SkillBindingAgentRow = CapabilityBindingAgentRow
export type SkillBindingProjectionRow = CapabilityBindingProjectionRow

export function buildSkillBindingProjection(input: {
  skillId: string
  agents: readonly SkillBindingAgentRow[]
  bindings: readonly SkillBindingProjectionRow[]
  publicRefForAgentId: (agentId: string) => string
}) {
  return buildCapabilityBindingProjection({
    catalogId: input.skillId,
    agents: input.agents,
    bindings: input.bindings,
    publicRefForAgentId: input.publicRefForAgentId,
  })
}
