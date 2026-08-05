export type YeonjangPairingExecutionAdmissionBinding = {
    readonly extensionId: string;
};
export interface YeonjangPairingVerificationPort {
    verify(input: {
        readonly instanceId: string;
        readonly pairingSecret: string;
    }): {
        readonly ok: true;
        readonly binding: YeonjangPairingExecutionAdmissionBinding;
    } | {
        readonly ok: false;
        readonly reasonCode: string;
    };
}
export interface YeonjangExecutionAdmissionKeyProvisionerPort {
    provision(input: {
        readonly extensionId: string;
    }): {
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly reasonCode: string;
    };
    remove(input: {
        readonly extensionId: string;
    }): {
        readonly ok: true;
    } | {
        readonly ok: false;
    };
}
export interface YeonjangPairingTrustCommitterPort {
    approve(input: {
        readonly instanceId: string;
    }): {
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly reasonCode: string;
    };
}
export type YeonjangPairingExecutionAdmissionProvisioningResult = {
    readonly ok: true;
    readonly executionAdmissionKeyStatus: "ready";
} | {
    readonly ok: false;
    readonly reasonCode: "pairing_verification_failed" | "execution_admission_key_provision_failed" | "pairing_trust_commit_failed" | "pairing_trust_commit_compensation_failed";
};
export declare function approveYeonjangPairingWithExecutionAdmissionKey(input: {
    readonly instanceId: string;
    readonly pairingSecret: string;
    readonly verifier: YeonjangPairingVerificationPort;
    readonly keyProvisioner: YeonjangExecutionAdmissionKeyProvisionerPort;
    readonly trustCommitter: YeonjangPairingTrustCommitterPort;
}): YeonjangPairingExecutionAdmissionProvisioningResult;
//# sourceMappingURL=pairing-execution-admission-provisioning.d.ts.map