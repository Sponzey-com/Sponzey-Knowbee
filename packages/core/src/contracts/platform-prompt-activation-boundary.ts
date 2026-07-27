export const PROMPT_IMPROVEMENT_PLATFORM_IMPACTS = [
  "platform_policy",
  "common_safety",
  "common_tool_policy",
  "common_yeonjang_policy",
  "agent_owned_only",
] as const

export type PromptImprovementPlatformImpact = typeof PROMPT_IMPROVEMENT_PLATFORM_IMPACTS[number]
export type PersistentPromptSourceKind = "prompt_source_file" | "persistent_prompt_record" | "harness_source_file"
export type NextRunPromptActivationMethod = "reload" | "restart" | "next_request_snapshot"

export interface PersistentPromptSourceDescriptor {
  sourceKind: PersistentPromptSourceKind
  sourceRef: string
  baselineVersion: string
  baselineChecksum: string
  proposedVersion: string
  proposedChecksum: string
  rollbackRef: string
}

export interface MainAgentPlatformReviewReceipt {
  schemaVersion: 1
  reviewId: string
  mainAgentId: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  invariantReviewFingerprint: string
  decision: "approved" | "denied"
  reviewedAt: number
  expiresAt: number
}

export interface PromptSourceApplicationAuthorization {
  schemaVersion: 1
  status: "source_write_authorized"
  proposalFingerprint: string
  impact: PromptImprovementPlatformImpact
  sourceSetFingerprint: string
  sources: PersistentPromptSourceDescriptor[]
  mainReviewId?: string
}

export interface VerifiedPromptSourceApplicationReceipt {
  schemaVersion: 1
  proposalFingerprint: string
  sourceSetFingerprint: string
  written: true
  verified: true
  testsPassed: string[]
  writtenSourceVersions: Array<{ sourceRef: string; version: string; checksum: string }>
}

export type PromptSourceApplicationDecision =
  | { status: "authorized"; authorization: PromptSourceApplicationAuthorization }
  | { status: "blocked"; reasonCode: "main_review_missing" | "main_review_denied" | "main_review_expired" | "main_review_scope_mismatch" | "source_kind_invalid" | "source_ref_forbidden" | "source_lineage_invalid" }

export type NextRunPromptActivationDecision =
  | { status: "authorized"; activation: { method: NextRunPromptActivationMethod; activationRunId: string; nextRuntimeSnapshotFingerprint: string } }
  | { status: "blocked"; reasonCode: "source_application_unverified" | "source_application_scope_mismatch" | "regression_tests_missing" | "current_run_mutation" | "current_process_snapshot_mutation" | "loaded_source_mismatch" }

export const FORBIDDEN_PROMPT_IMPROVEMENT_SOURCE_PREFIXES = [
  "memory:",
  "agent-memory:",
  "database:",
  "db:",
] as const

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function timestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

function validateSources(sources: PersistentPromptSourceDescriptor[]): PersistentPromptSourceDescriptor[] | "kind_invalid" | "ref_forbidden" | "lineage_invalid" {
  if (sources.length === 0) throw new Error("At least one persistent prompt source is required.")
  const refs = new Set<string>()
  const normalized: PersistentPromptSourceDescriptor[] = []
  for (const source of sources) {
    if (!["prompt_source_file", "persistent_prompt_record", "harness_source_file"].includes(source.sourceKind)) return "kind_invalid"
    const sourceRef = required(source.sourceRef, "Prompt source reference")
    if (FORBIDDEN_PROMPT_IMPROVEMENT_SOURCE_PREFIXES.some((prefix) => sourceRef.toLocaleLowerCase().startsWith(prefix))) return "ref_forbidden"
    if (refs.has(sourceRef)) throw new Error(`Prompt source references must be unique: ${sourceRef}.`)
    refs.add(sourceRef)
    const baselineVersion = required(source.baselineVersion, "Baseline version")
    const baselineChecksum = required(source.baselineChecksum, "Baseline checksum")
    const proposedVersion = required(source.proposedVersion, "Proposed version")
    const proposedChecksum = required(source.proposedChecksum, "Proposed checksum")
    const rollbackRef = required(source.rollbackRef, "Rollback reference")
    if (baselineVersion === proposedVersion || baselineChecksum === proposedChecksum) return "lineage_invalid"
    normalized.push({ ...source, sourceRef, baselineVersion, baselineChecksum, proposedVersion, proposedChecksum, rollbackRef })
  }
  return normalized
}

