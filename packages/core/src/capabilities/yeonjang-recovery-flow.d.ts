export type YeonjangRecoveryFlowState = "idle" | "confirming" | "executing" | "verifying" | "active" | "failed" | "blocked";
export interface YeonjangRecoveryFlow {
    state: YeonjangRecoveryFlowState;
    action: "reconnect" | "check_permissions" | null;
    reasonCode: string | null;
}
export type YeonjangRecoveryFlowEvent = {
    type: "request";
    action: Exclude<YeonjangRecoveryFlow["action"], null>;
} | {
    type: "confirm";
} | {
    type: "execution_completed";
} | {
    type: "verification_succeeded";
} | {
    type: "verification_failed";
    reasonCode: string;
} | {
    type: "blocked";
    reasonCode: string;
} | {
    type: "cancel";
} | {
    type: "retry";
};
export declare const initialYeonjangRecoveryFlow: YeonjangRecoveryFlow;
export declare function reduceYeonjangRecoveryFlow(current: YeonjangRecoveryFlow, event: YeonjangRecoveryFlowEvent): YeonjangRecoveryFlow;
//# sourceMappingURL=yeonjang-recovery-flow.d.ts.map