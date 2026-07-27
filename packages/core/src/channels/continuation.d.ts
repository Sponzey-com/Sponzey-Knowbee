import type { DbChannelMessageRef } from "../db/index.js";
import type { InboundEnvelope } from "./contracts.js";
export type ChannelContinuationLookupStatus = "resolved" | "ambiguous" | "not_found";
export type ChannelContinuationNoticeLanguage = "ko" | "en";
export type ChannelContinuationCandidateSource = "explicit_run_id" | "explicit_task_id" | "delivery_id" | "message_ref_exact" | "message_ref_parent";
export interface ChannelContinuationLookupCandidate {
    source: ChannelContinuationCandidateSource;
    runId: string;
    requestGroupId: string;
    sessionId?: string | undefined;
    messageRef?: DbChannelMessageRef | undefined;
    externalChatId?: string | undefined;
    externalThreadId?: string | null | undefined;
    externalMessageId?: string | undefined;
    deliveryKey?: string | undefined;
    confidence: "exact" | "high" | "medium" | "low";
    createdAt: number;
}
export interface ChannelContinuationConfirmationNotice {
    kind: "channel_continuation_confirmation_required";
    candidateCount: number;
    language: ChannelContinuationNoticeLanguage;
    text: string;
    deliveryMode: "receipt";
    textSource: "channel_continuation_control_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export interface ChannelContinuationLookupResult {
    status: ChannelContinuationLookupStatus;
    candidates: ChannelContinuationLookupCandidate[];
    selected?: ChannelContinuationLookupCandidate | undefined;
    confirmationRequired: boolean;
    confirmationNotice?: ChannelContinuationConfirmationNotice | undefined;
    confirmationPrompt?: string | undefined;
    reasonCode: "explicit_match" | "message_match" | "ambiguous_candidates" | "no_candidates";
}
export interface ChannelContinuationLookupInput {
    envelope: InboundEnvelope;
    taskId?: string | undefined;
    runId?: string | undefined;
    deliveryId?: string | undefined;
    lookupWindowMs?: number | undefined;
    language?: ChannelContinuationNoticeLanguage | undefined;
}
export declare function resolveChannelContinuation(input: ChannelContinuationLookupInput): ChannelContinuationLookupResult;
export declare function resolveChannelContinuationNoticeLanguage(languageCode: string | undefined): ChannelContinuationNoticeLanguage;
export declare function buildContinuationConfirmationNotice(candidates: ChannelContinuationLookupCandidate[], options?: {
    language?: ChannelContinuationNoticeLanguage | undefined;
}): ChannelContinuationConfirmationNotice;
export declare function buildContinuationConfirmationPrompt(candidates: ChannelContinuationLookupCandidate[], options?: {
    language?: ChannelContinuationNoticeLanguage | undefined;
}): string;
//# sourceMappingURL=continuation.d.ts.map