import type { CapabilityRiskLevel } from "./sub-agent-orchestration.js"
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js"

export const EXTERNAL_EFFECT_APPROVAL_KINDS = [
  "tool",
  "mcp",
  "yeonjang",
  "filesystem",
  "network",
  "external_service",
] as const

export type ExternalEffectApprovalKind = (typeof EXTERNAL_EFFECT_APPROVAL_KINDS)[number]
export type PromptApprovalGateLevel = "none" | "policy" | "explicit"
export type PromptCapabilityCatalogKind = "skill" | "mcp_server"
export type PromptCapabilityStatus = "enabled" | "disabled" | "archived"

export interface PromptCapabilityCatalogEntry {
  catalogId: string
  status: PromptCapabilityStatus
  toolNames: string[]
}

export interface PromptCapabilityCatalogSnapshot {
  schemaVersion: 1
  fingerprint: string
  skills: PromptCapabilityCatalogEntry[]
  mcpServers: PromptCapabilityCatalogEntry[]
}

export interface PromptCapabilityBindingSnapshot {
  bindingId: string
  ownerAgentId: string
  catalogKind: PromptCapabilityCatalogKind
  catalogId: string
  status: PromptCapabilityStatus
  enabledToolNames: string[]
  disabledToolNames: string[]
  secretScopeId?: string
  permissionProfileId: string
  riskCeiling: CapabilityRiskLevel
  approvalRequiredFrom: CapabilityRiskLevel
  approvalGates: Record<ExternalEffectApprovalKind, PromptApprovalGateLevel>
}

export interface PromptCapabilityStateSnapshot {
  schemaVersion: 1
  stateKind: "baseline" | "proposed"
  catalogFingerprint: string
  activeAgentIds: string[]
  bindings: PromptCapabilityBindingSnapshot[]
}

export interface PromptImprovementToolMcpInvariantReceipt {
  schemaVersion: 1
  invariant: "tool_boundary"
  decision: "preserved"
  proposalFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
  catalogFingerprint: string
  activeAgentIds: string[]
  reviewedBindingCount: number
  approvalKinds: ExternalEffectApprovalKind[]
}

export type PromptImprovementToolMcpInvariantReasonCode =
  | "catalog_snapshot_invalid"
  | "catalog_policy_changed"
  | "catalog_lineage_mismatch"
  | "capability_state_invalid"
  | "active_agent_scope_changed"
  | "binding_identity_shared"
  | "binding_owner_mismatch"
  | "binding_scope_changed"
  | "binding_catalog_reference_invalid"
  | "secret_scope_shared"
  | "capability_binding_added"
  | "capability_binding_reactivated"
  | "tool_access_expanded"
  | "disabled_tool_reactivated"
  | "risk_ceiling_expanded"
  | "approval_threshold_weakened"
  | "approval_gate_weakened"
  | "tool_mcp_review_lineage_invalid"

export type PromptImprovementToolMcpInvariantDecision =
  | { status: "authorized"; receipt: PromptImprovementToolMcpInvariantReceipt }
  | { status: "blocked"; reasonCode: PromptImprovementToolMcpInvariantReasonCode }

export type ToolMcpBoundaryInvariantProjectionDecision =
  | { status: "authorized"; review: PlatformPromptInvariantReview }
  | { status: "blocked"; reasonCode:
      | "tool_mcp_review_receipt_invalid"
      | "tool_mcp_review_expired"
      | "tool_mcp_review_scope_mismatch"
      | "goal_section3_lineage_mismatch" }

const RISK_ORDER: Record<CapabilityRiskLevel, number> = {
  safe: 0,
  moderate: 1,
  external: 2,
  sensitive: 3,
  dangerous: 4,
}

const APPROVAL_ORDER: Record<PromptApprovalGateLevel, number> = {
  none: 0,
  policy: 1,
  explicit: 2,
}

const CAPABILITY_STATUSES = new Set<PromptCapabilityStatus>(["enabled", "disabled", "archived"])
const RISK_LEVELS = new Set<CapabilityRiskLevel>(Object.keys(RISK_ORDER) as CapabilityRiskLevel[])
const APPROVAL_LEVELS = new Set<PromptApprovalGateLevel>(Object.keys(APPROVAL_ORDER) as PromptApprovalGateLevel[])

