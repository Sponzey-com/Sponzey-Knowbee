export const BEHAVIOR_POLICY_SUMMARY_CATEGORIES = [
  "identity",
  "response_language",
  "memory_isolation",
  "delegation",
  "tool_and_yeonjang_boundary",
  "prompt_improvement",
  "final_response",
] as const

export const PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES = [
  "secret",
  "token",
  "credential",
  "private_memory",
  "internal_path",
  "personal_data",
  "security_configuration",
  "channel_identifier",
] as const

export type BehaviorPolicySummaryCategory = typeof BEHAVIOR_POLICY_SUMMARY_CATEGORIES[number]
export type PromptDisclosureSensitiveCategory = typeof PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES[number]

export interface BehaviorPolicySummaryProjection {
  schemaVersion: 1
  projection: "behavior_policy_summary"
  categories: BehaviorPolicySummaryCategory[]
  maxRenderedCharacters: number
}

export interface PromptDisclosureRedactionReceipt {
  schemaVersion: 1
  receiptId: string
  sourceFingerprint: string
  redactedOutputFingerprint: string
  policyVersion: string
  scannedCategories: PromptDisclosureSensitiveCategory[]
  residualCategories: PromptDisclosureSensitiveCategory[]
  replacementCount: number
  scannerSucceeded: boolean
  verifierRef: string
  verifiedAt: number
  expiresAt: number
}

export type PromptDisclosureRedactionDecision =
  | { status: "deliverable"; receiptId: string; redactedOutputFingerprint: string }
  | { status: "blocked"; reasonCode:
      | "redaction_receipt_missing" | "redaction_receipt_expired" | "redaction_scope_mismatch"
      | "sensitive_scan_incomplete" | "sensitive_content_residual" | "scanner_failed" }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function timestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

export function createBehaviorPolicySummaryProjection(input: {
  categories: BehaviorPolicySummaryCategory[]
  maxCategories: number
  maxRenderedCharacters: number
}): BehaviorPolicySummaryProjection {
  if (!Number.isSafeInteger(input.maxCategories) || input.maxCategories <= 0) throw new Error("maxCategories must be a positive integer.")
  if (!Number.isSafeInteger(input.maxRenderedCharacters) || input.maxRenderedCharacters < 80 || input.maxRenderedCharacters > 1_000) {
    throw new Error("maxRenderedCharacters must be between 80 and 1000.")
  }
  if (input.categories.length === 0 || input.categories.length > input.maxCategories) throw new Error("Behavior summary category count is invalid.")
  if (new Set(input.categories).size !== input.categories.length) throw new Error("Behavior summary categories must be unique.")
  if (input.categories.some((category) => !BEHAVIOR_POLICY_SUMMARY_CATEGORIES.includes(category))) {
    throw new Error("Behavior summary category is not allowed.")
  }
  return { schemaVersion: 1, projection: "behavior_policy_summary", categories: [...input.categories], maxRenderedCharacters: input.maxRenderedCharacters }
}

export function authorizeRedactedPromptDisclosure(input: {
  expectedSourceFingerprint: string
  expectedRedactedOutputFingerprint: string
  expectedPolicyVersion: string
  receipt?: PromptDisclosureRedactionReceipt
  now: number
}): PromptDisclosureRedactionDecision {
  const sourceFingerprint = required(input.expectedSourceFingerprint, "Expected source fingerprint")
  const outputFingerprint = required(input.expectedRedactedOutputFingerprint, "Expected redacted output fingerprint")
  const policyVersion = required(input.expectedPolicyVersion, "Expected redaction policy version")
  const now = timestamp(input.now, "Current time")
  const receipt = input.receipt
  if (!receipt) return { status: "blocked", reasonCode: "redaction_receipt_missing" }
  if (receipt.schemaVersion !== 1) throw new Error("Unsupported prompt disclosure redaction receipt schema version.")
  required(receipt.receiptId, "Redaction receipt ID")
  required(receipt.verifierRef, "Redaction verifier reference")
  timestamp(receipt.verifiedAt, "Redaction verification time")
  timestamp(receipt.expiresAt, "Redaction receipt expiry")
  if (receipt.verifiedAt > now || receipt.expiresAt <= now) return { status: "blocked", reasonCode: "redaction_receipt_expired" }
  if (receipt.sourceFingerprint !== sourceFingerprint || receipt.redactedOutputFingerprint !== outputFingerprint || receipt.policyVersion !== policyVersion) {
    return { status: "blocked", reasonCode: "redaction_scope_mismatch" }
  }
  if (!receipt.scannerSucceeded) return { status: "blocked", reasonCode: "scanner_failed" }
  const scanned = new Set(receipt.scannedCategories)
  if (scanned.size !== receipt.scannedCategories.length || PROMPT_DISCLOSURE_SENSITIVE_CATEGORIES.some((category) => !scanned.has(category))) {
    return { status: "blocked", reasonCode: "sensitive_scan_incomplete" }
  }
  if (receipt.residualCategories.length > 0) return { status: "blocked", reasonCode: "sensitive_content_residual" }
  if (!Number.isSafeInteger(receipt.replacementCount) || receipt.replacementCount < 0) throw new Error("replacementCount must be a non-negative integer.")
  return { status: "deliverable", receiptId: receipt.receiptId, redactedOutputFingerprint: outputFingerprint }
}

export async function deliverVerifiedRedactedPrompt<T>(input: {
  decision: PromptDisclosureRedactionDecision
  deliver: (decision: Extract<PromptDisclosureRedactionDecision, { status: "deliverable" }>) => Promise<T>
}): Promise<{ status: "delivered"; result: T } | Extract<PromptDisclosureRedactionDecision, { status: "blocked" }>> {
  if (input.decision.status !== "deliverable") return input.decision
  return { status: "delivered", result: await input.deliver(input.decision) }
}
