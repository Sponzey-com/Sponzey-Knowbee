import type { YeonjangBrowserFocusExecutionAdmissionIssuerPort } from "../tools/types.js";
import type { YeonjangExecutionAdmissionKeyProvisionerPort } from "./pairing-execution-admission-provisioning.js";
import { type YeonjangExecutionAuthorizationIssuerPort } from "./execution-authorization-receipt.js";
export interface BrowserFocusRuntimeBootstrapOptions {
    readonly trustedExtensionIds: readonly string[];
    readonly connectionPassword: string;
    readonly keyId?: string;
    readonly now?: () => Date;
    readonly createNonce?: () => string;
}
export interface BrowserFocusRuntimeBootstrap {
    readonly issuer?: YeonjangBrowserFocusExecutionAdmissionIssuerPort;
    readonly executionAuthorizationIssuer?: YeonjangExecutionAuthorizationIssuerPort;
    readonly pairingExecutionAdmissionKeyProvisioner?: YeonjangExecutionAdmissionKeyProvisionerPort;
}
/**
 * Produces immutable runtime dependencies at process startup. The only later
 * mutation is an approved pairing transaction that adds/removes its signer.
 */
export declare function createBrowserFocusRuntimeBootstrap(input: BrowserFocusRuntimeBootstrapOptions): BrowserFocusRuntimeBootstrap;
//# sourceMappingURL=browser-focus-runtime-bootstrap.d.ts.map