export type YeonjangBrowserFocusExecutionAdmission = {
    readonly schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1";
    readonly method: "browser.focus";
    readonly extensionId: string;
    readonly sessionId?: string;
    readonly targetHash: string;
    readonly approvalScopeId: string;
    readonly expiresAt: string;
    readonly nonce: string;
    readonly signature: string;
};
export interface YeonjangBrowserFocusAdmissionSignatureVerifier {
    verify(input: {
        readonly admission: YeonjangBrowserFocusExecutionAdmission;
    }): boolean;
}
export interface YeonjangBrowserFocusAdmissionNonceStore {
    consume(input: {
        readonly nonce: string;
        readonly expiresAt: string;
    }): boolean;
}
export type YeonjangBrowserFocusExecutionAdmissionDecision = {
    readonly schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1";
    readonly method: "browser.focus";
    readonly status: "accepted" | "blocked";
    readonly reasonCode: "browser_focus_execution_admission_accepted" | "browser_focus_execution_admission_missing" | "browser_focus_execution_admission_method_invalid" | "browser_focus_execution_admission_target_mismatch" | "browser_focus_execution_admission_target_instance_mismatch" | "browser_focus_execution_admission_expired" | "browser_focus_execution_admission_signature_invalid" | "browser_focus_execution_admission_nonce_replayed";
    readonly executionAdmissionRef?: string;
    readonly invokeOsFocusNow: false;
    readonly userGoalSucceededNow: false;
};
export declare function evaluateYeonjangBrowserFocusExecutionAdmission(input: {
    readonly admission?: YeonjangBrowserFocusExecutionAdmission;
    readonly expectedTargetHash: string;
    readonly expectedExtensionId: string;
    readonly expectedSessionId?: string;
    readonly now: Date;
    readonly signatureVerifier: YeonjangBrowserFocusAdmissionSignatureVerifier;
    readonly nonceStore: YeonjangBrowserFocusAdmissionNonceStore;
}): YeonjangBrowserFocusExecutionAdmissionDecision;
//# sourceMappingURL=yeonjang-browser-focus-execution-admission.d.ts.map