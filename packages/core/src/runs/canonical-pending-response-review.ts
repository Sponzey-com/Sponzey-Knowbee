import { createHash } from "node:crypto"
import type { CanonicalPendingResponseReviewEnvelope } from "../contracts/canonical-pending-response.js"
import type { LlmResponseReviewReceipt, UserFacingResponseContentKind } from "./user-facing-response-gate.js"
import type { UserFacingTextSource } from "./loop-directive.js"

function sha256(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex")
}

export function buildCanonicalPendingResponseReviewEnvelope(
  review: {
    rawText: string
    rawTextSource: UserFacingTextSource
    contentKind: UserFacingResponseContentKind
    expectedLanguage: "ko" | "en" | "unknown"
    receipt: LlmResponseReviewReceipt
  },
  terminalReportFingerprint?: `sha256:${string}`,
): CanonicalPendingResponseReviewEnvelope {
  return {
    schemaVersion: 1,
    rawTextSha256: sha256(review.rawText),
    ...(terminalReportFingerprint ? { terminalReportFingerprint } : {}),
    rawTextSource: review.rawTextSource,
    contentKind: review.contentKind,
    expectedLanguage: review.expectedLanguage,
    receipt: { ...review.receipt },
  }
}
