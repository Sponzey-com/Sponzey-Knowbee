import type { CanonicalPendingResponseReviewEnvelope } from "../contracts/canonical-pending-response.js";
import type { LlmResponseReviewReceipt, UserFacingResponseContentKind } from "./user-facing-response-gate.js";
import type { UserFacingTextSource } from "./loop-directive.js";
export declare function buildCanonicalPendingResponseReviewEnvelope(review: {
    rawText: string;
    rawTextSource: UserFacingTextSource;
    contentKind: UserFacingResponseContentKind;
    expectedLanguage: "ko" | "en" | "unknown";
    receipt: LlmResponseReviewReceipt;
}, terminalReportFingerprint?: `sha256:${string}`): CanonicalPendingResponseReviewEnvelope;
//# sourceMappingURL=canonical-pending-response-review.d.ts.map