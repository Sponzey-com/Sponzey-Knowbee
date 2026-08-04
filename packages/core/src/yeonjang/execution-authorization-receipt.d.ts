import type { YeonjangExecutionAdmissionKeyPort } from "./execution-admission-key-port.js";
export interface YeonjangAuthorizationReceipt {
    readonly schemaVersion: 1;
    readonly authorizationId: string;
    readonly issuer: string;
    readonly issuerKeyId: string;
    readonly audience: string;
    readonly method: string;
    readonly resourceScope: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly targetSessionId: string;
    readonly targetFingerprint: string;
    readonly idempotencyKey: string;
    readonly expiresAt: number;
    readonly proof: string;
}
export interface YeonjangExecutionAuthorizationGrant {
    readonly approvalId: string;
    readonly permissionScope: string;
    readonly decision: "allow_once" | "allow_run";
}
export type YeonjangExecutionAuthorizationIssueResult = {
    readonly ok: true;
    readonly receipt: YeonjangAuthorizationReceipt;
} | {
    readonly ok: false;
    readonly reasonCode: "execution_authorization_input_invalid" | "execution_authorization_key_unavailable" | "execution_authorization_expired" | "execution_authorization_proof_invalid";
};
export interface YeonjangExecutionAuthorizationIssuerPort {
    issue(input: {
        readonly extensionId: string;
        readonly targetSessionId: string;
        readonly method: string;
        readonly resourceScope: string;
        readonly commandId: string;
        readonly operationId: string;
        readonly targetFingerprint: string;
        readonly idempotencyKey: string;
        readonly expiresAt: number;
        readonly grant: YeonjangExecutionAuthorizationGrant;
    }): YeonjangExecutionAuthorizationIssueResult;
}
export declare function createYeonjangExecutionAuthorizationIssuer(input: {
    readonly issuer: string;
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
    readonly createAuthorizationId: () => string;
    readonly now?: () => number;
}): YeonjangExecutionAuthorizationIssuerPort;
export declare function canonicalizeYeonjangAuthorizationReceipt(input: Omit<YeonjangAuthorizationReceipt, "proof">): string;
//# sourceMappingURL=execution-authorization-receipt.d.ts.map