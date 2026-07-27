export type CanonicalPendingResponseTextSource =
  | "llm_generated"
  | "llm_reviewed"
  | "runtime_deterministic"
  | "user_supplied_literal"
  | "mixed"

export type CanonicalPendingResponseFinalOutcome =
  | "succeeded"
  | "partial"
  | "blocked"
  | "exhausted"
  | "cancelled"

export type CanonicalPendingResponseContentKind =
  | "direct_answer"
  | "planning"
  | "delegation"
  | "tool_result"
  | "yeonjang_result"
  | "sub_agent_result"
  | "prompt_improvement"
  | "final_report"
  | "safety_notice"
  | "system_status"
  | "validation_error"
  | "fixed_notice"

export interface CanonicalPendingResponseReviewReceiptV1 {
  schemaVersion: 1
  receiptId: string
  reviewedBy: "llm_final_response"
  promptSourceId: "final_response"
  contentKind: CanonicalPendingResponseContentKind
  rawTextSource: CanonicalPendingResponseTextSource
  rawTextSha256: string
  responseTextSha256: string
  responseLanguage: "ko" | "en" | "unknown"
}

export interface CanonicalPendingResponseReviewReceiptV2 {
  schemaVersion: 2
  receiptId: string
  reviewedBy: "llm_final_response"
  promptSourceId: "final_response"
  promptSourceIds: readonly ["task_intake", "final_response"]
  promptSourceFingerprints: {
    taskIntakeSha256: string
    finalResponseSha256: string
  }
  providerInvocationRef: string
  contentKind: "direct_answer"
  rawTextSource: "llm_generated"
  rawTextSha256: string
  responseTextSha256: string
  responseLanguage: "ko" | "en" | "unknown"
}

export type CanonicalPendingResponseReviewReceipt =
  | CanonicalPendingResponseReviewReceiptV1
  | CanonicalPendingResponseReviewReceiptV2

export interface CanonicalPendingResponseReviewEnvelope {
  schemaVersion: 1
  rawTextSha256: string
  terminalReportFingerprint?: `sha256:${string}` | undefined
  rawTextSource: CanonicalPendingResponseTextSource
  contentKind: CanonicalPendingResponseContentKind
  expectedLanguage: "ko" | "en" | "unknown"
  receipt: CanonicalPendingResponseReviewReceipt
}

export type CanonicalPendingResponseReviewIssue =
  | "review_envelope_missing"
  | "review_envelope_invalid"
  | "review_envelope_response_mismatch"
  | "review_envelope_terminal_report_missing"

export interface CanonicalPendingResponse {
  runId: string
  workId: string
  sessionId: string
  source: string
  text: string
  textSource: CanonicalPendingResponseTextSource
  finalOutcome: CanonicalPendingResponseFinalOutcome
  textFingerprint: `sha256:${string}`
  reviewEnvelope?: CanonicalPendingResponseReviewEnvelope | undefined
  reviewIssue?: CanonicalPendingResponseReviewIssue | undefined
  status: "pending" | "consumed"
  createdAt: number
  updatedAt: number
}
