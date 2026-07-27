export type IdentityClaimSubject = "main_agent" | "user" | "none";
export interface IdentityClaim {
    subject: IdentityClaimSubject;
    claimed_name: string;
}
export type IdentityClaimValidation = {
    ok: true;
} | {
    ok: false;
    reasonCode: "main_agent_name_mismatch" | "user_name_mismatch" | "user_name_unset";
};
export declare function validateIdentityClaim(input: {
    claim: IdentityClaim;
    mainAgentName: string;
    userName: string;
}): IdentityClaimValidation;
//# sourceMappingURL=identity-claim.d.ts.map