import type { OwnerScope } from "../contracts/sub-agent-orchestration.js"

export type LongTermMemoryStorageNeed =
  | "durable_user_fact"
  | "user_preference"
  | "project_fact"
  | "agent_learning"
  | "approved_child_result"
  | "trusted_setting"

export const LONG_TERM_MEMORY_CATEGORIES = [
  "recurring_user_preference",
  "agent_role_knowledge",
  "confirmed_decision",
  "long_horizon_goal",
  "approved_work_context",
] as const
export type LongTermMemoryCategory = typeof LONG_TERM_MEMORY_CATEGORIES[number]

export type LongTermMemorySensitivity =
  | "not_sensitive"
  | "personal"
  | "internal"
  | "sensitive"
  | "secret"

export type LongTermMemoryUserIntent =
  | "explicit_user_request"
  | "trusted_setting"
  | "parent_review_accepted"
  | "learning_event_approved"
  | "admin_review_approved"

export type LongTermMemoryWriteGateIssueCode =
  | "target_owner_missing"
  | "target_owner_mismatch"
  | "target_owner_not_writable"
  | "storage_need_missing"
  | "storage_need_invalid"
  | "category_missing"
  | "category_invalid"
  | "sensitivity_missing"
  | "sensitivity_invalid"
  | "sensitivity_blocked"
  | "user_intent_missing"
  | "user_intent_invalid"
  | "source_evidence_missing"
  | "retention_purpose_missing"

export interface LongTermMemoryWriteGateInput {
  targetOwner: OwnerScope
  category: LongTermMemoryCategory
  storageNeed: LongTermMemoryStorageNeed
  sensitivity: LongTermMemorySensitivity
  userIntent: LongTermMemoryUserIntent
  sourceEvidenceRefs: string[]
  retentionPurpose: string
}

export interface LongTermMemoryWriteGateDecision {
  ok: boolean
  issueCodes: LongTermMemoryWriteGateIssueCode[]
  targetOwnerScopeKey?: string
  category?: LongTermMemoryCategory
  storageNeed?: LongTermMemoryStorageNeed
  sensitivity?: LongTermMemorySensitivity
  userIntent?: LongTermMemoryUserIntent
  sourceEvidenceRefs: string[]
  retentionPurpose?: string
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeStringArray(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeString(value)).filter((value): value is string => Boolean(value)))]
}

export function longTermMemoryOwnerScopeKey(owner: OwnerScope): string {
  return `${owner.ownerType}:${owner.ownerId.trim()}`
}

function isOwnerMissing(owner: OwnerScope | undefined): boolean {
  return !owner?.ownerType || !normalizeString(owner.ownerId)
}

function isOwnerWritable(owner: OwnerScope): boolean {
  return (owner.ownerType === "knowbee" || owner.ownerType === "sub_agent") && !isOwnerMissing(owner)
}

const STORAGE_NEEDS = new Set<string>(["durable_user_fact", "user_preference", "project_fact", "agent_learning", "approved_child_result", "trusted_setting"])
const SENSITIVITIES = new Set<string>(["not_sensitive", "personal", "internal", "sensitive", "secret"])
const USER_INTENTS = new Set<string>(["explicit_user_request", "trusted_setting", "parent_review_accepted", "learning_event_approved", "admin_review_approved"])
const CATEGORIES = new Set<string>(LONG_TERM_MEMORY_CATEGORIES)

export function validateLongTermMemoryWriteGate(
  input: LongTermMemoryWriteGateInput,
  options: { expectedOwner?: OwnerScope } = {},
): LongTermMemoryWriteGateDecision {
  const issueCodes: LongTermMemoryWriteGateIssueCode[] = []
  const sourceEvidenceRefs = normalizeStringArray(input.sourceEvidenceRefs ?? [])
  const retentionPurpose = normalizeString(input.retentionPurpose)

  if (isOwnerMissing(input.targetOwner)) issueCodes.push("target_owner_missing")
  else if (!isOwnerWritable(input.targetOwner)) issueCodes.push("target_owner_not_writable")

  if (
    options.expectedOwner &&
    (
      options.expectedOwner.ownerType !== input.targetOwner.ownerType ||
      options.expectedOwner.ownerId.trim() !== input.targetOwner.ownerId.trim()
    )
  ) {
    issueCodes.push("target_owner_mismatch")
  }
  if (!input.category) issueCodes.push("category_missing")
  else if (!CATEGORIES.has(input.category)) issueCodes.push("category_invalid")
  if (!input.storageNeed) issueCodes.push("storage_need_missing")
  else if (!STORAGE_NEEDS.has(input.storageNeed)) issueCodes.push("storage_need_invalid")
  if (!input.sensitivity) issueCodes.push("sensitivity_missing")
  else if (!SENSITIVITIES.has(input.sensitivity)) issueCodes.push("sensitivity_invalid")
  if (input.sensitivity === "secret") issueCodes.push("sensitivity_blocked")
  if (!input.userIntent) issueCodes.push("user_intent_missing")
  else if (!USER_INTENTS.has(input.userIntent)) issueCodes.push("user_intent_invalid")
  if (sourceEvidenceRefs.length === 0) issueCodes.push("source_evidence_missing")
  if (!retentionPurpose) issueCodes.push("retention_purpose_missing")

  return {
    ok: issueCodes.length === 0,
    issueCodes: [...new Set(issueCodes)],
    ...(!isOwnerMissing(input.targetOwner)
      ? { targetOwnerScopeKey: longTermMemoryOwnerScopeKey(input.targetOwner) }
      : {}),
    ...(CATEGORIES.has(input.category) ? { category: input.category } : {}),
    ...(input.storageNeed ? { storageNeed: input.storageNeed } : {}),
    ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}),
    ...(input.userIntent ? { userIntent: input.userIntent } : {}),
    sourceEvidenceRefs,
    ...(retentionPurpose ? { retentionPurpose } : {}),
  }
}
