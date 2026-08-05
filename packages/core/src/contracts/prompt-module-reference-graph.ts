export interface PromptModuleResponsibilityManifest {
  moduleId: string
  version: string
  ownedResponsibilityIds: string[]
  allowedReferenceResponsibilityIds: string[]
}

export interface CanonicalPromptRuleOwner {
  ruleKey: string
  moduleId: string
  ruleId: string
  responsibilityId: string
  version: string
  definitionFingerprint: string
}

export interface PromptModuleRuleReference {
  sourceModuleId: string
  targetModuleId: string
  ruleKey: string
  targetRuleId: string
  targetResponsibilityId: string
  expectedVersion: string
  expectedDefinitionFingerprint: string
  repeatsDefinitionBody: boolean
}

export type PromptModuleReferenceIssueCode =
  | "module_duplicate"
  | "module_unknown"
  | "canonical_owner_duplicate"
  | "canonical_owner_missing"
  | "definition_responsibility_out_of_scope"
  | "reference_responsibility_out_of_scope"
  | "reference_target_mismatch"
  | "reference_version_stale"
  | "reference_fingerprint_stale"
  | "reference_repeats_definition"
  | "reference_cycle"

export interface PromptModuleReferenceIssue {
  code: PromptModuleReferenceIssueCode
  subjectId: string
}

export type PromptModuleReferenceDecision =
  | { status: "eligible"; moduleIds: string[]; ruleKeys: string[] }
  | { status: "blocked"; issues: PromptModuleReferenceIssue[] }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} values must be unique.`)
  return normalized
}

function cyclicModules(edges: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>()
  const active = new Set<string>()
  const cyclic = new Set<string>()
  const visit = (moduleId: string): void => {
    if (active.has(moduleId)) { cyclic.add(moduleId); return }
    if (visited.has(moduleId)) return
    active.add(moduleId)
    for (const next of edges.get(moduleId) ?? []) {
      if (active.has(next)) { cyclic.add(moduleId); cyclic.add(next) }
      else visit(next)
      if (cyclic.has(next)) cyclic.add(moduleId)
    }
    active.delete(moduleId)
    visited.add(moduleId)
  }
  for (const moduleId of edges.keys()) visit(moduleId)
  return cyclic
}

export function evaluatePromptModuleReferenceGraph(input: {
  manifests: PromptModuleResponsibilityManifest[]
  owners: CanonicalPromptRuleOwner[]
  references: PromptModuleRuleReference[]
}): PromptModuleReferenceDecision {
  const issues: PromptModuleReferenceIssue[] = []
  const add = (code: PromptModuleReferenceIssueCode, subjectId: string): void => { issues.push({ code, subjectId }) }
  const manifests = new Map<string, PromptModuleResponsibilityManifest>()
  for (const manifest of input.manifests) {
    const moduleId = required(manifest.moduleId, "Prompt module ID")
    required(manifest.version, "Prompt module version")
    const normalized = { ...manifest, ownedResponsibilityIds: unique(manifest.ownedResponsibilityIds, "Owned responsibility"), allowedReferenceResponsibilityIds: unique(manifest.allowedReferenceResponsibilityIds, "Allowed reference responsibility") }
    if (manifests.has(moduleId)) add("module_duplicate", moduleId)
    manifests.set(moduleId, normalized)
  }
  const owners = new Map<string, CanonicalPromptRuleOwner>()
  for (const owner of input.owners) {
    const ruleKey = required(owner.ruleKey, "Canonical rule key")
    const moduleId = required(owner.moduleId, "Canonical owner module ID")
    required(owner.ruleId, "Canonical rule ID")
    required(owner.responsibilityId, "Canonical responsibility ID")
    required(owner.version, "Canonical rule version")
    required(owner.definitionFingerprint, "Canonical definition fingerprint")
    if (owners.has(ruleKey)) add("canonical_owner_duplicate", ruleKey)
    owners.set(ruleKey, owner)
    const manifest = manifests.get(moduleId)
    if (!manifest) add("module_unknown", moduleId)
    else if (!manifest.ownedResponsibilityIds.includes(owner.responsibilityId)) add("definition_responsibility_out_of_scope", ruleKey)
  }

  const edges = new Map<string, Set<string>>()
  for (const reference of input.references) {
    const sourceId = required(reference.sourceModuleId, "Reference source module ID")
    const targetId = required(reference.targetModuleId, "Reference target module ID")
    const ruleKey = required(reference.ruleKey, "Reference rule key")
    const source = manifests.get(sourceId)
    const target = manifests.get(targetId)
    if (!source) add("module_unknown", sourceId)
    if (!target) add("module_unknown", targetId)
    const owner = owners.get(ruleKey)
    if (!owner) { add("canonical_owner_missing", ruleKey); continue }
    if (owner.moduleId !== targetId || owner.ruleId !== reference.targetRuleId || owner.responsibilityId !== reference.targetResponsibilityId) add("reference_target_mismatch", ruleKey)
    if (owner.version !== reference.expectedVersion) add("reference_version_stale", ruleKey)
    if (owner.definitionFingerprint !== reference.expectedDefinitionFingerprint) add("reference_fingerprint_stale", ruleKey)
    if (reference.repeatsDefinitionBody) add("reference_repeats_definition", ruleKey)
    if (source && !source.allowedReferenceResponsibilityIds.includes(reference.targetResponsibilityId)) add("reference_responsibility_out_of_scope", `${sourceId}:${ruleKey}`)
    const targets = edges.get(sourceId) ?? new Set<string>()
    targets.add(targetId)
    edges.set(sourceId, targets)
  }
  for (const moduleId of cyclicModules(edges)) add("reference_cycle", moduleId)
  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}`, issue])).values()]
  return uniqueIssues.length > 0
    ? { status: "blocked", issues: uniqueIssues }
    : { status: "eligible", moduleIds: [...manifests.keys()], ruleKeys: [...owners.keys()] }
}

export async function writeReferenceEligiblePromptModules<T>(input: {
  decision: PromptModuleReferenceDecision
  write: (decision: Extract<PromptModuleReferenceDecision, { status: "eligible" }>) => Promise<T>
}): Promise<{ status: "written"; result: T } | Extract<PromptModuleReferenceDecision, { status: "blocked" }>> {
  if (input.decision.status !== "eligible") return input.decision
  return { status: "written", result: await input.write(input.decision) }
}
