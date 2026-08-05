import { type PublicTargetRejectionCode } from "../security/network-target-policy.js";
export type NetworkAddressResolver = (hostname: string) => Promise<readonly string[]>;
export type HttpFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export declare class NetworkTargetPolicyError extends Error {
    readonly code: PublicTargetRejectionCode | "dns_resolution_failed" | "redirect_cycle" | "redirect_limit_exceeded";
    constructor(code: PublicTargetRejectionCode | "dns_resolution_failed" | "redirect_cycle" | "redirect_limit_exceeded");
}
export declare function defaultNetworkAddressResolver(hostname: string): Promise<readonly string[]>;
export declare function fetchPublicHttp(input: {
    rawUrl: string;
    resolver: NetworkAddressResolver;
    fetcher: HttpFetcher;
    maxRedirects: number;
    signal?: AbortSignal;
}): Promise<{
    response: Response;
    effectiveUrl: string;
}>;
export declare function applyPublicTargetRouteGuard(input: {
    rawUrl: string;
    resolver: NetworkAddressResolver;
    continueRequest: () => Promise<unknown>;
    abortRequest: () => Promise<unknown>;
}): Promise<void>;
//# sourceMappingURL=public-http-fetch.d.ts.map