function exact(value: string | undefined): string {
  return value?.trim() ?? ""
}

function unique(values: string[]): string[] | undefined {
  const normalized = values.map(exact)
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) return undefined
  return normalized
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function sameSet(left: string[], right: string[]): boolean {
  const normalizedLeft = unique(left)
  const normalizedRight = unique(right)
  return Boolean(normalizedLeft && normalizedRight
    && normalizedLeft.length === normalizedRight.length
    && sorted(normalizedLeft).every((value, index) => value === sorted(normalizedRight)[index]))
}

function subset(candidate: string[], ceiling: string[]): boolean {
  const normalizedCandidate = unique(candidate)
  const normalizedCeiling = unique(ceiling)
  if (!normalizedCandidate || !normalizedCeiling) return false
  const allowed = new Set(normalizedCeiling)
  return normalizedCandidate.every((value) => allowed.has(value))
}

function catalogEntries(snapshot: PromptCapabilityCatalogSnapshot): Array<PromptCapabilityCatalogEntry & { kind: PromptCapabilityCatalogKind }> {
  return [
    ...snapshot.skills.map((entry) => ({ ...entry, kind: "skill" as const })),
    ...snapshot.mcpServers.map((entry) => ({ ...entry, kind: "mcp_server" as const })),
  ]
}

function catalogSignature(snapshot: PromptCapabilityCatalogSnapshot): string[] | undefined {
  if (snapshot.schemaVersion !== 1 || !exact(snapshot.fingerprint)) return undefined
  const entries = catalogEntries(snapshot)
  const keys = entries.map((entry) => `${entry.kind}:${exact(entry.catalogId)}`)
  if (!unique(keys)) return undefined
  const signatures: string[] = []
  for (const entry of entries) {
    const tools = unique(entry.toolNames)
    if (!exact(entry.catalogId) || !CAPABILITY_STATUSES.has(entry.status) || !tools) return undefined
    signatures.push(`${entry.kind}:${entry.catalogId}:${entry.status}:${sorted(tools).join(",")}`)
  }
  return sorted(signatures)
}

function approvalGatesValid(gates: PromptCapabilityBindingSnapshot["approvalGates"]): boolean {
  return EXTERNAL_EFFECT_APPROVAL_KINDS.every((kind) => APPROVAL_LEVELS.has(gates?.[kind]))
}

function stateStructureValid(snapshot: PromptCapabilityStateSnapshot, expectedKind: PromptCapabilityStateSnapshot["stateKind"]): boolean {
  if (snapshot.schemaVersion !== 1 || snapshot.stateKind !== expectedKind || !exact(snapshot.catalogFingerprint)
    || !unique(snapshot.activeAgentIds) || snapshot.activeAgentIds.length === 0) return false
  return snapshot.bindings.every((binding) => Boolean(
    exact(binding.bindingId) && exact(binding.ownerAgentId) && exact(binding.catalogId)
    && exact(binding.permissionProfileId) && CAPABILITY_STATUSES.has(binding.status)
    && (binding.catalogKind === "skill" || binding.catalogKind === "mcp_server")
    && unique(binding.enabledToolNames) && unique(binding.disabledToolNames)
    && RISK_LEVELS.has(binding.riskCeiling) && RISK_LEVELS.has(binding.approvalRequiredFrom)
    && approvalGatesValid(binding.approvalGates)
    && (binding.secretScopeId === undefined || Boolean(exact(binding.secretScopeId))),
  ))
}

function duplicateBindingId(snapshot: PromptCapabilityStateSnapshot): boolean {
  const ids = snapshot.bindings.map((binding) => exact(binding.bindingId))
  return new Set(ids).size !== ids.length
}

function hasSharedSecretScope(snapshot: PromptCapabilityStateSnapshot): boolean {
  const ownersByScope = new Map<string, Set<string>>()
  for (const binding of snapshot.bindings) {
    const scope = exact(binding.secretScopeId)
    if (!scope) continue
    const owners = ownersByScope.get(scope) ?? new Set<string>()
    owners.add(binding.ownerAgentId)
    ownersByScope.set(scope, owners)
  }
  return [...ownersByScope.values()].some((owners) => owners.size > 1)
}

