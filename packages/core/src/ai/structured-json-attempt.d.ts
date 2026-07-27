import type { AIProvider, ChatParams } from "./types.js";
export type StructuredJsonAttemptFailureStatus = "invalid_json" | "json_object_required" | "provider_failed" | "timed_out" | "cancelled" | "output_limit_exceeded";
export type StructuredJsonAttemptResult = {
    status: "parsed";
    value: Record<string, unknown>;
} | {
    status: StructuredJsonAttemptFailureStatus;
};
export declare class StructuredJsonAttemptError extends Error {
    readonly reasonCode: Exclude<StructuredJsonAttemptFailureStatus, "invalid_json" | "json_object_required">;
    constructor(reasonCode: Exclude<StructuredJsonAttemptFailureStatus, "invalid_json" | "json_object_required">);
}
interface StructuredJsonAttemptInput {
    provider: AIProvider;
    chatParams: ChatParams;
    deadlineMs: number;
    maxVisibleTextBytes: number;
}
export declare function collectStructuredJsonAttempt(input: StructuredJsonAttemptInput): Promise<StructuredJsonAttemptResult>;
export {};
//# sourceMappingURL=structured-json-attempt.d.ts.map