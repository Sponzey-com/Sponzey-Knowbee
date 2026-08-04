export type YeonjangCommandAttemptTerminalStage = "rejected" | "handler_failed" | "helper_timeout" | "handler_timeout" | "cancelled" | "response_ready" | "response_timeout";
export type YeonjangCommandAttemptRetrySafety = "safe_same_command" | "change_strategy" | "unknown_effect_state" | "completed";
export interface YeonjangCommandAttemptEvidence {
    readonly schemaVersion: 1;
    readonly method: string;
    readonly commandId: string;
    readonly operationId?: string;
    readonly targetFingerprint?: `sha256:${string}`;
    readonly terminalStage: YeonjangCommandAttemptTerminalStage;
    readonly reasonCode: string;
    readonly retrySafety: YeonjangCommandAttemptRetrySafety;
}
interface YeonjangCommandAttemptWireV1 {
    readonly schema_version: 1;
    readonly method: string;
    readonly command_id: string;
    readonly operation_id?: string;
    readonly target_fingerprint?: string;
    readonly terminal_stage: YeonjangCommandAttemptTerminalStage;
    readonly reason_code: string;
    readonly retry_safety: YeonjangCommandAttemptRetrySafety;
}
export declare function parseYeonjangCommandAttemptEvidence(value: unknown): YeonjangCommandAttemptEvidence | null;
export type YeonjangResponseFailureInput = {
    readonly kind: "response_timeout";
    readonly method: string;
    readonly commandId: string;
    readonly lastObservedStage?: "received" | "handler_started" | "helper_started";
} | {
    readonly kind: "cancelled";
    readonly method: string;
    readonly commandId: string;
} | {
    readonly kind: "response_error";
    readonly method: string;
    readonly commandId: string;
    readonly error: {
        readonly code?: string;
        readonly message?: string;
    };
    readonly attempt?: unknown;
};
export interface YeonjangResponseFailureProjection {
    readonly code: string;
    readonly message: string;
    readonly attempt?: YeonjangCommandAttemptEvidence;
}
export declare function projectYeonjangResponseFailure(input: YeonjangResponseFailureInput): YeonjangResponseFailureProjection;
export type { YeonjangCommandAttemptWireV1 };
//# sourceMappingURL=command-attempt.d.ts.map