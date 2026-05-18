import { type YeonjangTargetSelector } from "./yeonjang-target.js";
export type YeonjangBroadcastToolName = "screen_capture" | "screen_find_text" | "shell_exec" | "mouse_action" | "keyboard_action";
export interface YeonjangBroadcastIntent {
    confirm: boolean;
    trustedOnly?: boolean;
    supportProfiles?: string[];
    requiredMethods?: string[];
}
export type YeonjangBroadcastRetryTargetStatus = "succeeded" | "failed" | "skipped";
export interface YeonjangBroadcastRetryReceiptTarget {
    instanceId: string;
    status: YeonjangBroadcastRetryTargetStatus;
    sessionId?: string | null;
}
export interface YeonjangBroadcastRetryReceiptSkippedTarget {
    instanceId: string;
    reasonCodes?: string[];
}
export interface YeonjangBroadcastRetryReceipt {
    previousBroadcastRunId?: string;
    retryMode?: "failed_only";
    targetReceipts?: YeonjangBroadcastRetryReceiptTarget[];
    skippedTargets?: YeonjangBroadcastRetryReceiptSkippedTarget[];
}
export interface YeonjangBroadcastIntentValidationIssue {
    path: string;
    code: "contract_validation_failed";
    message: string;
}
export type YeonjangBroadcastIntentValidationResult = {
    ok: true;
    value: YeonjangBroadcastIntent;
    issues: [];
} | {
    ok: false;
    issues: YeonjangBroadcastIntentValidationIssue[];
};
export type YeonjangBroadcastRetryReceiptValidationResult = {
    ok: true;
    value: YeonjangBroadcastRetryReceipt;
    issues: [];
} | {
    ok: false;
    issues: YeonjangBroadcastIntentValidationIssue[];
};
export declare function validateYeonjangBroadcastIntent(value: unknown): YeonjangBroadcastIntentValidationResult;
export declare function normalizeYeonjangBroadcastIntent(intent: YeonjangBroadcastIntent): YeonjangBroadcastIntent;
export declare function buildYeonjangBroadcastIntentSchemaProperty(): Record<string, unknown>;
export declare function normalizeYeonjangBroadcastRetryReceipt(receipt: YeonjangBroadcastRetryReceipt): YeonjangBroadcastRetryReceipt;
export declare function validateYeonjangBroadcastRetryReceipt(value: unknown): YeonjangBroadcastRetryReceiptValidationResult;
export declare function buildYeonjangBroadcastRetryReceiptSchemaProperty(): Record<string, unknown>;
export declare function isYeonjangBroadcastSelector(selector: YeonjangTargetSelector): boolean;
export declare function validateYeonjangBroadcastSelector(value: unknown): {
    ok: true;
    value: YeonjangTargetSelector;
} | {
    ok: false;
    issues: YeonjangBroadcastIntentValidationIssue[];
};
//# sourceMappingURL=yeonjang-broadcast.d.ts.map