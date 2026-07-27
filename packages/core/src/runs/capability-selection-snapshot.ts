import { createHash } from "node:crypto"
import type {
  CapabilitySelectionCandidateContext,
  CapabilitySelectionRisk,
  CapabilitySelectionSnapshot,
} from "../contracts/llm-capability-selection.js"
import type { CanonicalCapabilitySnapshotProjection } from "./canonical-capability-snapshot.js"
import type {
  InstructionSkillRunSnapshot,
  InstructionSkillSnapshotFinding,
} from "./instruction-skill-snapshot.js"

export interface CapabilitySelectionSkillDefinition {
  capabilityId: string
  toolNames: readonly string[]
}

export interface CapabilitySelectionSkillBinding {
  capabilityId: string
  targetId: string
  status: "enabled" | "disabled" | "archived"
  risk: CapabilitySelectionRisk
  sourceSupported: boolean
  toolNames?: readonly string[] | undefined
}

function normalized(value: string): string {
  return value.trim()
}

function identity(value: { capabilityId: string; targetId: string }): string {
  return `${normalized(value.capabilityId)}\u0000${normalized(value.targetId)}`
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
    .join(",")}}`
}

function fingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(`knowbee:capability-selection-snapshot:${canonicalize(value)}`)
    .digest("hex")}`
}

export function projectCapabilitySelectionSnapshot(input: {
  snapshotId: string
  ownerAgentId: string
  canonicalSnapshot: CanonicalCapabilitySnapshotProjection
  skillDefinitions: readonly CapabilitySelectionSkillDefinition[]
  skillBindings: readonly CapabilitySelectionSkillBinding[]
  instructionSkills?: readonly InstructionSkillRunSnapshot[] | undefined
  instructionSkillFindings?: readonly InstructionSkillSnapshotFinding[] | undefined
}): CapabilitySelectionSnapshot {
  const snapshotId = normalized(input.snapshotId)
  const ownerAgentId = normalized(input.ownerAgentId)
  if (!snapshotId || !ownerAgentId) {
    throw new Error("Capability selection snapshot identity is required.")
  }

  const definitions = input.skillDefinitions.map((definition) => ({
    capabilityId: normalized(definition.capabilityId),
    toolNames: [...new Set(definition.toolNames.map(normalized).filter(Boolean))].sort(),
  }))
  if (
    definitions.some((definition) => !definition.capabilityId || definition.toolNames.length === 0) ||
    new Set(definitions.map((definition) => definition.capabilityId)).size !== definitions.length
  ) {
    throw new Error("Capability selection Skill definitions are invalid.")
  }

  const managedTools = new Set(definitions.flatMap((definition) => definition.toolNames))
  const bindings = input.canonicalSnapshot.bindings
    .filter((binding) =>
      binding.targetId !== ownerAgentId ||
      (!binding.capabilityId.startsWith("action:") && !managedTools.has(binding.capabilityId)),
    )
    .map((binding) => ({ ...binding }))
  const exclusions = input.canonicalSnapshot.exclusions
    .filter((exclusion) =>
      exclusion.targetId !== ownerAgentId || !managedTools.has(exclusion.capabilityId),
    )
    .map((exclusion) => ({ ...exclusion, reasonCodes: [...exclusion.reasonCodes].sort() }))
  const canonicalBindings = new Set(input.canonicalSnapshot.bindings.map(identity))
  const canonicalExclusions = new Set(input.canonicalSnapshot.exclusions.map(identity))
  const candidateContexts: CapabilitySelectionCandidateContext[] = []
  const candidateIdentities = new Set<string>()

  for (const definition of definitions) {
    const ownerBindings = input.skillBindings.filter(
      (binding) =>
        normalized(binding.capabilityId) === definition.capabilityId &&
        normalized(binding.targetId) === ownerAgentId,
    )
    const binding = ownerBindings.length === 1 ? ownerBindings[0] : undefined
    const reasonCodes: string[] = []
    if (!binding) {
      reasonCodes.push(ownerBindings.length > 1 ? "skill_binding_ambiguous" : "skill_binding_missing")
    } else {
      if (binding.status !== "enabled") reasonCodes.push(`skill_binding_${binding.status}`)
      if (!binding.sourceSupported) reasonCodes.push("skill_source_unsupported")
      const bindingToolNames = binding.toolNames
        ? [...new Set(binding.toolNames.map(normalized).filter(Boolean))].sort()
        : definition.toolNames
      if (bindingToolNames.length === 0) reasonCodes.push("skill_tool_scope_empty")
      if (
        bindingToolNames.some((toolName) => {
          const key = identity({ capabilityId: toolName, targetId: ownerAgentId })
          return !canonicalBindings.has(key) || canonicalExclusions.has(key)
        })
      ) {
        reasonCodes.push("skill_tool_unavailable")
      }
    }
    if (reasonCodes.length > 0) {
      exclusions.push({
        capabilityId: definition.capabilityId,
        targetId: ownerAgentId,
        reasonCodes: [...new Set(reasonCodes)].sort(),
      })
    } else if (binding) {
      bindings.push({
        capabilityId: definition.capabilityId,
        targetId: ownerAgentId,
        risk: binding.risk,
      })
      const candidateIdentity = identity({
        capabilityId: definition.capabilityId,
        targetId: ownerAgentId,
      })
      if (candidateIdentities.has(candidateIdentity)) {
        throw new Error("Capability selection candidate identity is ambiguous.")
      }
      candidateIdentities.add(candidateIdentity)
      candidateContexts.push({
        kind: "tool_bundle_skill",
        capabilityId: definition.capabilityId,
        targetId: ownerAgentId,
        toolNames: [...definition.toolNames],
      })
    }
  }

  const findingReasons = new Map<string, Set<string>>()
  for (const finding of input.instructionSkillFindings ?? []) {
    const capabilityId = normalized(finding.capabilityId)
    if (!capabilityId) throw new Error("Instruction Skill finding identity is invalid.")
    const reasons = findingReasons.get(capabilityId) ?? new Set<string>()
    reasons.add(finding.reasonCode)
    findingReasons.set(capabilityId, reasons)
  }
  for (const [capabilityId, reasons] of findingReasons) {
    exclusions.push({
      capabilityId,
      targetId: ownerAgentId,
      reasonCodes: [...reasons].sort(),
    })
  }

  for (const instruction of input.instructionSkills ?? []) {
    const capabilityId = normalized(instruction.capabilityId)
    const targetId = normalized(instruction.targetId)
    const candidateIdentity = identity({ capabilityId, targetId })
    if (
      !capabilityId ||
      targetId !== ownerAgentId ||
      !instruction.content.trim() ||
      !/^sha256:[a-f0-9]{64}$/u.test(instruction.checksum) ||
      candidateIdentities.has(candidateIdentity)
    ) {
      throw new Error("Instruction Skill selection candidate is invalid.")
    }
    candidateIdentities.add(candidateIdentity)
    if (findingReasons.has(capabilityId)) continue
    bindings.push({
      capabilityId,
      targetId,
      risk: instruction.risk,
    })
    candidateContexts.push({
      kind: "instruction_skill",
      capabilityId,
      targetId,
      content: instruction.content,
      checksum: instruction.checksum,
    })
  }

  bindings.sort((left, right) => identity(left).localeCompare(identity(right)))
  exclusions.sort((left, right) => identity(left).localeCompare(identity(right)))
  candidateContexts.sort((left, right) => identity(left).localeCompare(identity(right)))
  const snapshot = { snapshotId, bindings, exclusions, candidateContexts }
  return { ...snapshot, fingerprint: fingerprint(snapshot) }
}
