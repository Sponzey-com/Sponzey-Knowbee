export interface CanonicalModuleOwner {
  moduleId: string
  responsibilityIds: string[]
}

export type NewBoundaryReason =
  | { kind: "dependency_inversion"; detail: string }
  | { kind: "ownership_violation"; detail: string }

export type NewModuleDecision =
  | { status: "extend_existing"; ownerModuleId: string }
  | { status: "new_boundary_eligible"; proposedModuleId: string; reason: NewBoundaryReason["kind"] }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length)
    throw new Error(`${field} values must be unique.`)
  return normalized
}

export function evaluateNewModuleProposal(input: {
  responsibilityId: string
  searchComplete: boolean
  candidateOwners: CanonicalModuleOwner[]
  proposedModuleId: string
  boundaryReason: NewBoundaryReason | null
  evidenceRefs: string[]
}): NewModuleDecision {
  const responsibilityId = required(input.responsibilityId, "Responsibility ID")
  if (!input.searchComplete) throw new Error("Canonical owner search must be complete.")
  const evidenceRefs = unique(input.evidenceRefs, "Module proposal evidence")
  if (evidenceRefs.length === 0) throw new Error("Module proposal evidence is required.")
  const exactOwners = input.candidateOwners.filter((owner) => {
    required(owner.moduleId, "Candidate module ID")
    return unique(owner.responsibilityIds, "Candidate responsibility ID").includes(responsibilityId)
  })
  if (exactOwners.length > 1) throw new Error("Responsibility has multiple canonical owners.")
  const existing = exactOwners[0]
  if (existing) return { status: "extend_existing", ownerModuleId: existing.moduleId }

  const proposedModuleId = required(input.proposedModuleId, "Proposed module ID")
  if (!input.boundaryReason) throw new Error("A concrete new-boundary reason is required.")
  required(input.boundaryReason.detail, "New-boundary reason detail")
  return { status: "new_boundary_eligible", proposedModuleId, reason: input.boundaryReason.kind }
}

export type WrapperOwnedBehavior = "policy" | "transformation" | "validation" | "stable_interface"

export interface ArchitectureSimplicityViolation {
  code: "pass_through_wrapper" | "duplicate_adapter" | "hidden_mutable_global"
  ownerId: string
}

export function evaluateArchitectureSimplicity(input: {
  wrappers: Array<{ moduleId: string; ownedBehaviors: WrapperOwnedBehavior[] }>
  adapters: Array<{ moduleId: string; externalBoundaryId: string; portId: string }>
  globals: Array<{
    symbolId: string
    mutable: boolean
    purpose: "runtime_config" | "registry" | "cache" | "other"
  }>
}): { ok: boolean; violations: ArchitectureSimplicityViolation[] } {
  const violations: ArchitectureSimplicityViolation[] = []
  for (const wrapper of input.wrappers) {
    const moduleId = required(wrapper.moduleId, "Wrapper module ID")
    if (new Set(wrapper.ownedBehaviors).size !== wrapper.ownedBehaviors.length)
      throw new Error("Wrapper behaviors must be unique.")
    if (wrapper.ownedBehaviors.length === 0)
      violations.push({ code: "pass_through_wrapper", ownerId: moduleId })
  }
  const adapterOwners = new Map<string, string>()
  for (const adapter of input.adapters) {
    const moduleId = required(adapter.moduleId, "Adapter module ID")
    const key = `${required(adapter.externalBoundaryId, "External boundary ID")}\u0000${required(adapter.portId, "Port ID")}`
    if (adapterOwners.has(key)) violations.push({ code: "duplicate_adapter", ownerId: moduleId })
    else adapterOwners.set(key, moduleId)
  }
  for (const global of input.globals) {
    const symbolId = required(global.symbolId, "Global symbol ID")
    if (global.mutable && (global.purpose === "runtime_config" || global.purpose === "registry")) {
      violations.push({ code: "hidden_mutable_global", ownerId: symbolId })
    }
  }
  return { ok: violations.length === 0, violations }
}
