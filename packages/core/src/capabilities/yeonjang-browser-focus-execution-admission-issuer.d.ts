import type { YeonjangBrowserFocusTargetProjection } from "./yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusExecutionAdmission } from "./yeonjang-browser-focus-execution-admission.js";
import type { YeonjangExecutionAdmissionKeyPort } from "../yeonjang/execution-admission-key-port.js";
import type { YeonjangBrowserFocusExecutionAdmissionIssuerPort } from "../tools/types.js";
export type YeonjangBrowserFocusExecutionAdmissionIssueResult = {
    readonly ok: true;
    readonly admission: YeonjangBrowserFocusExecutionAdmission;
} | {
    readonly ok: false;
    readonly reasonCode: "browser_focus_execution_admission_key_unavailable" | "browser_focus_execution_admission_input_invalid" | "browser_focus_execution_admission_expired";
};
export declare function issueYeonjangBrowserFocusExecutionAdmission(input: {
    readonly extensionId: string;
    readonly sessionId?: string;
    readonly targetHash: string;
    readonly approvalScopeId: string;
    readonly expiresAt: string;
    readonly nonce: string;
    readonly now: Date;
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
}): YeonjangBrowserFocusExecutionAdmissionIssueResult;
export declare function createYeonjangBrowserFocusExecutionAdmissionIssuer(input: {
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
    readonly now: () => Date;
    readonly createNonce: () => string;
    readonly ttlMs: number;
}): YeonjangBrowserFocusExecutionAdmissionIssuerPort;
export declare function canonicalizeYeonjangBrowserFocusExecutionAdmission(input: Omit<YeonjangBrowserFocusExecutionAdmission, "signature">): string;
export declare function hashYeonjangBrowserFocusExecutionTarget(target: YeonjangBrowserFocusTargetProjection): `sha256:${string}`;
//# sourceMappingURL=yeonjang-browser-focus-execution-admission-issuer.d.ts.map