function catalogContainsBinding(catalog: PromptCapabilityCatalogSnapshot, binding: PromptCapabilityBindingSnapshot): boolean {
  const entries = binding.catalogKind === "skill" ? catalog.skills : catalog.mcpServers
  return entries.some((entry) => entry.catalogId === binding.catalogId)
}

function lineageValid(input: {
  proposalFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
}): boolean {
  return Boolean(exact(input.proposalFingerprint) && exact(input.baselineFingerprint)
    && exact(input.proposedFingerprint) && input.baselineFingerprint !== input.proposedFingerprint
    && exact(input.goalSection3Fingerprint) && exact(input.reviewerRef)
    && Number.isSafeInteger(input.reviewedAt) && input.reviewedAt >= 0
    && Number.isSafeInteger(input.expiresAt) && input.expiresAt > input.reviewedAt)
}

export function authorizePromptImprovementToolMcpInvariant(input: {
  baselineCatalog: PromptCapabilityCatalogSnapshot
  proposedCatalog: PromptCapabilityCatalogSnapshot
  baseline: PromptCapabilityStateSnapshot
  proposed: PromptCapabilityStateSnapshot
  proposalFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
}): PromptImprovementToolMcpInvariantDecision {
  const baselineCatalogSignature = catalogSignature(input.baselineCatalog)
  const proposedCatalogSignature = catalogSignature(input.proposedCatalog)
  if (!baselineCatalogSignature || !proposedCatalogSignature) {
    return { status: "blocked", reasonCode: "catalog_snapshot_invalid" }
  }
  if (input.baselineCatalog.fingerprint !== input.proposedCatalog.fingerprint
    || !sameSet(baselineCatalogSignature, proposedCatalogSignature)) {
    return { status: "blocked", reasonCode: "catalog_policy_changed" }
  }
  if (!stateStructureValid(input.baseline, "baseline") || !stateStructureValid(input.proposed, "proposed")) {
    return { status: "blocked", reasonCode: "capability_state_invalid" }
  }
  if (input.baseline.catalogFingerprint !== input.baselineCatalog.fingerprint
    || input.proposed.catalogFingerprint !== input.proposedCatalog.fingerprint) {
    return { status: "blocked", reasonCode: "catalog_lineage_mismatch" }
  }
  if (!sameSet(input.baseline.activeAgentIds, input.proposed.activeAgentIds)) {
    return { status: "blocked", reasonCode: "active_agent_scope_changed" }
  }
  if (duplicateBindingId(input.baseline) || duplicateBindingId(input.proposed)) {
    return { status: "blocked", reasonCode: "binding_identity_shared" }
  }
  if (hasSharedSecretScope(input.baseline) || hasSharedSecretScope(input.proposed)) {
    return { status: "blocked", reasonCode: "secret_scope_shared" }
  }
  if (input.baseline.bindings.some((binding) => !catalogContainsBinding(input.baselineCatalog, binding))) {
    return { status: "blocked", reasonCode: "binding_catalog_reference_invalid" }
  }
  const activeAgents = new Set(input.baseline.activeAgentIds)
  if ([...input.baseline.bindings, ...input.proposed.bindings].some((binding) => !activeAgents.has(binding.ownerAgentId))) {
    return { status: "blocked", reasonCode: "binding_owner_mismatch" }
  }

  const baselineById = new Map(input.baseline.bindings.map((binding) => [binding.bindingId, binding]))
  for (const proposed of input.proposed.bindings) {
    const baseline = baselineById.get(proposed.bindingId)
    if (!baseline) return { status: "blocked", reasonCode: "capability_binding_added" }
    if (baseline.ownerAgentId !== proposed.ownerAgentId) {
      return { status: "blocked", reasonCode: "binding_owner_mismatch" }
    }
    if (baseline.catalogKind !== proposed.catalogKind || baseline.catalogId !== proposed.catalogId) {
      return { status: "blocked", reasonCode: "binding_scope_changed" }
    }
    if (exact(baseline.secretScopeId) !== exact(proposed.secretScopeId)
      || baseline.permissionProfileId !== proposed.permissionProfileId) {
      return { status: "blocked", reasonCode: "binding_scope_changed" }
    }
    if (!catalogContainsBinding(input.proposedCatalog, proposed)) {
      return { status: "blocked", reasonCode: "binding_catalog_reference_invalid" }
    }
    if (baseline.status !== "enabled" && proposed.status === "enabled") {
      return { status: "blocked", reasonCode: "capability_binding_reactivated" }
    }
    if (proposed.status !== "enabled") continue
    if (!subset(proposed.enabledToolNames, baseline.enabledToolNames)) {
      return { status: "blocked", reasonCode: "tool_access_expanded" }
    }
    if (!subset(baseline.disabledToolNames, proposed.disabledToolNames)) {
      return { status: "blocked", reasonCode: "disabled_tool_reactivated" }
    }
    if (RISK_ORDER[proposed.riskCeiling] > RISK_ORDER[baseline.riskCeiling]) {
      return { status: "blocked", reasonCode: "risk_ceiling_expanded" }
    }
    if (RISK_ORDER[proposed.approvalRequiredFrom] > RISK_ORDER[baseline.approvalRequiredFrom]) {
      return { status: "blocked", reasonCode: "approval_threshold_weakened" }
    }
    if (EXTERNAL_EFFECT_APPROVAL_KINDS.some((kind) =>
      APPROVAL_ORDER[proposed.approvalGates[kind]] < APPROVAL_ORDER[baseline.approvalGates[kind]],
    )) {
      return { status: "blocked", reasonCode: "approval_gate_weakened" }
    }
  }
  if (!lineageValid(input)) {
    return { status: "blocked", reasonCode: "tool_mcp_review_lineage_invalid" }
  }
  return {
    status: "authorized",
    receipt: {
      schemaVersion: 1,
      invariant: "tool_boundary",
      decision: "preserved",
      proposalFingerprint: exact(input.proposalFingerprint),
      baselineFingerprint: exact(input.baselineFingerprint),
      proposedFingerprint: exact(input.proposedFingerprint),
      goalSection3Fingerprint: exact(input.goalSection3Fingerprint),
      reviewerRef: exact(input.reviewerRef),
      reviewedAt: input.reviewedAt,
      expiresAt: input.expiresAt,
      catalogFingerprint: input.baselineCatalog.fingerprint,
      activeAgentIds: sorted(input.baseline.activeAgentIds),
      reviewedBindingCount: input.baseline.bindings.length,
      approvalKinds: [...EXTERNAL_EFFECT_APPROVAL_KINDS],
    },
  }
}