export function authorizePromptSourceApplication(input: {
  proposalFingerprint: string
  impact: PromptImprovementPlatformImpact
  sourceSetFingerprint: string
  invariantReviewFingerprint: string
  configuredMainAgentId: string
  sources: PersistentPromptSourceDescriptor[]
  mainReview?: MainAgentPlatformReviewReceipt
  now: number
}): PromptSourceApplicationDecision {
  const proposalFingerprint = required(input.proposalFingerprint, "Proposal fingerprint")
  const sourceSetFingerprint = required(input.sourceSetFingerprint, "Source set fingerprint")
  const invariantReviewFingerprint = required(input.invariantReviewFingerprint, "Invariant review fingerprint")
  const configuredMainAgentId = required(input.configuredMainAgentId, "Configured main agent ID")
  const now = timestamp(input.now, "Current time")
  const sources = validateSources(input.sources)
  if (sources === "kind_invalid") return { status: "blocked", reasonCode: "source_kind_invalid" }
  if (sources === "ref_forbidden") return { status: "blocked", reasonCode: "source_ref_forbidden" }
  if (sources === "lineage_invalid") return { status: "blocked", reasonCode: "source_lineage_invalid" }

  const requiresMainReview = input.impact !== "agent_owned_only"
  const review = input.mainReview
  if (requiresMainReview && !review) return { status: "blocked", reasonCode: "main_review_missing" }
  if (requiresMainReview && review) {
    if (review.schemaVersion !== 1) throw new Error("Unsupported main-agent review schema version.")
    required(review.reviewId, "Main-agent review ID")
    if (review.mainAgentId !== configuredMainAgentId) return { status: "blocked", reasonCode: "main_review_scope_mismatch" }
    if (review.decision !== "approved") return { status: "blocked", reasonCode: "main_review_denied" }
    timestamp(review.reviewedAt, "Main-agent review time")
    timestamp(review.expiresAt, "Main-agent review expiry")
    if (review.reviewedAt > now || review.expiresAt <= now) return { status: "blocked", reasonCode: "main_review_expired" }
    if (review.proposalFingerprint !== proposalFingerprint || review.sourceSetFingerprint !== sourceSetFingerprint || review.invariantReviewFingerprint !== invariantReviewFingerprint) {
      return { status: "blocked", reasonCode: "main_review_scope_mismatch" }
    }
  }
  return {
    status: "authorized",
    authorization: {
      schemaVersion: 1,
      status: "source_write_authorized",
      proposalFingerprint,
      impact: input.impact,
      sourceSetFingerprint,
      sources,
      ...(review ? { mainReviewId: review.reviewId } : {}),
    },
  }
}

export async function writeAuthorizedPromptSources<T>(input: {
  decision: PromptSourceApplicationDecision
  write: (authorization: PromptSourceApplicationAuthorization) => Promise<T>
}): Promise<{ status: "written"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "written", result: await input.write(input.decision.authorization) }
}

export function authorizeNextRunPromptActivation(input: {
  proposalRunId: string
  activationRunId: string
  currentRuntimeSnapshotFingerprint: string
  nextRuntimeSnapshotFingerprint: string
  activationMethod: NextRunPromptActivationMethod
  sourceApplication: VerifiedPromptSourceApplicationReceipt
  expectedProposalFingerprint: string
  expectedSourceSetFingerprint: string
  expectedSources: PersistentPromptSourceDescriptor[]
  requiredTests: string[]
}): NextRunPromptActivationDecision {
  const proposalRunId = required(input.proposalRunId, "Proposal run ID")
  const activationRunId = required(input.activationRunId, "Activation run ID")
  const currentSnapshot = required(input.currentRuntimeSnapshotFingerprint, "Current runtime snapshot fingerprint")
  const nextSnapshot = required(input.nextRuntimeSnapshotFingerprint, "Next runtime snapshot fingerprint")
  if (!input.sourceApplication.written || !input.sourceApplication.verified) return { status: "blocked", reasonCode: "source_application_unverified" }
  if (input.sourceApplication.proposalFingerprint !== input.expectedProposalFingerprint || input.sourceApplication.sourceSetFingerprint !== input.expectedSourceSetFingerprint) {
    return { status: "blocked", reasonCode: "source_application_scope_mismatch" }
  }
  const passedTests = new Set(input.sourceApplication.testsPassed.map((item) => item.trim()).filter(Boolean))
  if (input.requiredTests.length === 0 || input.requiredTests.some((test) => !passedTests.has(test.trim()))) {
    return { status: "blocked", reasonCode: "regression_tests_missing" }
  }
  if (proposalRunId === activationRunId) return { status: "blocked", reasonCode: "current_run_mutation" }
  if (currentSnapshot === nextSnapshot) return { status: "blocked", reasonCode: "current_process_snapshot_mutation" }
  const loaded = new Map(input.sourceApplication.writtenSourceVersions.map((item) => [item.sourceRef, item]))
  if (input.expectedSources.some((source) => {
    const item = loaded.get(source.sourceRef)
    return !item || item.version !== source.proposedVersion || item.checksum !== source.proposedChecksum
  }) || loaded.size !== input.expectedSources.length) return { status: "blocked", reasonCode: "loaded_source_mismatch" }
  return { status: "authorized", activation: { method: input.activationMethod, activationRunId, nextRuntimeSnapshotFingerprint: nextSnapshot } }
}

export async function activateAuthorizedPromptSnapshot<T>(input: {
  decision: NextRunPromptActivationDecision
  activate: (activation: Extract<NextRunPromptActivationDecision, { status: "authorized" }>["activation"]) => Promise<T>
}): Promise<{ status: "activated"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "activated", result: await input.activate(input.decision.activation) }
}
