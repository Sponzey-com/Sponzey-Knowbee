import type { AIChunk } from "./types.js";
import { type AIProviderFailureReasonCode } from "./provider-failure.js";
export type BoundedChatAttemptFailureStatus = "provider_failed" | "timed_out" | "cancelled" | "output_limit_exceeded";
export type BoundedChatAttemptResult = {
    status: "completed";
    chunks: AIChunk[];
} | {
    status: "provider_failed";
    reasonCode: AIProviderFailureReasonCode;
} | {
    status: Exclude<BoundedChatAttemptFailureStatus, "provider_failed">;
};
export interface BoundedChatAttemptInput {
    stream: (signal: AbortSignal) => AsyncGenerator<AIChunk>;
    signal?: AbortSignal;
    deadlineMs: number;
    maxTextBytes: number;
    maxToolInputBytes: number;
}
export declare function collectBoundedChatAttempt(input: BoundedChatAttemptInput): Promise<BoundedChatAttemptResult>;
//# sourceMappingURL=bounded-chat-attempt.d.ts.map