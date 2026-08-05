export type PromptModuleRuleKind = "policy" | "exception" | "procedure" | "reference"

export interface PromptModuleRuleBoundary {
  ruleKey: string
  moduleId: string
  kind: PromptModuleRuleKind
  responsibilityId: string
  moduleOwnedResponsibilityIds: string[]
  canonicalOwnerModuleId: string
}

export interface PromptRuleConsolidationReceipt {
  semanticRuleKey: string
  canonicalOwnerModuleId: string
  activeDefinitionModuleIds: string[]
  removedDuplicateModuleIds: string[]
  updatedConsumerReferenceModuleIds: string[]
  unresolvedConflictModuleIds: string[]
}

export interface PromptSemanticScope {
  actorRefs: string[]
  targetRefs: string[]
  permissionRefs: string[]
  exceptionRefs: string[]
  dataAccessRefs: string[]
  conditionStrictness: number
  parserConfidence: number
  fingerprint: string
}

export type PromptScopeNarrowingIssueCode =
  | "module_rule_out_of_scope"
  | "module_rule_owner_mismatch"
  | "consolidation_definition_count_invalid"
  | "consolidation_conflict_unresolved"
  | "consolidation_reference_update_missing"
  | "semantic_parser_confidence_low"
  | "semantic_scope_broadened"
  | "semantic_condition_weakened"

export interface PromptScopeNarrowingIssue {
  code: PromptScopeNarrowingIssueCode
  subjectId: string
  dimension?: "actor" | "target" | "permission" | "exception" | "data_access" | "condition"
}

export type PromptScopeNarrowingDecision =
  | { status: "eligible"; semanticScopeFingerprint: string }
  | { status: "blocked"; issues: PromptScopeNarrowingIssue[] }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function normalizedSet(values: string[], field: string): Set<string> {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} values must be unique.`)
  return new Set(normalized)
}

function isSubset(candidate: Set<string>, baseline: Set<string>): boolean {
  return [...candidate].every((value) => baseline.has(value))
}

function confidence(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${field} must be between 0 and 1.`)
  return value
}

export function evaluatePromptScopeNarrowing(input: {
  rules: PromptModuleRuleBoundary[]
  consolidations: PromptRuleConsolidationReceipt[]
  baselineScope: PromptSemanticScope
  proposedScope: PromptSemanticScope
  minimumParserConfidence: number
}): PromptScopeNarrowingDecision {
  if (!Number.isFinite(input.minimumParserConfidence) || input.minimumParserConfidence < 0 || input.minimumParserConfidence > 1) {
    throw new Error("minimumParserConfidence must be between 0 and 1.")
  }
  const issues: PromptScopeNarrowingIssue[] = []
  const add = (code: PromptScopeNarrowingIssueCode, subjectId: string, dimension?: PromptScopeNarrowingIssue["dimension"]): void => {
    issues.push({ code, subjectId, ...(dimension ? { dimension } : {}) })
  }
  for (const rule of input.rules) {
    const ruleKey = required(rule.ruleKey, "Prompt rule key")
    const moduleId = required(rule.moduleId, "Prompt rule module ID")
    const responsibilityId = required(rule.responsibilityId, "Prompt rule responsibility ID")
    const canonicalOwnerModuleId = required(rule.canonicalOwnerModuleId, "Canonical owner module ID")
    const owned = normalizedSet(rule.moduleOwnedResponsibilityIds, "Module owned responsibility")
    if (rule.kind !== "reference" && !owned.has(responsibilityId)) add("module_rule_out_of_scope", ruleKey)
    if (rule.kind !== "reference" && canonicalOwnerModuleId !== moduleId) add("module_rule_owner_mismatch", ruleKey)
  }
  for (const receipt of input.consolidations) {
    const key = required(receipt.semanticRuleKey, "Semantic rule key")
    const owner = required(receipt.canonicalOwnerModuleId, "Canonical owner module ID")
    if (receipt.activeDefinitionModuleIds.length !== 1 || receipt.activeDefinitionModuleIds[0] !== owner) add("consolidation_definition_count_invalid", key)
    if (receipt.unresolvedConflictModuleIds.length > 0) add("consolidation_conflict_unresolved", key)
    const removed = normalizedSet(receipt.removedDuplicateModuleIds, "Removed duplicate module ID")
    const updated = normalizedSet(receipt.updatedConsumerReferenceModuleIds, "Updated consumer reference module ID")
    if ([...removed].some((moduleId) => !updated.has(moduleId))) add("consolidation_reference_update_missing", key)
  }
  const baseline = input.baselineScope
  const proposed = input.proposedScope
  required(baseline.fingerprint, "Baseline semantic scope fingerprint")
  const proposedFingerprint = required(proposed.fingerprint, "Proposed semantic scope fingerprint")
  if (
    confidence(baseline.parserConfidence, "Baseline parser confidence") < input.minimumParserConfidence ||
    confidence(proposed.parserConfidence, "Proposed parser confidence") < input.minimumParserConfidence
  ) {
    add("semantic_parser_confidence_low", proposedFingerprint)
  }
  const dimensions = [
    ["actor", baseline.actorRefs, proposed.actorRefs],
    ["target", baseline.targetRefs, proposed.targetRefs],
    ["permission", baseline.permissionRefs, proposed.permissionRefs],
    ["exception", baseline.exceptionRefs, proposed.exceptionRefs],
    ["data_access", baseline.dataAccessRefs, proposed.dataAccessRefs],
  ] as const
  for (const [dimension, before, after] of dimensions) {
    if (!isSubset(normalizedSet(after, `Proposed ${dimension} scope`), normalizedSet(before, `Baseline ${dimension} scope`))) {
      add("semantic_scope_broadened", proposedFingerprint, dimension)
    }
  }
  if (!Number.isFinite(baseline.conditionStrictness) || !Number.isFinite(proposed.conditionStrictness)) throw new Error("Condition strictness must be finite.")
  if (proposed.conditionStrictness < baseline.conditionStrictness) add("semantic_condition_weakened", proposedFingerprint, "condition")
  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}\u0000${issue.dimension ?? ""}`, issue])).values()]
  return uniqueIssues.length > 0 ? { status: "blocked", issues: uniqueIssues } : { status: "eligible", semanticScopeFingerprint: proposedFingerprint }
}

export async function writeNarrowedPromptScope<T>(input: {
  decision: PromptScopeNarrowingDecision
  write: (decision: Extract<PromptScopeNarrowingDecision, { status: "eligible" }>) => Promise<T>
}): Promise<{ status: "written"; result: T } | Extract<PromptScopeNarrowingDecision, { status: "blocked" }>> {
  if (input.decision.status !== "eligible") return input.decision
  return { status: "written", result: await input.write(input.decision) }
}
