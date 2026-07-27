export type YeonjangExecutionAdmissionKeyHandle = {
    readonly keyId: string;
    readonly extensionId: string;
    readonly sessionId?: string;
    sign(input: {
        readonly canonicalPayload: string;
    }): string;
};
export interface YeonjangExecutionAdmissionKeyPort {
    resolve(input: {
        readonly extensionId: string;
        readonly sessionId?: string;
    }): YeonjangExecutionAdmissionKeyHandle | undefined;
}
export declare function createYeonjangExecutionAdmissionPasswordHandle(input: {
    readonly extensionId: string;
    readonly sessionId?: string;
    readonly keyId: string;
    readonly connectionPassword: string;
}): YeonjangExecutionAdmissionKeyHandle | undefined;
/**
 * Runtime key state changes only through an approved pairing transaction.
 * Request handling receives the read-only keyPort and cannot mutate this registry.
 */
export interface YeonjangExecutionAdmissionKeyRegistry {
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
    register(handle: YeonjangExecutionAdmissionKeyHandle): {
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly reasonCode: "execution_admission_key_bootstrap_invalid";
    };
    remove(input: {
        readonly extensionId: string;
        readonly sessionId?: string;
    }): void;
}
export type BootstrapYeonjangExecutionAdmissionKeyPortResult = {
    readonly ok: true;
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
} | {
    readonly ok: false;
    readonly reasonCode: "execution_admission_key_bootstrap_invalid" | "execution_admission_key_binding_duplicate";
};
export declare function createBootstrapYeonjangExecutionAdmissionKeyPort(input: {
    readonly handles: readonly YeonjangExecutionAdmissionKeyHandle[];
}): BootstrapYeonjangExecutionAdmissionKeyPortResult;
export declare function createYeonjangExecutionAdmissionKeyRegistry(input?: {
    readonly fallbackPorts?: readonly YeonjangExecutionAdmissionKeyPort[];
}): YeonjangExecutionAdmissionKeyRegistry;
export type YeonjangExecutionAdmissionKeyBinding = {
    readonly schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1";
    readonly status: "ready" | "blocked";
    readonly reasonCode: "execution_admission_key_ready" | "execution_admission_key_unavailable" | "execution_admission_key_binding_mismatch";
    readonly keyRef?: string;
};
export declare function bindYeonjangExecutionAdmissionKey(input: {
    readonly extensionId: string;
    readonly sessionId?: string;
    readonly keyPort: YeonjangExecutionAdmissionKeyPort;
}): YeonjangExecutionAdmissionKeyBinding;
//# sourceMappingURL=execution-admission-key-port.d.ts.map