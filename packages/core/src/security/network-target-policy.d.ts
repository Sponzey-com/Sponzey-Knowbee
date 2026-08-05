export type PublicTargetRejectionCode = "invalid_url" | "scheme_not_allowed" | "credentials_not_allowed" | "hostname_not_public" | "dns_result_empty" | "address_not_public";
export type PublicTargetDecision = {
    allowed: true;
    canonicalUrl: string;
    hostname: string;
} | {
    allowed: false;
    code: PublicTargetRejectionCode;
};
export interface PublicNetworkTargetInput {
    rawUrl: string;
    resolvedAddresses: readonly string[];
}
export declare function evaluatePublicNetworkTarget(input: PublicNetworkTargetInput): PublicTargetDecision;
//# sourceMappingURL=network-target-policy.d.ts.map