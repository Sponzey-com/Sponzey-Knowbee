import { type BoundedChatAttemptFailureStatus, type BoundedChatAttemptResult } from "./bounded-chat-attempt.js";
import type { AIChunk } from "./types.js";
export type StructuredToolAttemptFailureStatus = BoundedChatAttemptFailureStatus | "response_tool_missing" | "response_tool_multiple" | "response_tool_name_invalid" | "response_tool_input_invalid";
export type StructuredToolAttemptResult = {
    status: "parsed";
    value: Record<string, unknown>;
} | Exclude<BoundedChatAttemptResult, {
    status: "completed";
}> | {
    status: Exclude<StructuredToolAttemptFailureStatus, BoundedChatAttemptFailureStatus>;
};
export declare function collectStructuredToolAttempt(input: {
    stream: (signal: AbortSignal) => AsyncGenerator<AIChunk>;
    signal?: AbortSignal;
    deadlineMs: number;
    responseToolName: string;
    maxTextBytes: number;
    maxToolInputBytes: number;
}): Promise<StructuredToolAttemptResult>;
//# sourceMappingURL=structured-tool-attempt.d.ts.map