export function projectToolMcpBoundaryInvariantReview(input: {
  receipt: PromptImprovementToolMcpInvariantReceipt
  expectedProposalFingerprint: string
  currentGoalSection3Fingerprint: string
  now: number
}): ToolMcpBoundaryInvariantProjectionDecision {
  const receipt = input.receipt
  if (receipt.schemaVersion !== 1 || receipt.invariant !== "tool_boundary" || receipt.decision !== "preserved"
    || !exact(receipt.proposalFingerprint) || !exact(receipt.baselineFingerprint) || !exact(receipt.proposedFingerprint)
    || receipt.baselineFingerprint === receipt.proposedFingerprint || !exact(receipt.catalogFingerprint)
    || !exact(receipt.reviewerRef) || !unique(receipt.activeAgentIds) || receipt.activeAgentIds.length === 0
    || !Number.isSafeInteger(receipt.reviewedBindingCount) || receipt.reviewedBindingCount < 0
    || !sameSet(receipt.approvalKinds, [...EXTERNAL_EFFECT_APPROVAL_KINDS])
    || !Number.isSafeInteger(receipt.reviewedAt) || !Number.isSafeInteger(receipt.expiresAt)
    || !Number.isSafeInteger(input.now) || receipt.reviewedAt > input.now) {
    return { status: "blocked", reasonCode: "tool_mcp_review_receipt_invalid" }
  }
  if (receipt.expiresAt <= input.now) return { status: "blocked", reasonCode: "tool_mcp_review_expired" }
  if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
    return { status: "blocked", reasonCode: "tool_mcp_review_scope_mismatch" }
  }
  if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
    return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" }
  }
  return {
    status: "authorized",
    review: {
      invariant: "tool_boundary",
      proposalFingerprint: receipt.proposalFingerprint,
      baselineFingerprint: receipt.baselineFingerprint,
      proposedFingerprint: receipt.proposedFingerprint,
      decision: "preserved",
      reviewerRef: receipt.reviewerRef,
      reviewedAt: receipt.reviewedAt,
      expiresAt: receipt.expiresAt,
    },
  }
}
